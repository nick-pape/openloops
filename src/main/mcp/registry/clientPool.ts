/**
 * MCP Client Pool
 *
 * Manages MCP client connections, caching clients per server ID.
 * Handles reconnection on failure and health checking.
 */

import { createMCPClient } from '@ai-sdk/mcp'
import { McpServerId, McpServerConfig, McpServerStatus } from './types'
import { getServer } from './registry'
import { logger } from '../../logger'

export interface McpClientHandle {
  serverId: McpServerId
  client: Awaited<ReturnType<typeof createMCPClient>>
  tools(): Promise<any>
  close(): Promise<void>
}

// Cache of active clients
const clientCache = new Map<McpServerId, McpClientHandle>()

/**
 * Create an MCP client for a given server configuration
 */
async function createClientForServer(config: McpServerConfig): Promise<McpClientHandle> {
  logger.info('[MCP Client Pool] Creating client for server:', config.id, config.name)

  if (config.transport.kind !== 'streamableHttp') {
    throw new Error(`Transport kind ${config.transport.kind} not yet supported`)
  }

  const { url, headers } = config.transport

  try {
    // Create MCP client using AI SDK's integration
    const client = await createMCPClient({
      transport: {
        type: 'http',
        url,
        headers: headers || {}
      },
      name: `open-loops-${config.id}`,
      version: '1.0.0'
    })

    logger.info('[MCP Client Pool] Successfully connected to server:', config.id)

    // Create handle with tools method
    const handle: McpClientHandle = {
      serverId: config.id,
      client,
      async tools() {
        return await client.tools()
      },
      async close() {
        try {
          await client.close()
        } catch (error: any) {
          logger.warn('[MCP Client Pool] Error closing client:', config.id, error.message)
        }
      }
    }

    return handle
  } catch (error: any) {
    logger.error('[MCP Client Pool] Failed to connect to server:', config.id, error.message)
    throw new Error(`Failed to connect to MCP server ${config.id}: ${error.message}`)
  }
}

/**
 * Get or create an MCP client for a server
 * Clients are cached and reused
 */
export async function getClient(serverId: McpServerId): Promise<McpClientHandle> {
  // Check cache first
  const cached = clientCache.get(serverId)
  if (cached) {
    return cached
  }

  // Get server config
  const config = getServer(serverId)
  if (!config) {
    throw new Error(`MCP server not found: ${serverId}`)
  }

  if (!config.enabled) {
    throw new Error(`MCP server is disabled: ${serverId}`)
  }

  // Create new client
  const handle = await createClientForServer(config)

  // Cache it
  clientCache.set(serverId, handle)

  return handle
}

/**
 * Check if a server is healthy by attempting to list tools
 */
export async function healthCheck(serverId: McpServerId): Promise<McpServerStatus> {
  const config = getServer(serverId)
  if (!config) {
    return {
      id: serverId,
      connected: false,
      healthy: false,
      error: 'Server not found'
    }
  }

  try {
    const handle = await getClient(serverId)
    const tools = await handle.tools()

    return {
      id: serverId,
      connected: true,
      healthy: true,
      lastHealthCheck: new Date()
    }
  } catch (error: any) {
    return {
      id: serverId,
      connected: false,
      healthy: false,
      lastHealthCheck: new Date(),
      error: error.message
    }
  }
}

/**
 * Close a specific client and remove from cache
 */
export async function closeClient(serverId: McpServerId): Promise<void> {
  const handle = clientCache.get(serverId)
  if (handle) {
    await handle.close()
    clientCache.delete(serverId)
    logger.info('[MCP Client Pool] Closed client for server:', serverId)
  }
}

/**
 * Close all clients
 * Call this on app shutdown
 */
export async function closeAllClients(): Promise<void> {
  logger.info('[MCP Client Pool] Closing all clients...')
  const promises = Array.from(clientCache.values()).map(handle => handle.close())
  await Promise.allSettled(promises)
  clientCache.clear()
}

/**
 * Clear the client cache (forces reconnection on next getClient)
 */
export function clearCache(): void {
  clientCache.clear()
  logger.info('[MCP Client Pool] Cache cleared')
}

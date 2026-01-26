/**
 * Open Loops MCP Client for AI SDK Agent
 *
 * Architecture Decision: HTTP Client Transport for Internal Agent
 * ---------------------------------------------------------------
 * The agent connects to our local MCP HTTP server (localhost:3000/mcp) using
 * the official MCP SDK StreamableHTTPClientTransport.
 *
 * Why HTTP for internal agent access?
 * 1. **Consistent interface**: Same MCP protocol for both internal agent and external clients
 * 2. **Clean separation**: Agent doesn't need direct access to tool implementations
 * 3. **Official SDK support**: Uses @ai-sdk/mcp's createMCPClient() with streaming transport
 * 4. **Zero overhead**: Loopback connections are effectively free on localhost
 *
 * The HTTP server is always running for external agents anyway, so we reuse it
 * for the internal agent. This keeps the architecture simpler - one MCP server,
 * multiple clients (internal agent + external tools like Claude Desktop).
 *
 * Tool execution flows: Agent -> HTTP -> MCP Server -> Domain Commands -> DomainEvents -> UI
 */

import { createMCPClient } from '@ai-sdk/mcp'
import { logger } from '../../logger'
import Store from 'electron-store'

interface StoreSchema {
  mcpHttpPort?: number
  mcpAuthToken?: string
}

const store = new Store<StoreSchema>()

// Cache the MCP client and tools
let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null
let cachedTools: any = null

/**
 * Get the MCP server URL from settings
 * Falls back to default port 3000 if not configured
 */
function getMcpUrl(): string {
  const port = store.get('mcpHttpPort', 3000)
  return `http://localhost:${port}/mcp`
}

/**
 * Get auth token from settings (if configured)
 */
function getAuthToken(): string | undefined {
  return store.get('mcpAuthToken')
}

/**
 * Initialize MCP client connection
 * Connects to our local HTTP transport using AI SDK's MCP integration
 */
async function initMcpClient() {
  if (mcpClient) {
    return mcpClient
  }

  const url = getMcpUrl()
  const token = getAuthToken()

  logger.info('[MCP Client] Connecting to MCP server at', url)

  try {
    // Build headers with optional auth token
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
      logger.info('[MCP Client] Using auth token for MCP connection')
    }

    // Create MCP client using AI SDK's integration
    // This uses the simplified transport config (no need for StreamableHTTPClientTransport)
    mcpClient = await createMCPClient({
      transport: {
        type: 'http',
        url,
        headers
      },
      name: 'open-loops-agent',
      version: '1.0.0'
    })

    logger.info('[MCP Client] Successfully connected to MCP server')
    return mcpClient
  } catch (error: any) {
    logger.error('[MCP Client] Failed to connect to MCP server:', error.message)
    throw new Error(`Failed to connect to MCP server at ${url}: ${error.message}`)
  }
}

/**
 * Get Open Loops tools via MCP client
 *
 * Returns AI SDK-compatible tools that call our MCP server over HTTP.
 * Tools are cached after first fetch for performance.
 *
 * @returns Promise<ToolSet> - AI SDK tool set for use with streamText()
 */
export async function getOpenLoopsToolSet(): Promise<any> {
  // Return cached tools if available
  if (cachedTools) {
    logger.info('[MCP Client] Using cached tools')
    return cachedTools
  }

  try {
    // Initialize client if needed
    const client = await initMcpClient()

    // Get tools from MCP server
    logger.info('[MCP Client] Fetching tool definitions from MCP server...')
    const tools = await client.tools()

    logger.info('[MCP Client] Received', Object.keys(tools).length, 'tools:', Object.keys(tools).join(', '))

    // Cache for future use
    cachedTools = tools
    return tools
  } catch (error: any) {
    logger.error('[MCP Client] Failed to fetch tools:', error.message)

    // Clear client on error so we retry next time
    mcpClient = null
    cachedTools = null

    throw error
  }
}

/**
 * Clear the cached tools
 * Call this if tool definitions change at runtime
 */
export function clearMcpCache() {
  logger.info('[MCP Client] Clearing tool cache')
  cachedTools = null
}

/**
 * Close the MCP client connection
 * Should be called on app shutdown
 */
export async function closeMcpClient() {
  if (mcpClient) {
    logger.info('[MCP Client] Closing MCP client connection')
    try {
      await mcpClient.close()
    } catch (error: any) {
      logger.warn('[MCP Client] Error closing client:', error.message)
    }
    mcpClient = null
    cachedTools = null
  }
}

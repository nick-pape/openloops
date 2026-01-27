/**
 * MCP Toolset Composer
 *
 * Composes toolsets from multiple MCP servers into a single unified toolset.
 * Handles namespacing to avoid tool name collisions.
 */

import { McpServerId } from './types'
import { getClient } from './clientPool'
import { logger } from '../../logger'

export interface ToolsetMeta {
  serverId: McpServerId
  toolCount: number
}

/**
 * Get toolset for a single server
 */
export async function getToolSetForServer(serverId: McpServerId): Promise<{ tools: any; meta: ToolsetMeta }> {
  logger.info('[Toolset Composer] Getting tools for server:', serverId)

  try {
    const handle = await getClient(serverId)
    const tools = await handle.tools()

    const toolCount = Object.keys(tools).length
    logger.info('[Toolset Composer] Got', toolCount, 'tools from server:', serverId)

    return {
      tools,
      meta: {
        serverId,
        toolCount
      }
    }
  } catch (error: any) {
    logger.error('[Toolset Composer] Failed to get tools from server:', serverId, error.message)
    throw error
  }
}

/**
 * Compose toolsets from multiple servers
 *
 * Tools are namespaced by server ID to avoid collisions.
 * Example: "projects_list" from "openloops" becomes "openloops.projects_list"
 *
 * If only one server is provided and it's the built-in "openloops" server,
 * we keep tools un-namespaced for backward compatibility.
 */
export async function getToolSetForServers(
  serverIds: McpServerId[],
  options?: { skipNamespacing?: boolean }
): Promise<any> {
  if (serverIds.length === 0) {
    logger.warn('[Toolset Composer] No server IDs provided, returning empty toolset')
    return {}
  }

  logger.info('[Toolset Composer] Composing toolset from', serverIds.length, 'servers:', serverIds.join(', '))

  // Fetch tools from all servers in parallel
  const results = await Promise.allSettled(
    serverIds.map(id => getToolSetForServer(id))
  )

  const composedTools: any = {}
  let totalTools = 0

  // For backward compatibility: if only openloops server, don't namespace
  const shouldSkipNamespacing =
    options?.skipNamespacing ||
    (serverIds.length === 1 && serverIds[0] === 'openloops')

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const serverId = serverIds[i]

    if (result.status === 'fulfilled') {
      const { tools, meta } = result.value
      const toolNames = Object.keys(tools)

      logger.info('[Toolset Composer] Processing', toolNames.length, 'tools from server:', serverId)

      for (const toolName of toolNames) {
        const tool = tools[toolName]

        // Namespace the tool name to avoid collisions
        const namespacedName = shouldSkipNamespacing
          ? toolName
          : `${serverId}.${toolName}`

        if (composedTools[namespacedName]) {
          // Collision detected - this shouldn't happen with proper namespacing
          logger.error('[Toolset Composer] Tool name collision detected:', namespacedName)
          throw new Error(`Tool name collision: ${namespacedName} is defined by multiple servers`)
        }

        composedTools[namespacedName] = tool
        totalTools++
      }
    } else {
      logger.error('[Toolset Composer] Failed to get tools from server:', serverId, result.reason)
      // Don't fail the entire composition - just log and continue
      // This allows partial tool availability if some servers are down
    }
  }

  logger.info('[Toolset Composer] Composed toolset with', totalTools, 'total tools')

  return composedTools
}

/**
 * Get the default toolset (currently just OpenLoops MCP)
 */
export async function getDefaultToolSet(): Promise<any> {
  return getToolSetForServers(['openloops'])
}

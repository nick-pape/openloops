/**
 * MCP Server Registry
 *
 * Central registry for managing MCP server configurations.
 * Currently contains one built-in OpenLoops MCP server.
 * Architected to support user-provided MCP servers in the future.
 */

import Store from 'electron-store'
import { McpServerConfig, McpServerId } from './types'
import { logger } from '../../logger'

interface StoreSchema {
  mcpHttpPort?: number
  mcpAuthToken?: string
}

const store = new Store<StoreSchema>()

/**
 * Built-in OpenLoops MCP server configuration
 */
function getBuiltInOpenLoopsServer(): McpServerConfig {
  const port = store.get('mcpHttpPort', 3000)
  const token = store.get('mcpAuthToken')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return {
    id: 'openloops',
    name: 'OpenLoops MCP',
    description: 'Built-in MCP server for Open Loops (projects, captures, tasks)',
    isBuiltIn: true,
    enabled: true,
    transport: {
      kind: 'streamableHttp',
      url: `http://localhost:${port}/mcp`,
      headers
    },
    tags: ['built-in', 'local'],
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

/**
 * Get all registered MCP servers
 * Currently returns only the built-in OpenLoops server
 */
export function getAllServers(): McpServerConfig[] {
  return [getBuiltInOpenLoopsServer()]
}

/**
 * Get a specific MCP server by ID
 */
export function getServer(id: McpServerId): McpServerConfig | undefined {
  const servers = getAllServers()
  return servers.find(s => s.id === id)
}

/**
 * Get all enabled MCP servers
 */
export function getEnabledServers(): McpServerConfig[] {
  return getAllServers().filter(s => s.enabled)
}

/**
 * Check if a server exists
 */
export function hasServer(id: McpServerId): boolean {
  return getServer(id) !== undefined
}

// Future: Add methods for user-provided servers
// - addUserServer(config: Omit<McpServerConfig, 'id' | 'isBuiltIn'>)
// - updateServer(id: McpServerId, updates: Partial<McpServerConfig>)
// - removeServer(id: McpServerId)
// - enableServer(id: McpServerId)
// - disableServer(id: McpServerId)

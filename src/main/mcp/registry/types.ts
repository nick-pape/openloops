/**
 * MCP Registry Types
 *
 * Defines the structure for managing multiple MCP servers.
 * Currently supports one built-in OpenLoops MCP server, but architected to support N servers.
 */

export type McpServerId = string

export type McpTransportKind = 'streamableHttp' | 'stdio'

export interface McpHttpTransport {
  kind: 'streamableHttp'
  url: string
  headers?: Record<string, string>
}

export interface McpStdioTransport {
  kind: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
}

export type McpTransport = McpHttpTransport | McpStdioTransport

export interface McpServerConfig {
  id: McpServerId
  name: string
  description?: string
  isBuiltIn: boolean
  enabled: boolean
  transport: McpTransport
  tags?: string[]
  createdAt?: Date
  updatedAt?: Date
}

export interface McpServerStatus {
  id: McpServerId
  connected: boolean
  healthy?: boolean
  lastHealthCheck?: Date
  error?: string
}

export interface McpServerSummary extends McpServerConfig {
  status: McpServerStatus
}

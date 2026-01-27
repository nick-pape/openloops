/**
 * Agent Registry
 *
 * Defines agents that can be used in the app.
 * Agents reference MCP servers to get their toolsets.
 */

import { McpServerId } from './types'

export type AgentId = string

export interface AgentConfig {
  id: AgentId
  name: string
  description: string
  isBuiltIn: boolean
  enabled: boolean
  mcpServers: McpServerId[]
  tags?: string[]
  createdAt?: Date
  updatedAt?: Date
}

export interface AgentSummary extends AgentConfig {
  toolCount?: number
}

/**
 * Built-in OpenLoops agent configuration
 */
function getBuiltInOpenLoopsAgent(): AgentConfig {
  return {
    id: 'openloops-agent',
    name: 'OpenLoops Agent',
    description: 'Built-in agent for Open Loops (planner/projects/tasks/captures)',
    isBuiltIn: true,
    enabled: true,
    mcpServers: ['openloops'], // References the built-in OpenLoops MCP server
    tags: ['built-in', 'default'],
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

/**
 * Get all registered agents
 * Currently returns only the built-in OpenLoops agent
 */
export function getAllAgents(): AgentConfig[] {
  return [getBuiltInOpenLoopsAgent()]
}

/**
 * Get a specific agent by ID
 */
export function getAgent(id: AgentId): AgentConfig | undefined {
  const agents = getAllAgents()
  return agents.find(a => a.id === id)
}

/**
 * Get all enabled agents
 */
export function getEnabledAgents(): AgentConfig[] {
  return getAllAgents().filter(a => a.enabled)
}

/**
 * Get the default agent (currently OpenLoops agent)
 */
export function getDefaultAgent(): AgentConfig {
  return getBuiltInOpenLoopsAgent()
}

// Future: Add methods for user-provided agents
// - addUserAgent(config: Omit<AgentConfig, 'id' | 'isBuiltIn'>)
// - updateAgent(id: AgentId, updates: Partial<AgentConfig>)
// - removeAgent(id: AgentId)
// - enableAgent(id: AgentId)
// - disableAgent(id: AgentId)

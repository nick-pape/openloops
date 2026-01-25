/**
 * MCP Chat Infrastructure
 *
 * Phase 3: MCP server is running and ready for integration.
 *
 * NOTE: This file is a placeholder for future agent framework integration.
 * We are NOT implementing tool calling ourselves - waiting for an off-the-shelf
 * agent SDK that supports local LLMs (Ollama).
 *
 * Current status:
 * - ✅ MCP server running with stdio transport
 * - ✅ 12 tools available (projects, captures, tasks)
 * - ✅ Domain events emit on all mutations
 * - ⏳ Agent framework integration (blocked - no compatible SDK found yet)
 *
 * When integrating an agent framework:
 * 1. Install agent SDK (e.g., future version of Claude Agents SDK with custom baseUrl)
 * 2. Configure agent to use MCP stdio transport
 * 3. Replace simple chat handler with agent runtime
 * 4. Agent will automatically use MCP tools for operations
 */

// For now, export type for future use
export interface MCPChatConfig {
  projectId: string
  mcpServerEnabled: boolean
}

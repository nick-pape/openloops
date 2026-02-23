import { createClaudeCode } from 'ai-sdk-provider-claude-code'
import { LanguageModel } from 'ai'

/**
 * All MCP tool names exposed by the Open Loops MCP server,
 * prefixed with `mcp__openloops__` as Claude Code expects.
 */
const ALLOWED_MCP_TOOLS = [
  'mcp__openloops__projects_list',
  'mcp__openloops__projects_get',
  'mcp__openloops__projects_create',
  'mcp__openloops__projects_get_summary',
  'mcp__openloops__get_captures',
  'mcp__openloops__get_capture_by_id',
  'mcp__openloops__captures_create_text',
  'mcp__openloops__captures_create_decision',
  'mcp__openloops__tasks_list',
  'mcp__openloops__tasks_get',
  'mcp__openloops__tasks_create',
  'mcp__openloops__tasks_update',
  'mcp__openloops__tasks_list_candidates_for_day',
  'mcp__openloops__calendar_day_events_get',
  'mcp__openloops__planning_profiles_list',
  'mcp__openloops__planning_profiles_get',
  'mcp__openloops__planning_profiles_create',
  'mcp__openloops__planning_profiles_update',
  'mcp__openloops__planning_profiles_delete',
  'mcp__openloops__planner_day_get',
  'mcp__openloops__planner_draft_create',
  'mcp__openloops__planner_draft_get',
  'mcp__openloops__planner_draft_discard',
  'mcp__openloops__planner_block_add',
  'mcp__openloops__planner_block_update',
  'mcp__openloops__planner_block_move',
  'mcp__openloops__planner_block_delete',
  'mcp__openloops__planner_draft_validate',
  'mcp__openloops__planner_draft_commit',
  'mcp__openloops__planner_draft_uncommit',
]

/**
 * Built-in Claude Code tools that must NOT be used.
 * Claude Code should only interact via MCP domain tools.
 */
const DISALLOWED_BUILTIN_TOOLS = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'LS',
  'NotebookEdit',
  'NotebookRead',
  'WebFetch',
  'WebSearch',
  'Task',
  'TodoWrite',
  'TodoRead',
]

/**
 * Create an AI SDK model backed by Claude Code.
 *
 * Claude Code connects to the app's MCP HTTP server directly and
 * executes domain tools internally. The caller should NOT pass
 * tools to streamText() — the provider handles them.
 */
export function createClaudeCodeModel(config: {
  model: string
  mcpUrl: string
  mcpAuthToken?: string
  systemPrompt: string
}): LanguageModel {
  console.log('[Claude Code] Creating model')
  console.log('[Claude Code] Model:', config.model)
  console.log('[Claude Code] MCP URL:', config.mcpUrl)

  const headers: Record<string, string> = {}
  if (config.mcpAuthToken) {
    headers['Authorization'] = `Bearer ${config.mcpAuthToken}`
  }

  const provider = createClaudeCode({
    defaultSettings: {
      systemPrompt: config.systemPrompt,
      mcpServers: {
        openloops: {
          type: 'http',
          url: config.mcpUrl,
          headers,
        },
      },
      allowedTools: ALLOWED_MCP_TOOLS,
      disallowedTools: DISALLOWED_BUILTIN_TOOLS,
      permissionMode: 'bypassPermissions',
      persistSession: false,
    },
  })

  return provider(config.model)
}

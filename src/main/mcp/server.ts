import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { allTools } from './tools/index.js'

/**
 * Open Loops MCP Server
 *
 * Exposes app primitives as MCP tools for:
 * - Internal agentic chat
 * - External agents (Claude Desktop, Goose, etc.)
 *
 * Tool execution flows through domain commands, emitting events for UI updates.
 */

export function createMCPServer() {
  const server = new Server(
    {
      name: 'open-loops',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  )

  // Build tool map ONCE (not in loop - critical bug fix!)
  const toolMap = new Map(allTools.map(t => [t.definition.name, t]))

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools.map(({ definition }) => ({
        name: definition.name,
        description: definition.description,
        inputSchema: zodToJsonSchema(definition.inputSchema as any)
      }))
    }
  })

  // Register SINGLE tool call handler with dispatch by name
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name
    const toolEntry = toolMap.get(toolName)

    if (!toolEntry) {
      throw new Error(`Unknown tool: ${toolName}`)
    }

    try {
      // Validate input with Zod
      const args = toolEntry.definition.inputSchema.parse(request.params.arguments ?? {})

      // Execute tool handler
      console.log(`[MCP] Executing tool: ${toolName}`, args)
      const result = await toolEntry.handler(args)

      console.log(`[MCP] Tool ${toolName} completed successfully`)
      return result
    } catch (error) {
      console.error(`[MCP] Tool ${toolName} error:`, error)

      // Return error as MCP content
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
            tool: toolName
          }, null, 2)
        }],
        isError: true
      }
    }
  })

  return server
}

/**
 * Start MCP server with stdio transport (for in-process communication)
 */
export async function startStdioServer() {
  const server = createMCPServer()
  const transport = new StdioServerTransport()

  console.log('[MCP] Starting stdio server...')
  await server.connect(transport)
  console.log('[MCP] Stdio server started - ready for tool calls')

  return server
}

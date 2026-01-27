/**
 * Open Loops Agent
 *
 * Multi-step tool-calling agent using AI SDK's streamText with maxSteps.
 *
 * Architecture:
 * - Uses AI SDK's streamText() with maxSteps parameter for multi-turn tool execution
 * - Connects to our MCP HTTP server (localhost:3000/mcp) via @ai-sdk/mcp client
 * - Streams text deltas, tool calls, and tool results to the renderer over IPC
 * - Tool execution triggers DomainEvents for app-wide state sync (UI updates)
 *
 * The agent loop (managed by AI SDK's streamText) works as follows:
 * 1. Send messages + tools to the model
 * 2. Model responds with text and/or tool calls
 * 3. AI SDK automatically executes tool calls via MCP HTTP transport
 * 4. Tool results are added to context, model generates next response
 * 5. Loop continues until model stops calling tools or maxSteps reached
 *
 * We use AI SDK's built-in tool loop instead of building a custom agent framework.
 * This gives us streaming, proper error handling, and step limiting out of the box.
 */

import { streamText, LanguageModel, stepCountIs } from 'ai'
import { ModelMessage } from '@ai-sdk/provider-utils'
import { getToolSetForServers } from '../../mcp/registry/toolsetComposer'
import { logger } from '../../logger'

/**
 * Events emitted during agent execution
 */
export type AgentStreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-input-start'; toolCallId: string; toolName: string }
  | { type: 'tool-input-delta'; toolCallId: string; delta: string }
  | { type: 'tool-call-complete'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
  | { type: 'step-finish'; stepNumber: number; finishReason: string }
  | { type: 'finish'; finishReason: string; totalSteps: number; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }
  | { type: 'error'; error: string }

export interface AgentConfig {
  model: LanguageModel
  maxSteps?: number
  temperature?: number
  maxOutputTokens?: number
}

export interface AgentRunOptions {
  messages: ModelMessage[]
  systemPrompt?: string
  abortSignal?: AbortSignal
}

/**
 * Run the Open Loops agent with streaming output
 *
 * This is an async generator that yields events as the agent executes.
 * The caller can iterate over events to update the UI in real-time.
 */
export async function* runAgentStream(
  config: AgentConfig,
  options: AgentRunOptions
): AsyncGenerator<AgentStreamEvent> {
  const { model, maxSteps = 15, temperature = 0.7, maxOutputTokens = 4000 } = config
  const { messages, systemPrompt, abortSignal } = options

  try {
    // Get tools from MCP servers via toolset composer
    // Currently just the built-in 'openloops' server, but architected for N servers
    logger.info('[Agent] Getting tools from MCP servers...')
    let tools: any

    try {
      // Request toolset for the default agent (currently just 'openloops' server)
      tools = await getToolSetForServers(['openloops'])
      logger.info('[Agent] Got', Object.keys(tools).length, 'tools')
    } catch (toolError: any) {
      logger.warn('[Agent] Failed to get MCP tools, running without tools:', toolError.message)
      tools = {}
    }

    // Build messages with optional system prompt
    const fullMessages: ModelMessage[] = []
    if (systemPrompt) {
      fullMessages.push({ role: 'system', content: systemPrompt })
    }
    fullMessages.push(...messages)

    logger.info('[Agent] Starting stream with', fullMessages.length, 'messages, maxSteps:', maxSteps)

    // Use AI SDK's streamText with stopWhen for multi-turn tool execution
    const result = streamText({
      model,
      messages: fullMessages,
      tools,
      stopWhen: stepCountIs(maxSteps),
      temperature,
      maxOutputTokens,
      abortSignal,
      // Provider options for Ollama (passed through OpenAI-compatible interface)
      providerOptions: {
        openai: {
          body: {
            options: {
              num_ctx: 16384 // Increase context window to 16k tokens
            }
          }
        }
      },
      // Called when a step finishes
      onStepFinish: ({ finishReason }) => {
        logger.info('[Agent] Step finished, reason:', finishReason)
      },
    })

    let stepNumber = 0

    // Stream the full response including tool calls and results
    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          yield { type: 'text-delta', delta: part.text }
          break

        case 'tool-input-start':
          // Tool call is starting - we get the tool name
          logger.info('[Agent] Tool input starting:', part.toolName, 'id:', part.id)
          yield {
            type: 'tool-input-start',
            toolCallId: part.id,
            toolName: part.toolName,
          }
          break

        case 'tool-input-delta':
          // Streaming tool call arguments
          yield {
            type: 'tool-input-delta',
            toolCallId: part.id,
            delta: part.delta,
          }
          break

        case 'tool-call':
          // Tool call is complete (we have full input)
          logger.info('[Agent] Tool call complete:', part.toolName, 'id:', part.toolCallId)
          yield {
            type: 'tool-call-complete',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
          }
          break

        case 'tool-result':
          logger.info('[Agent] Tool result for:', part.toolName)
          yield {
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: part.output,
          }
          break

        case 'finish-step':
          stepNumber++
          logger.info('[Agent] Step', stepNumber, 'finished:', part.finishReason)
          yield {
            type: 'step-finish',
            stepNumber,
            finishReason: part.finishReason,
          }
          break

        case 'finish':
          logger.info('[Agent] Stream finished:', part.finishReason)
          // Final event handled after loop
          break

        case 'error':
          logger.error('[Agent] Stream error:', part.error)
          yield { type: 'error', error: String(part.error) }
          break
      }
    }

    // Get final usage stats
    const usage = await result.usage
    const finalFinishReason = await result.finishReason

    yield {
      type: 'finish',
      finishReason: finalFinishReason,
      totalSteps: stepNumber,
      usage: usage ? {
        promptTokens: usage.inputTokens || 0,
        completionTokens: usage.outputTokens || 0,
        totalTokens: (usage.inputTokens || 0) + (usage.outputTokens || 0),
      } : undefined,
    }

  } catch (error: any) {
    logger.error('[Agent] Error:', error.message)
    yield { type: 'error', error: error.message }
  }
}

/**
 * Simple wrapper for non-streaming agent execution
 * Returns the final text and all tool calls/results
 */
export async function runAgent(
  config: AgentConfig,
  options: AgentRunOptions
): Promise<{
  text: string
  toolCalls: Array<{ toolName: string; input: unknown; output: unknown }>
  finishReason: string
}> {
  let text = ''
  const toolCalls: Array<{ toolName: string; input: unknown; output: unknown }> = []
  let finishReason = 'unknown'
  const pendingToolCalls = new Map<string, { toolName: string; input: unknown }>()

  for await (const event of runAgentStream(config, options)) {
    switch (event.type) {
      case 'text-delta':
        text += event.delta
        break
      case 'tool-call-complete':
        pendingToolCalls.set(event.toolCallId, { toolName: event.toolName, input: event.input })
        break
      case 'tool-result':
        const pending = pendingToolCalls.get(event.toolCallId)
        if (pending) {
          toolCalls.push({ ...pending, output: event.output })
          pendingToolCalls.delete(event.toolCallId)
        }
        break
      case 'finish':
        finishReason = event.finishReason
        break
    }
  }

  return { text, toolCalls, finishReason }
}

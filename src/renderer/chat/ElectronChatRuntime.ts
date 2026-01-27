import { ChatMessage, ToolCall, ChatContext } from '../../types'

/**
 * ElectronChatRuntime - Custom runtime adapter for assistant-ui
 *
 * This runtime manages chat state and communicates with the Electron main process
 * via IPC. It provides a simple interface for assistant-ui components.
 *
 * Supports streaming responses via AI SDK and MCP tool calls.
 * Now context-aware: messages are sent with current page context.
 */
export class ElectronChatRuntime {
  private messages: ChatMessage[] = []
  private subscribers: Set<() => void> = new Set()
  private isLoading: boolean = false
  private currentStreamId: string | null = null
  private streamingMessageIndex: number = -1
  private activeToolCalls: Map<string, ToolCall> = new Map()
  private cleanupStarted: (() => void) | null = null
  private cleanupDelta: (() => void) | null = null
  private cleanupDone: (() => void) | null = null
  private cleanupToolCall: (() => void) | null = null
  private cleanupToolResult: (() => void) | null = null
  private cleanupError: (() => void) | null = null

  constructor() {
    console.log('[ElectronChatRuntime] Constructor called')
    this.setupStreamingListeners()
  }

  /**
   * Set up listeners for streaming events
   */
  private setupStreamingListeners() {
    console.log('[ElectronChatRuntime] Setting up streaming listeners')

    // Listen for stream start
    this.cleanupStarted = window.electron.chat.onStarted((data) => {
      console.log('[ElectronChatRuntime] Received started:', data.streamId, 'current:', this.currentStreamId)
    })

    // Listen for streaming deltas
    this.cleanupDelta = window.electron.chat.onDelta((data) => {
      if (data.streamId === this.currentStreamId && this.streamingMessageIndex >= 0) {
        // Append delta to the current streaming message
        this.messages[this.streamingMessageIndex].content += data.delta
        this.notifySubscribers()
      }
    })

    // Listen for stream completion
    this.cleanupDone = window.electron.chat.onDone((data) => {
      console.log('[ElectronChatRuntime] Received done:', data.streamId)
      if (data.streamId === this.currentStreamId) {
        this.activeToolCalls.clear()
        this.isLoading = false
        this.currentStreamId = null
        this.streamingMessageIndex = -1
        this.notifySubscribers()
      }
    })

    // Listen for tool calls (agent mode)
    this.cleanupToolCall = window.electron.chat.onToolCall((data: any) => {
      if (data.streamId === this.currentStreamId) {
        console.log('[ElectronChatRuntime] Tool call:', data.toolName, 'status:', data.status)

        // Track tool call state
        const toolCall: ToolCall = {
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          status: data.status as 'started' | 'executing' | 'completed',
          args: data.input || data.args // Support both old and new format
        }
        this.activeToolCalls.set(data.toolCallId, toolCall)

        // Add tool call to the assistant message
        if (this.streamingMessageIndex >= 0) {
          const message = this.messages[this.streamingMessageIndex]
          if (!message.toolCalls) {
            message.toolCalls = []
          }
          // Check if this tool call already exists
          const existingIndex = message.toolCalls.findIndex(tc => tc.toolCallId === data.toolCallId)
          if (existingIndex >= 0) {
            message.toolCalls[existingIndex] = toolCall
          } else {
            message.toolCalls.push(toolCall)
          }
          this.notifySubscribers()
        }
      }
    })

    // Listen for tool results (agent mode)
    this.cleanupToolResult = window.electron.chat.onToolResult((data: any) => {
      if (data.streamId === this.currentStreamId) {
        console.log('[ElectronChatRuntime] Tool result:', data.toolName)

        // Update tool call state
        const toolCall = this.activeToolCalls.get(data.toolCallId)
        if (toolCall) {
          toolCall.status = 'completed'
          toolCall.result = data.output || data.result // Support both old and new format

          // Update in message's toolCalls array
          if (this.streamingMessageIndex >= 0) {
            const message = this.messages[this.streamingMessageIndex]
            if (message.toolCalls) {
              const existingIndex = message.toolCalls.findIndex(tc => tc.toolCallId === data.toolCallId)
              if (existingIndex >= 0) {
                message.toolCalls[existingIndex] = toolCall
              }
            }
            this.notifySubscribers()
          }
        }
      }
    })

    // Listen for errors
    this.cleanupError = window.electron.chat.onError((data) => {
      if (data.streamId === this.currentStreamId) {
        console.error('[ElectronChatRuntime] Error:', data.error)
        if (this.streamingMessageIndex >= 0) {
          this.messages[this.streamingMessageIndex].content += `\n\n❌ Error: ${data.error}`
          this.notifySubscribers()
        }
      }
    })
  }

  /**
   * Cleanup listeners when runtime is disposed
   */
  dispose() {
    if (this.cleanupStarted) this.cleanupStarted()
    if (this.cleanupDelta) this.cleanupDelta()
    if (this.cleanupDone) this.cleanupDone()
    if (this.cleanupToolCall) this.cleanupToolCall()
    if (this.cleanupToolResult) this.cleanupToolResult()
    if (this.cleanupError) this.cleanupError()
  }

  /**
   * Get active tool calls (for UI display)
   */
  getActiveToolCalls(): ToolCall[] {
    return Array.from(this.activeToolCalls.values())
  }

  /**
   * Get current messages
   */
  getMessages(): ChatMessage[] {
    return this.messages
  }

  /**
   * Check if currently loading
   */
  getIsLoading(): boolean {
    return this.isLoading
  }

  /**
   * Subscribe to state changes
   */
  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback)
    console.log('[ElectronChatRuntime] Subscriber added, total:', this.subscribers.size)
    return () => {
      this.subscribers.delete(callback)
      console.log('[ElectronChatRuntime] Subscriber removed, total:', this.subscribers.size)
    }
  }

  /**
   * Notify all subscribers of state change
   */
  private notifySubscribers() {
    console.log('[ElectronChatRuntime] notifySubscribers called, subscriber count:', this.subscribers.size)
    this.subscribers.forEach(cb => cb())
  }

  /**
   * Send a message and get streaming response
   */
  async sendMessage(content: string, context: ChatContext): Promise<void> {
    // Add user message with context
    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      context: {
        type: context.active.type,
        label: context.active.label,
        color: context.active.color
      }
    }

    this.messages.push(userMessage)

    // Create placeholder for assistant response (will be filled by streaming)
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    }
    this.messages.push(assistantMessage)
    this.streamingMessageIndex = this.messages.length - 1

    this.isLoading = true
    this.currentStreamId = `chat-${Date.now()}`
    this.notifySubscribers()

    try {
      // Send to backend with context - streaming deltas will update the message via events
      const response = await window.electron.chat.send(
        this.messages.slice(0, -1), // Don't send the empty assistant message
        context,
        this.currentStreamId!
      )

      // Update final message content (in case we missed any deltas)
      if (this.streamingMessageIndex >= 0) {
        this.messages[this.streamingMessageIndex] = response
      }

      this.isLoading = false
      this.currentStreamId = null
      this.streamingMessageIndex = -1
      this.notifySubscribers()
    } catch (error) {
      console.error('[ElectronChatRuntime] Error sending message:', error)

      // Update the placeholder with error message
      if (this.streamingMessageIndex >= 0) {
        this.messages[this.streamingMessageIndex] = {
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
          timestamp: new Date().toISOString()
        }
      }

      this.isLoading = false
      this.currentStreamId = null
      this.streamingMessageIndex = -1
      this.notifySubscribers()
    }
  }

  /**
   * Stop the current generation
   */
  async stopGeneration(): Promise<void> {
    if (this.currentStreamId) {
      await window.electron.chat.cancel(this.currentStreamId)
      this.isLoading = false
      this.currentStreamId = null
      this.streamingMessageIndex = -1
      this.notifySubscribers()
    }
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = []
    this.notifySubscribers()
  }

  /**
   * Get message count
   */
  getMessageCount(): number {
    return this.messages.length
  }
}

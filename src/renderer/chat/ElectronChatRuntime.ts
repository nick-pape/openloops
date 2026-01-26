import { ChatMessage } from '../../types'

/**
 * ElectronChatRuntime - Custom runtime adapter for assistant-ui
 *
 * This runtime manages chat state and communicates with the Electron main process
 * via IPC. It provides a simple interface for assistant-ui components.
 *
 * Supports streaming responses via AI SDK.
 */
export class ElectronChatRuntime {
  private projectId: string
  private messages: ChatMessage[] = []
  private subscribers: Set<() => void> = new Set()
  private isLoading: boolean = false
  private currentStreamId: string | null = null
  private streamingMessageIndex: number = -1
  private cleanupStarted: (() => void) | null = null
  private cleanupDelta: (() => void) | null = null
  private cleanupDone: (() => void) | null = null

  constructor(projectId: string) {
    this.projectId = projectId
    console.log('[ElectronChatRuntime] Constructor called, projectId:', projectId)
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
      console.log('[ElectronChatRuntime] Received delta:', data.streamId, 'current:', this.currentStreamId, 'delta length:', data.delta?.length)
      if (data.streamId === this.currentStreamId && this.streamingMessageIndex >= 0) {
        // Append delta to the current streaming message
        this.messages[this.streamingMessageIndex].content += data.delta
        console.log('[ElectronChatRuntime] Updated message, new length:', this.messages[this.streamingMessageIndex].content.length)
        this.notifySubscribers()
      }
    })

    // Listen for stream completion
    this.cleanupDone = window.electron.chat.onDone((data) => {
      console.log('[ElectronChatRuntime] Received done:', data.streamId)
      if (data.streamId === this.currentStreamId) {
        this.isLoading = false
        this.currentStreamId = null
        this.streamingMessageIndex = -1
        this.notifySubscribers()
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
  async sendMessage(content: string): Promise<void> {
    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString()
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
    this.currentStreamId = `${this.projectId}-${Date.now()}`
    this.notifySubscribers()

    try {
      // Send to backend - streaming deltas will update the message via events
      const response = await window.electron.chat.send(
        this.projectId,
        this.messages.slice(0, -1), // Don't send the empty assistant message
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

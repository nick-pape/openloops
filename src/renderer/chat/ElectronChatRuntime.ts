import { ChatMessage } from '../../types'

/**
 * ElectronChatRuntime - Custom runtime adapter for assistant-ui
 *
 * This runtime manages chat state and communicates with the Electron main process
 * via IPC. It provides a simple interface for assistant-ui components.
 */
export class ElectronChatRuntime {
  private projectId: string
  private messages: ChatMessage[] = []
  private subscribers: Set<() => void> = new Set()
  private isLoading: boolean = false

  constructor(projectId: string) {
    this.projectId = projectId
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
    return () => {
      this.subscribers.delete(callback)
    }
  }

  /**
   * Notify all subscribers of state change
   */
  private notifySubscribers() {
    this.subscribers.forEach(cb => cb())
  }

  /**
   * Send a message and get response
   */
  async sendMessage(content: string): Promise<void> {
    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    }

    this.messages.push(userMessage)
    this.isLoading = true
    this.notifySubscribers()

    try {
      // Send to backend and get assistant response
      const response = await window.electron.chat.send(this.projectId, this.messages)

      // Add assistant response
      this.messages.push(response)
      this.isLoading = false
      this.notifySubscribers()
    } catch (error) {
      console.error('[ElectronChatRuntime] Error sending message:', error)

      // Add error message
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        timestamp: new Date().toISOString()
      }

      this.messages.push(errorMessage)
      this.isLoading = false
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

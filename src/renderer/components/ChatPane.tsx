import { useState, useEffect, useRef } from 'react'
import { ElectronChatRuntime } from '../chat/ElectronChatRuntime'
import { ChatMessage } from './ChatMessage'
import './ChatPane.css'

interface ChatPaneProps {
  projectId: string
  isCollapsed: boolean
  onToggle: () => void
}

export function ChatPane({ projectId, isCollapsed, onToggle }: ChatPaneProps) {
  const runtimeRef = useRef<ElectronChatRuntime | null>(null)
  const [, setUpdateTrigger] = useState(0)
  const [inputValue, setInputValue] = useState('')
  const [showCommitMenu, setShowCommitMenu] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Initialize runtime and cleanup on unmount or projectId change
  useEffect(() => {
    // Create new runtime
    const runtime = new ElectronChatRuntime(projectId)
    runtimeRef.current = runtime

    const unsubscribe = runtime.subscribe(() => {
      setUpdateTrigger(prev => prev + 1)
    })

    return () => {
      unsubscribe()
      runtime.dispose()
      runtimeRef.current = null
    }
  }, [projectId])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [runtimeRef.current?.getMessageCount()])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!runtimeRef.current || !inputValue.trim() || runtimeRef.current.getIsLoading()) return

    const message = inputValue.trim()
    setInputValue('')
    await runtimeRef.current.sendMessage(message)
  }

  const handleCommitAction = async (action: string) => {
    setShowCommitMenu(false)
    if (!runtimeRef.current) return

    try {
      const messages = runtimeRef.current.getMessages()

      switch (action) {
        case 'save':
          await window.electron.chat.save(projectId, messages)
          alert('Chat saved to captures!')
          break

        case 'tasks':
          await window.electron.chat.extractTasks(projectId, messages)
          alert('Task extraction job enqueued!')
          break

        case 'decisions':
          await window.electron.chat.extractDecisions(projectId, messages)
          alert('Decision extraction job enqueued!')
          break

        case 'summary':
          await window.electron.chat.updateSummary(projectId)
          alert('Summary regeneration enqueued!')
          break
      }
    } catch (error) {
      console.error('[ChatPane] Commit action error:', error)
      alert(`Failed to ${action}: ${error}`)
    }
  }

  if (isCollapsed) {
    return (
      <div className="chat-pane collapsed">
        <button className="chat-toggle-btn" onClick={onToggle} title="Open Chat">
          💬
        </button>
      </div>
    )
  }

  const messages = runtimeRef.current?.getMessages() ?? []
  const isLoading = runtimeRef.current?.getIsLoading() ?? false

  return (
    <div className="chat-pane expanded">
      <div className="chat-header">
        <h2>💬 Chat</h2>
        <div className="chat-header-actions">
          <div className="commit-menu-container">
            <button
              className="commit-btn"
              onClick={() => setShowCommitMenu(!showCommitMenu)}
              disabled={messages.length === 0}
            >
              Commit ▼
            </button>
            {showCommitMenu && (
              <div className="commit-menu">
                <button onClick={() => handleCommitAction('save')}>
                  💾 Save Chat
                </button>
                <button onClick={() => handleCommitAction('tasks')}>
                  ✓ Extract Tasks
                </button>
                <button onClick={() => handleCommitAction('decisions')}>
                  📝 Extract Decisions
                </button>
              </div>
            )}
          </div>
          <button className="clear-btn" onClick={() => runtimeRef.current?.clearMessages()} disabled={messages.length === 0}>
            🗑️
          </button>
          <button className="close-btn" onClick={onToggle}>
            ✕
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty-state">
            <p>👋 Start a conversation about this project</p>
            <p className="chat-hint">Ask questions, brainstorm ideas, or get help with tasks</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <ChatMessage key={index} message={msg} />
        ))}

        {isLoading && (
          <div className="chat-loading-indicator">
            <button
              className="stop-generation-btn"
              onClick={() => runtimeRef.current?.stopGeneration()}
              title="Stop generating"
            >
              ⏹ Stop
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat-composer" onSubmit={handleSendMessage}>
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSendMessage(e)
            }
          }}
          placeholder="Ask about this project... (Enter to send, Shift+Enter for new line)"
          disabled={isLoading}
          rows={3}
        />
        <button type="submit" disabled={!inputValue.trim() || isLoading}>
          Send
        </button>
      </form>
    </div>
  )
}

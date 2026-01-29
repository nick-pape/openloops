import { useState, useEffect, useRef } from 'react'
import { ElectronChatRuntime } from '../chat/ElectronChatRuntime'
import { ChatMessage as ChatMessageComponent } from './ChatMessage'
import { ChatContext, ChatAttachment } from '../../types'
import './ChatPane.css'

interface ChatPaneProps {
  context: ChatContext
  isCollapsed: boolean
  onToggle: () => void
}

export function ChatPane({ context, isCollapsed, onToggle }: ChatPaneProps) {
  const runtimeRef = useRef<ElectronChatRuntime | null>(null)
  const [, setUpdateTrigger] = useState(0)
  const [inputValue, setInputValue] = useState('')
  const [showCommitMenu, setShowCommitMenu] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isExternalDrag, setIsExternalDrag] = useState(false)

  // Initialize runtime once (not dependent on context changes)
  useEffect(() => {
    // Create new runtime
    const runtime = new ElectronChatRuntime()
    runtimeRef.current = runtime

    const unsubscribe = runtime.subscribe(() => {
      setUpdateTrigger(prev => prev + 1)
    })

    return () => {
      unsubscribe()
      runtime.dispose()
      runtimeRef.current = null
    }
  }, [])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [runtimeRef.current?.getMessageCount()])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!runtimeRef.current || !inputValue.trim() || runtimeRef.current.getIsLoading()) return

    const message = inputValue.trim()
    setInputValue('')

    // Send message with attachments
    await runtimeRef.current.sendMessage(message, context, attachments)

    // Clear attachments after sending
    setAttachments([])
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    setIsExternalDrag(false)

    // Check if it's an internal drag (our JSON data)
    const dragData = e.dataTransfer.getData('application/json')
    if (dragData) {
      // Internal drag - attach context
      try {
        const attachment: ChatAttachment = JSON.parse(dragData)

        // Check for duplicates
        if (attachments.some(a => a.type === attachment.type && a.id === attachment.id)) {
          return
        }

        setAttachments(prev => [...prev, attachment])
      } catch (error) {
        console.error('[ChatPane] Failed to parse drag data:', error)
      }
      return
    }

    // External drag - handle files
    const files = Array.from(e.dataTransfer.files)
    console.log('[ChatPane] External drop - files:', files.length)
    if (files.length === 0) return

    // Only handle in project context
    if (context.active.type !== 'project' || !context.active.data?.projectId) {
      console.log('[ChatPane] Not in project context, showing alert')
      alert('File drops require a project context. Please navigate to a project first.')
      return
    }

    const projectId = context.active.data.projectId
    console.log('[ChatPane] Handling external drop in project:', projectId)

    // Handle image files
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    console.log('[ChatPane] Image files:', imageFiles.length)

    for (const file of imageFiles) {
      try {
        console.log('[ChatPane] Processing image:', file.name)
        const arrayBuffer = await file.arrayBuffer()
        const extension = file.name.split('.').pop() || 'png'
        const filePath = await window.electron.files.saveImage(projectId, arrayBuffer, extension)
        console.log('[ChatPane] Image saved to:', filePath)

        const capture = await window.electron.captures.create({
          projectId,
          type: 'image',
          title: file.name,
          filePath
        })
        console.log('[ChatPane] Capture created:', capture.id, capture.title)

        // Enqueue image description job
        await window.electron.images.requestDescription(capture.id, filePath)
        console.log('[ChatPane] Image description job enqueued')

        // Attach to chat immediately
        console.log('[ChatPane] Adding to attachments...')
        setAttachments(prev => {
          const newAttachments = [...prev, {
            type: 'capture',
            id: capture.id,
            title: capture.title,
            data: capture
          }]
          console.log('[ChatPane] Attachments now:', newAttachments.length)
          return newAttachments
        })
      } catch (error) {
        console.error('[ChatPane] Failed to save dropped image:', error)
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Detect if internal or external drag
    const hasJson = e.dataTransfer.types.includes('application/json')
    const hasFiles = e.dataTransfer.types.includes('Files')

    if (hasJson || hasFiles) {
      setIsDragOver(true)
      setIsExternalDrag(hasFiles && !hasJson)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // Only hide overlay if leaving the chat pane itself, not child elements
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY

    if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
      setIsDragOver(false)
      setIsExternalDrag(false)
    }
  }

  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleCommitAction = async (action: string) => {
    setShowCommitMenu(false)
    if (!runtimeRef.current) return

    // Commit actions only work in project context
    if (context.active.type !== 'project' || !context.active.data?.projectId) {
      alert('Commit actions are only available in project context')
      return
    }

    const projectId = context.active.data.projectId

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
    <div
      className={`chat-pane expanded ${isDragOver ? 'drag-over' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="chat-header">
        <h2>💬 Chat</h2>
        <div className="chat-header-actions">
          <div className="commit-menu-container">
            <button
              className="commit-btn"
              onClick={() => setShowCommitMenu(!showCommitMenu)}
              disabled={messages.length === 0 || context.active.type !== 'project'}
              title={context.active.type !== 'project' ? 'Only available in project context' : ''}
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
          <button
            className="new-chat-btn"
            onClick={() => runtimeRef.current?.clearMessages()}
            disabled={messages.length === 0}
            title="New Chat"
          >
            +
          </button>
          <button className="close-btn" onClick={onToggle}>
            ✕
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty-state">
            <p>👋 Start a conversation</p>
            <p className="chat-hint">Ask questions, brainstorm ideas, or get help with tasks</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <ChatMessageComponent key={index} message={msg} />
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

      <div className={`chat-context-badge context-${context.active.color}`}>
        🎯 {context.active.label}
      </div>

      {attachments.length > 0 && (
        <div className="chat-attachments-container">
          {attachments.map((attachment, index) => (
            <div key={`${attachment.type}-${attachment.id}`} className="chat-attachment-badge">
              <span className="attachment-icon">
                {attachment.type === 'capture' && '📝'}
                {attachment.type === 'task' && '✓'}
                {attachment.type === 'summary' && '📊'}
              </span>
              <span className="attachment-title">{attachment.title}</span>
              <button
                type="button"
                className="attachment-remove"
                onClick={() => handleRemoveAttachment(index)}
                title="Remove attachment"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

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
          placeholder={`Ask about ${context.active.label}... (Enter to send, Shift+Enter for new line)`}
          disabled={isLoading}
          rows={3}
        />
        <button type="submit" disabled={!inputValue.trim() || isLoading}>
          Send
        </button>
      </form>

      {isDragOver && (
        <div className="drop-zone-overlay">
          <div className="drop-zone-message">
            {isExternalDrag ? 'Drop files to capture and attach' : 'Drop to attach context'}
          </div>
        </div>
      )}
    </div>
  )
}

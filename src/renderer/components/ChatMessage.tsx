import { MarkdownRenderer } from './MarkdownRenderer'
import { ChatMessage as ChatMessageType } from '../../types'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0

  return (
    <div className={`chat-message ${message.role}`}>
      {/* Show context badge for user messages */}
      {message.role === 'user' && message.context && (
        <div className={`message-context-badge context-${message.context.color}`}>
          🎯 {message.context.label}
        </div>
      )}

      <div className="message-header">
        <span className="message-role">
          {message.role === 'user' ? '👤 You' : message.role === 'system' ? '⚙️ System' : '🤖 Assistant'}
        </span>
        {message.timestamp && (
          <span className="message-timestamp">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Display tool calls first (at top) */}
      {hasToolCalls && (
        <div className="tool-calls">
          {message.toolCalls!.map((toolCall) => (
            <div key={toolCall.toolCallId} className={`tool-call tool-call-${toolCall.status}`}>
              <div className="tool-call-header">
                <span className="tool-call-icon">
                  {toolCall.status === 'completed' ? '✅' : toolCall.status === 'error' ? '❌' : '🔧'}
                </span>
                <span className="tool-call-name">{toolCall.toolName}</span>
                <span className="tool-call-status">{toolCall.status}</span>
              </div>
              {toolCall.error && (
                <div className="tool-call-error">
                  Error: {toolCall.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Display message content after tools */}
      {message.content && <MarkdownRenderer content={message.content} />}
    </div>
  )
}

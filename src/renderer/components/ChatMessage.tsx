import { MarkdownRenderer } from './MarkdownRenderer'
import { ChatMessage as ChatMessageType } from '../../types'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  return (
    <div className={`chat-message ${message.role}`}>
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
      <MarkdownRenderer content={message.content} />
    </div>
  )
}

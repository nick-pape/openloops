import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import './MarkdownRenderer.css'

interface MarkdownRendererProps {
  content: string
  className?: string
}

// Custom component overrides to reduce wrapper bloat
const components: Components = {
  // Wrap tables in horizontal-scroll container
  table: ({ node, ...props }) => (
    <div className="table-wrapper">
      <table {...props} />
    </div>
  ),
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

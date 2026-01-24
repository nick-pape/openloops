import { useState, useEffect, useRef } from 'react'
import './TextCaptureView.css'

export function TextCaptureView() {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // Auto-focus textarea when window opens
    textareaRef.current?.focus()
  }, [])

  const handleSave = async () => {
    if (!text.trim()) return

    setSaving(true)
    try {
      console.log('[TextCaptureView] Saving text capture...')
      await window.electron.textCapture.save(text.trim())
      console.log('[TextCaptureView] Text capture saved successfully')
      window.close()
    } catch (error) {
      console.error('Failed to save text capture:', error)
      alert('Failed to save text capture')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    window.close()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Enter to save
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
    // ESC to cancel
    if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  return (
    <div className="text-capture-view">
      <div className="text-capture-header" style={{ WebkitAppRegion: 'drag' } as any}>
        <h2>Quick Text Capture</h2>
        <button
          className="close-btn"
          onClick={handleCancel}
          style={{ WebkitAppRegion: 'no-drag' } as any}
          title="Cancel (ESC)"
        >
          ✕
        </button>
      </div>

      <div className="text-capture-content">
        <textarea
          ref={textareaRef}
          className="text-capture-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type or paste your text here...&#10;&#10;Ctrl+Enter to save&#10;ESC to cancel"
        />
        <div className="text-capture-footer">
          <span className="char-count">
            {text.length} character{text.length !== 1 ? 's' : ''}
          </span>
          <div className="text-capture-actions">
            <button
              className="secondary"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !text.trim()}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

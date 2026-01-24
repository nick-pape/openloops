import { useState, useEffect } from 'react'
import { Task } from '../../types'
import './WorkModeView.css'

export function WorkModeView() {
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRemaining, setTimeRemaining] = useState(25 * 60) // 25 minutes in seconds
  const [isRunning, setIsRunning] = useState(false)
  const [defaultDuration, setDefaultDuration] = useState(25 * 60)

  useEffect(() => {
    loadActiveTask()
    loadSettings()
    // Auto-start timer when Work Mode opens
    setIsRunning(true)
  }, [])

  // Timer countdown
  useEffect(() => {
    if (!isRunning) return

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          setIsRunning(false)
          playCompletionSound()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isRunning])

  const loadActiveTask = async () => {
    setLoading(true)
    try {
      console.log('[WorkModeView] Loading active task...')
      const task = await window.electron.workMode.getActiveTask()
      console.log('[WorkModeView] Got active task:', task)
      if (!task) {
        console.warn('[WorkModeView] No active task found')
        // Don't auto-close anymore - let user see error and close manually
        setActiveTask(null)
        setLoading(false)
        return
      }
      setActiveTask(task)
    } catch (error) {
      console.error('Failed to load active task:', error)
    }
    setLoading(false)
  }

  const loadSettings = async () => {
    try {
      const duration = await window.electron.settings.get('focus_session_length')
      if (duration) {
        const minutes = parseInt(duration)
        setDefaultDuration(minutes * 60)
        setTimeRemaining(minutes * 60)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const playCompletionSound = () => {
    // Simple beep using Web Audio API
    try {
      const audioContext = new AudioContext()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = 800
      oscillator.type = 'sine'
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.5)
    } catch (error) {
      console.error('Failed to play sound:', error)
    }
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handlePausePlay = () => {
    setIsRunning(!isRunning)
  }

  const handleClose = async () => {
    try {
      await window.electron.workMode.clearActiveTask()
      window.close()
    } catch (error) {
      console.error('Failed to close work mode:', error)
    }
  }

  if (loading) {
    return (
      <div className="work-mode-view">
        <div className="loading">Loading...</div>
      </div>
    )
  }

  if (!activeTask) {
    return (
      <div className="work-mode-view">
        <div className="work-mode-titlebar" style={{ WebkitAppRegion: 'drag' } as any}>
          <div className="drag-handle">⋮⋮</div>
          <div className="task-name">No Active Task</div>
          <button
            className="close-btn"
            onClick={() => window.close()}
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            ✕
          </button>
        </div>
        <div className="error-content">
          <div className="error-message">No active task selected</div>
          <button className="error-action" onClick={() => window.close()}>
            Close Window
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="work-mode-view">
      {/* Custom title bar with drag handle */}
      <div className="work-mode-titlebar" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="drag-handle">⋮⋮</div>
        <div className="task-name">{activeTask.title}</div>
        <button
          className="close-btn"
          onClick={handleClose}
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          ✕
        </button>
      </div>

      {/* Task info with inline timer and actions */}
      <div className="work-mode-task-info">
        <div className="task-meta">
          <span className={`priority-badge priority-${activeTask.priority}`}>
            P{activeTask.priority}
          </span>
          <span className="task-estimate">{activeTask.estimateMinutes} min</span>
          <span className="timer-compact">{formatTime(timeRemaining)}</span>
        </div>
        <button className="timer-toggle" onClick={handlePausePlay} title={isRunning ? 'Pause timer' : 'Resume timer'}>
          {isRunning ? '⏸' : '▶'}
        </button>
      </div>

      {/* Quick Captures - MAIN FEATURE */}
      <div className="work-mode-captures">
        <div className="capture-buttons">
          <button className="capture-btn" title="Quick Text (Ctrl+Shift+T)">
            <span className="capture-icon">📝</span>
            <span className="capture-label">Text</span>
            <span className="capture-hint">Ctrl+Shift+T</span>
          </button>
          <button className="capture-btn" title="Screenshot (Ctrl+Shift+S)">
            <span className="capture-icon">📸</span>
            <span className="capture-label">Screen</span>
            <span className="capture-hint">Ctrl+Shift+S</span>
          </button>
          <button className="capture-btn" title="Voice Note (Ctrl+Shift+R)">
            <span className="capture-icon">🎤</span>
            <span className="capture-label">Voice</span>
            <span className="capture-hint">Ctrl+Shift+R</span>
          </button>
        </div>
      </div>
    </div>
  )
}

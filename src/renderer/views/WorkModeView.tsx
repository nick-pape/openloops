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
      const task = await window.electron.workMode.getActiveTask()
      if (!task) {
        // No active task - shouldn't happen, but close window if it does
        window.close()
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

  const handleStartPause = () => {
    setIsRunning(!isRunning)
  }

  const handleReset = () => {
    setIsRunning(false)
    setTimeRemaining(defaultDuration)
  }

  const handleAddFive = () => {
    setTimeRemaining(prev => prev + 5 * 60)
  }

  const handleDone = async () => {
    if (!activeTask) return

    try {
      await window.electron.tasks.update(activeTask.id, { status: 'done' })
      await window.electron.workMode.clearActiveTask()
      window.close()
    } catch (error) {
      console.error('Failed to mark task as done:', error)
      alert('Failed to mark task as done')
    }
  }

  const handleStop = async () => {
    try {
      await window.electron.workMode.clearActiveTask()
      window.close()
    } catch (error) {
      console.error('Failed to stop work mode:', error)
    }
  }

  const handleClose = async () => {
    await handleStop()
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
        <div className="error">No active task</div>
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

      {/* Task info */}
      <div className="work-mode-task-info">
        <div className="task-meta">
          <span className={`priority-badge priority-${activeTask.priority}`}>
            P{activeTask.priority}
          </span>
          <span className="task-estimate">{activeTask.estimateMinutes} min</span>
        </div>
      </div>

      {/* Timer */}
      <div className="work-mode-timer">
        <div className="timer-display">{formatTime(timeRemaining)}</div>
        <div className="timer-controls">
          <button onClick={handleStartPause}>
            {isRunning ? '⏸ Pause' : '▶ Start'}
          </button>
          <button onClick={handleReset}>↻ Reset</button>
          <button onClick={handleAddFive}>+5</button>
        </div>
      </div>

      {/* Actions */}
      <div className="work-mode-actions">
        <button className="action-done" onClick={handleDone}>
          ✓ Done
        </button>
        <button className="action-stop" onClick={handleStop}>
          ⏹ Stop
        </button>
      </div>
    </div>
  )
}

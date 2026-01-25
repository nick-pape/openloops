import { useState, useEffect, useRef } from 'react'
import { Task } from '../../types'
import './WorkModeView.css'

export function WorkModeView() {
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRemaining, setTimeRemaining] = useState(25 * 60) // 25 minutes in seconds
  const [isRunning, setIsRunning] = useState(false)
  const [defaultDuration, setDefaultDuration] = useState(25 * 60)
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false)
  const [showSourcePicker, setShowSourcePicker] = useState(false)
  const [desktopSources, setDesktopSources] = useState<any[]>([])
  const [isRecording, setIsRecording] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

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

  const handleTextCapture = async () => {
    try {
      console.log('[WorkModeView] Opening text capture window...')
      await window.electron.textCapture.openWindow()
    } catch (error) {
      console.error('Failed to open text capture:', error)
    }
  }

  const handleScreenshot = async () => {
    if (isCapturingScreenshot || !activeTask) return

    setIsCapturingScreenshot(true)

    try {
      console.log('[WorkModeView] Starting screenshot capture...')

      // Use active task's projectId (can be null for inbox tasks)
      const projectId = activeTask.projectId || null

      // Detect platform
      const isWindows = navigator.platform.toLowerCase().includes('win')

      if (isWindows) {
        console.log('[WorkModeView] Using Windows Snipping Tool')
        const result = await window.electron.screenshot.snip(projectId || '')

        if (!result) {
          console.log('[WorkModeView] Capture cancelled or timed out, trying fallback...')
          await handleScreenshotFallback()
          return
        }

        console.log('[WorkModeView] Screenshot captured:', result.filePath)

        // Create capture with metadata
        const capture = await window.electron.captures.create({
          projectId,
          taskId: activeTask.id,
          type: 'image',
          filePath: result.filePath,
          title: `Screenshot - ${new Date().toLocaleString()}`,
          isOpenLoop: false,
          metadata: JSON.stringify(result.metadata)
        })

        // Enqueue image description job
        await window.electron.images.requestDescription(capture.id, result.filePath)
        console.log('[WorkModeView] Screenshot saved and description job enqueued')
      } else {
        console.log('[WorkModeView] Using desktopCapturer (macOS/Linux)')
        await handleScreenshotFallback()
      }
    } catch (error) {
      console.error('[WorkModeView] Screenshot error:', error)
      alert(`Screenshot failed: ${error}`)
    } finally {
      setIsCapturingScreenshot(false)
    }
  }

  const handleScreenshotFallback = async () => {
    try {
      console.log('[WorkModeView] Getting desktop sources...')
      const sources = await window.electron.screenshot.getSources()

      if (sources.length === 0) {
        alert('No screens or windows available for capture')
        return
      }

      setDesktopSources(sources)
      setShowSourcePicker(true)
    } catch (error) {
      console.error('[WorkModeView] Error getting desktop sources:', error)
      alert('Failed to get desktop sources')
    }
  }

  const handleCaptureSource = async (sourceId: string, sourceName: string) => {
    if (!activeTask) return

    try {
      setShowSourcePicker(false)

      // Use getUserMedia to capture the screen/window
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // @ts-ignore - Electron-specific constraints
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        }
      })

      // Capture frame to canvas
      const video = document.createElement('video')
      video.srcObject = stream
      video.onloadedmetadata = async () => {
        video.play()

        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(video, 0, 0)

        // Stop the stream
        stream.getTracks().forEach(track => track.stop())

        // Convert to blob and save
        canvas.toBlob(async (blob) => {
          if (!blob) {
            alert('Failed to capture screenshot')
            return
          }

          const arrayBuffer = await blob.arrayBuffer()
          const projectId = activeTask.projectId || null
          const filePath = await window.electron.files.saveImage(projectId || '', arrayBuffer, 'png')

          // Create capture
          const capture = await window.electron.captures.create({
            projectId,
            taskId: activeTask.id,
            type: 'image',
            filePath,
            title: `Screenshot - ${sourceName}`,
            isOpenLoop: false,
            metadata: JSON.stringify({
              source: 'screenshot',
              screenshotType: 'desktop-capturer',
              sourceName
            })
          })

          // Enqueue image description job
          await window.electron.images.requestDescription(capture.id, filePath)
          console.log('[WorkModeView] Screenshot saved via desktopCapturer')
        }, 'image/png')
      }
    } catch (error) {
      console.error('[WorkModeView] Capture source error:', error)
      alert('Failed to capture screen')
    } finally {
      setIsCapturingScreenshot(false)
    }
  }

  const handleStartRecording = async () => {
    if (!activeTask) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)

      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const arrayBuffer = await audioBlob.arrayBuffer()

        try {
          const projectId = activeTask.projectId || null
          const audioFilePath = await window.electron.files.saveAudio(projectId || '', arrayBuffer)

          const capture = await window.electron.captures.create({
            projectId,
            taskId: activeTask.id,
            type: 'audio',
            filePath: audioFilePath,
            title: `Voice note - ${new Date().toLocaleString()}`,
            isOpenLoop: false
          })

          // Request transcription
          await window.electron.audio.requestTranscription(capture.id, audioFilePath)
          console.log('[WorkModeView] Audio saved and transcription job enqueued')
        } catch (error) {
          console.error('Failed to save audio:', error)
        }

        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
    } catch (error) {
      console.error('Failed to start recording:', error)
      alert('Failed to access microphone')
    }
  }

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
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
          <button className="capture-btn" onClick={handleTextCapture} title="Quick Text (Ctrl+Shift+T)">
            <span className="capture-icon">📝</span>
            <span className="capture-label">Text</span>
            <span className="capture-hint">Ctrl+Shift+T</span>
          </button>
          <button className="capture-btn" onClick={handleScreenshot} disabled={isCapturingScreenshot} title="Screenshot (Ctrl+Shift+S)">
            <span className="capture-icon">{isCapturingScreenshot ? '⏳' : '📸'}</span>
            <span className="capture-label">{isCapturingScreenshot ? 'Capturing...' : 'Screen'}</span>
            <span className="capture-hint">Ctrl+Shift+S</span>
          </button>
          <button className="capture-btn" onClick={isRecording ? handleStopRecording : handleStartRecording} title="Voice Note (Ctrl+Shift+V)">
            <span className="capture-icon">{isRecording ? '⏹' : '🎤'}</span>
            <span className="capture-label">{isRecording ? 'Recording...' : 'Voice'}</span>
            <span className="capture-hint">Ctrl+Shift+V</span>
          </button>
        </div>
      </div>

      {/* Source Picker Modal for desktopCapturer */}
      {showSourcePicker && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowSourcePicker(false)
            setIsCapturingScreenshot(false)
          }}
        >
          <div className="modal source-picker-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Select a screen or window</h2>
            <div className="source-grid">
              {desktopSources.map((source) => (
                <div
                  key={source.id}
                  className="source-item"
                  onClick={() => handleCaptureSource(source.id, source.name)}
                >
                  <img src={source.thumbnail} alt={source.name} className="source-thumbnail" />
                  <span className="source-name">{source.name}</span>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button
                className="secondary"
                onClick={() => {
                  setShowSourcePicker(false)
                  setIsCapturingScreenshot(false)
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import { Project, Capture, ProjectSummary, Transcription, DesktopSource, Task, ChatMessage as ChatMessageType } from '../../types'
import { useJobs } from '../contexts/JobsContext'
import { useDomainEvents } from '../hooks/useDomainEvents'
import { ChatMessage } from '../components/ChatMessage'
import { MarkdownRenderer } from '../components/MarkdownRenderer'
import './ProjectView.css'
import './TasksView.css'

interface ProjectViewProps {
  projectId: string
  onDeleteProject: (id: string) => void
}

export function ProjectView({ projectId, onDeleteProject }: ProjectViewProps) {
  const [project, setProject] = useState<Project | null>(null)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [summary, setSummary] = useState<ProjectSummary | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [filterType, setFilterType] = useState<string>('all')
  const [editingCapture, setEditingCapture] = useState<Capture | null>(null)
  const [editBody, setEditBody] = useState('')
  const [activeTab, setActiveTab] = useState<'summary' | 'captures' | 'tasks'>('summary')
  const [expandedCaptures, setExpandedCaptures] = useState<Set<string>>(new Set())
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false)
  const [showSourcePicker, setShowSourcePicker] = useState(false)
  const [desktopSources, setDesktopSources] = useState<DesktopSource[]>([])

  // Task modal state
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskEstimate, setTaskEstimate] = useState(30)
  const [taskPriority, setTaskPriority] = useState(3)
  const [taskNotes, setTaskNotes] = useState('')

  // Link modal state
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [fetchingTitle, setFetchingTitle] = useState(false)

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Drag/drop state for external files
  const [isDraggingExternal, setIsDraggingExternal] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Subscribe to jobs context for this project
  const { jobs } = useJobs({ projectId })
  const processedJobIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    loadProject()
  }, [projectId])

  // Listen for job completions and auto-reload relevant data
  useEffect(() => {
    // Find newly completed jobs that we haven't processed yet
    const newlyCompletedJobs = jobs.filter(
      j => j.status === 'done' && !processedJobIds.current.has(j.id)
    )

    if (newlyCompletedJobs.length === 0) return

    // Process each newly completed job
    for (const job of newlyCompletedJobs) {
      console.log('[ProjectView] New job completed:', job.id, job.type)
      processedJobIds.current.add(job.id)

      if (job.type === 'image-description') {
        console.log('[ProjectView] Image description completed, reloading captures')
        loadCaptures()
      } else if (job.type === 'summary') {
        console.log('[ProjectView] Summary completed, reloading summary')
        loadSummary()
        setGeneratingSummary(false)
      } else if (job.type === 'transcription') {
        console.log('[ProjectView] Transcription completed, reloading captures')
        loadCaptures()
      } else if (job.type === 'text-title-generation') {
        console.log('[ProjectView] Text title generation completed, reloading captures')
        loadCaptures()
      }
    }
  }, [jobs])

  const loadCaptures = useCallback(async () => {
    try {
      const caps = await window.electron.captures.getByProject(projectId)
      setCaptures(caps)
    } catch (error) {
      console.error('Failed to reload captures:', error)
    }
  }, [projectId])

  const loadSummary = useCallback(async () => {
    try {
      const summ = await window.electron.summaries.getLatest(projectId)
      setSummary(summ || null)
    } catch (error) {
      console.error('Failed to reload summary:', error)
    }
  }, [projectId])

  const loadTasks = useCallback(async () => {
    try {
      const projectTasks = await window.electron.tasks.getOpen(projectId)
      setTasks(projectTasks)
    } catch (error) {
      console.error('Failed to reload tasks:', error)
    }
  }, [projectId])

  // Listen for domain events (unified system for both UI and MCP operations)
  useDomainEvents((event) => {
    if (event.type === 'capture.created' && event.projectId === projectId) {
      console.log('[ProjectView] Domain event: capture created, reloading captures')
      loadCaptures()
    } else if (event.type === 'capture.updated' && event.captureId) {
      console.log('[ProjectView] Domain event: capture updated, reloading captures')
      loadCaptures()
    } else if (event.type === 'capture.deleted' && event.captureId) {
      console.log('[ProjectView] Domain event: capture deleted, reloading captures')
      loadCaptures()
    } else if (event.type === 'task.created' && (!event.projectId || event.projectId === projectId)) {
      console.log('[ProjectView] Domain event: task created, reloading tasks')
      loadTasks()
    } else if (event.type === 'task.updated') {
      console.log('[ProjectView] Domain event: task updated, reloading tasks')
      loadTasks()
    } else if (event.type === 'task.deleted') {
      console.log('[ProjectView] Domain event: task deleted, reloading tasks')
      loadTasks()
    } else if (event.type === 'summary.generated' && event.projectId === projectId) {
      console.log('[ProjectView] Domain event: summary generated, reloading summary')
      loadSummary()
    }
  })

  // Listen for global hotkey triggers
  // Store references to latest handlers
  const handleUploadImageRef = useRef<(() => Promise<void>) | null>(null)
  const handleScreenshotRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    handleUploadImageRef.current = handleUploadImage
    handleScreenshotRef.current = handleScreenshot
  })

  useEffect(() => {
    const handleTriggerUpload = () => {
      console.log('[ProjectView] Global hotkey triggered, opening file picker')
      handleUploadImageRef.current?.()
    }

    const handleTriggerScreenshot = () => {
      console.log('[ProjectView] Global screenshot hotkey triggered')
      handleScreenshotRef.current?.()
    }

    if (window.electron.onTriggerImageUpload) {
      window.electron.onTriggerImageUpload(handleTriggerUpload)
    }

    if (window.electron.onTriggerScreenshot) {
      window.electron.onTriggerScreenshot(handleTriggerScreenshot)
    }

    return () => {
      if (window.electron.offTriggerImageUpload) {
        window.electron.offTriggerImageUpload(handleTriggerUpload)
      }
      if (window.electron.offTriggerScreenshot) {
        window.electron.offTriggerScreenshot(handleTriggerScreenshot)
      }
    }
  }, []) // Only register once, use ref for latest function

  const loadProject = async () => {
    setLoading(true)
    try {
      const proj = await window.electron.projects.get(projectId)
      const caps = await window.electron.captures.getByProject(projectId)
      const summ = await window.electron.summaries.getLatest(projectId)
      const projectTasks = await window.electron.tasks.getOpen(projectId)

      setProject(proj)
      setCaptures(caps)
      setSummary(summ || null)
      setTasks(projectTasks)
    } catch (error) {
      console.error('Failed to load project:', error)
    }
    setLoading(false)
  }

  const handleGenerateSummary = async () => {
    setGeneratingSummary(true)
    try {
      console.log('Requesting summary generation for project:', projectId)
      await window.electron.summaries.generate(projectId)
      console.log('Summary generation enqueued - will update automatically when complete')
      // Job events will handle reloading the summary when complete
    } catch (error) {
      console.error('Failed to enqueue summary generation:', error)
      alert(`Failed to generate summary: ${error}`)
      setGeneratingSummary(false)
    }
  }

  const handleImageDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingExternal(false)

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))

    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const extension = file.name.split('.').pop() || 'png'
        const filePath = await window.electron.files.saveImage(projectId, arrayBuffer, extension)

        const capture = await window.electron.captures.create({
          projectId,
          type: 'image',
          title: file.name,
          filePath
        })

        // Enqueue image description job
        await window.electron.images.requestDescription(capture.id, filePath)
        console.log('[Drop] Image description job enqueued for:', file.name)
      } catch (error) {
        console.error('Failed to save dropped image:', error)
      }
    }

    await loadCaptures()
  }

  const handleDragOverProject = (e: React.DragEvent) => {
    // Check if it's an external drag (files from OS)
    const hasFiles = e.dataTransfer.types.includes('Files')
    const hasJson = e.dataTransfer.types.includes('application/json')

    // Only show overlay for external file drags, not internal item drags
    if (hasFiles && !hasJson) {
      e.preventDefault()
      setIsDraggingExternal(true)
    }
  }

  const handleDragLeaveProject = (e: React.DragEvent) => {
    // Only hide overlay if leaving the project view itself
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY

    if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
      setIsDraggingExternal(false)
    }
  }

  const handleImagePaste = async (e: React.ClipboardEvent) => {
    // Don't intercept paste events in text inputs/textareas
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return
    }

    const items = Array.from(e.clipboardData.items)
    const imageItems = items.filter(item => item.type.startsWith('image/'))

    // Only handle if there are actually images
    if (imageItems.length === 0) {
      return
    }

    e.preventDefault() // Only prevent default if we're actually handling images

    for (const item of imageItems) {
      const file = item.getAsFile()
      if (!file) continue

      try {
        const arrayBuffer = await file.arrayBuffer()
        const extension = file.type.split('/')[1] || 'png'
        const filePath = await window.electron.files.saveImage(projectId, arrayBuffer, extension)

        const capture = await window.electron.captures.create({
          projectId,
          type: 'image',
          title: `Pasted image ${new Date().toLocaleString()}`,
          filePath
        })

        // Enqueue image description job
        await window.electron.images.requestDescription(capture.id, filePath)
        console.log('[Paste] Image description job enqueued')
      } catch (error) {
        console.error('Failed to save pasted image:', error)
      }
    }

    await loadCaptures()
  }

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Try to get supported MIME types
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : ''

      if (!mimeType) {
        throw new Error('No supported audio format found')
      }

      console.log('[Audio] Using MIME type:', mimeType)
      const mediaRecorder = new MediaRecorder(stream, { mimeType })

      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        console.log('[Audio] Data available, size:', event.data.size)
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onerror = (event: any) => {
        console.error('[Audio] MediaRecorder error:', event.error)
        alert(`Recording error: ${event.error?.message || 'Unknown error'}`)
        stream.getTracks().forEach(track => track.stop())
        setIsRecording(false)
      }

      mediaRecorder.onstop = async () => {
        console.log('[Audio] Recording stopped, chunks collected:', audioChunksRef.current.length)

        if (audioChunksRef.current.length === 0) {
          console.error('[Audio] No audio chunks recorded!')
          alert('Recording failed: No audio data captured')
          stream.getTracks().forEach(track => track.stop())
          return
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
        console.log('[Audio] Blob created, size:', audioBlob.size, 'bytes')

        if (audioBlob.size === 0) {
          console.error('[Audio] Blob is empty!')
          alert('Recording failed: Empty audio file')
          stream.getTracks().forEach(track => track.stop())
          return
        }

        const arrayBuffer = await audioBlob.arrayBuffer()

        try {
          const filePath = await window.electron.files.saveAudio(projectId, arrayBuffer)
          console.log('[Audio] File saved:', filePath)

          const capture = await window.electron.captures.create({
            projectId,
            type: 'audio',
            title: `Recording ${new Date().toLocaleString()}`,
            filePath
          })

          console.log('[Audio] Capture created:', capture.id)

          // Request transcription
          await window.electron.audio.requestTranscription(capture.id, filePath)

          await loadCaptures()
        } catch (error) {
          console.error('[Audio] Failed to save audio:', error)
          alert(`Failed to save recording: ${error}`)
        }

        stream.getTracks().forEach(track => track.stop())
      }

      // Start recording with 1 second timeslices to ensure data is collected
      console.log('[Audio] Starting recording...')
      mediaRecorder.start(1000)
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
      console.log('[Audio] Recording started successfully')
    } catch (error) {
      console.error('[Audio] Failed to start recording:', error)
      alert(`Failed to access microphone: ${error}`)
    }
  }

  const handleStopRecording = () => {
    console.log('[Audio] Stop recording requested')
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log('[Audio] MediaRecorder state:', mediaRecorderRef.current.state)
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      console.log('[Audio] Stop called, waiting for onstop event...')
    } else {
      console.warn('[Audio] Cannot stop: MediaRecorder is inactive or null')
    }
  }

  const handleEditCapture = (capture: Capture) => {
    setEditingCapture(capture)
    setEditBody(capture.bodyText || '')
  }

  const handleSaveEdit = async () => {
    if (!editingCapture) return

    try {
      // Keep existing title, only update bodyText
      await window.electron.captures.update(editingCapture.id, editingCapture.title || '', editBody.trim())
      setEditingCapture(null)
      setEditBody('')
      await loadProject()
    } catch (error) {
      console.error('Failed to update capture:', error)
    }
  }

  const handleDeleteCapture = async (captureId: string, captureTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${captureTitle}"?`)) {
      return
    }

    try {
      await window.electron.captures.delete(captureId)
      await loadProject()
    } catch (error) {
      console.error('Failed to delete capture:', error)
      alert('Failed to delete capture')
    }
  }

  const toggleCaptureExpanded = (captureId: string) => {
    setExpandedCaptures(prev => {
      const newSet = new Set(prev)
      if (newSet.has(captureId)) {
        newSet.delete(captureId)
      } else {
        newSet.add(captureId)
      }
      return newSet
    })
  }

  // Project delete handler
  const handleConfirmDelete = () => {
    if (project) {
      onDeleteProject(project.id)
      setShowDeleteConfirm(false)
    }
  }

  // Task handlers
  const handleCreateTask = async () => {
    if (!taskTitle.trim()) return

    try {
      await window.electron.tasks.create({
        title: taskTitle.trim(),
        projectId: projectId,
        estimateMinutes: taskEstimate,
        priority: taskPriority,
        notes: taskNotes.trim() || undefined
      })

      resetTaskForm()
      setShowTaskModal(false)
      await loadTasks()
    } catch (error) {
      console.error('Failed to create task:', error)
      alert('Failed to create task')
    }
  }

  const handleEditTask = (task: Task) => {
    setEditingTask(task)
    setTaskTitle(task.title)
    setTaskEstimate(task.estimateMinutes)
    setTaskPriority(task.priority)
    setTaskNotes(task.notes || '')
    setShowTaskModal(true)
  }

  const handleSaveTask = async () => {
    if (!editingTask || !taskTitle.trim()) return

    try {
      await window.electron.tasks.update(editingTask.id, {
        title: taskTitle.trim(),
        estimateMinutes: taskEstimate,
        priority: taskPriority,
        notes: taskNotes.trim() || undefined
      })

      resetTaskForm()
      setEditingTask(null)
      setShowTaskModal(false)
      await loadTasks()
    } catch (error) {
      console.error('Failed to update task:', error)
      alert('Failed to update task')
    }
  }

  const handleToggleTaskStatus = async (task: Task) => {
    try {
      await window.electron.tasks.update(task.id, {
        status: task.status === 'open' ? 'done' : 'open'
      })
      await loadTasks()
    } catch (error) {
      console.error('Failed to toggle task status:', error)
    }
  }

  const handleDeleteTask = async (task: Task) => {
    if (!confirm(`Delete task "${task.title}"?`)) return

    try {
      await window.electron.tasks.delete(task.id)
      await loadTasks()
    } catch (error) {
      console.error('Failed to delete task:', error)
      alert('Failed to delete task')
    }
  }

  const handleStartWorkMode = async (task: Task) => {
    try {
      console.log('[ProjectView] Setting active task:', task.id, task.title)
      await window.electron.workMode.setActiveTask(task.id)
      console.log('[ProjectView] Active task set, waiting for DB flush...')

      // Small delay to ensure database write is flushed
      await new Promise(resolve => setTimeout(resolve, 100))

      console.log('[ProjectView] Opening window')
      await window.electron.workMode.openWindow()
      console.log('[ProjectView] Window opened')
    } catch (error) {
      console.error('Failed to start work mode:', error)
      alert('Failed to start work mode')
    }
  }

  const resetTaskForm = () => {
    setTaskTitle('')
    setTaskEstimate(30)
    setTaskPriority(3)
    setTaskNotes('')
  }

  const handleCloseTaskModal = () => {
    resetTaskForm()
    setEditingTask(null)
    setShowTaskModal(false)
  }

  const handleUploadImage = async () => {
    try {
      console.log('[handleUploadImage] Starting image upload...')

      // Open file picker and read file
      const result = await window.electron.files.selectImage()
      console.log('[handleUploadImage] File selected:', result?.filename)

      if (!result) {
        // User cancelled
        console.log('[handleUploadImage] User cancelled file selection')
        return
      }

      // Determine extension
      const extension = result.filename.split('.').pop() || 'png'
      console.log('[handleUploadImage] Extension:', extension)

      // Save image to project
      console.log('[handleUploadImage] Saving image to project...')
      const savedPath = await window.electron.files.saveImage(projectId, result.buffer, extension)
      console.log('[handleUploadImage] Image saved to:', savedPath)

      // Create image capture with filename as title
      console.log('[handleUploadImage] Creating capture...')
      const capture = await window.electron.captures.create({
        projectId,
        type: 'image',
        title: result.filename,
        filePath: savedPath
      })
      console.log('[handleUploadImage] Capture created:', capture.id)

      // Enqueue image description job (will update title if LLM is configured)
      console.log('[handleUploadImage] Enqueueing image description job...')
      await window.electron.images.requestDescription(capture.id, savedPath)
      console.log('[handleUploadImage] Image description job enqueued')

      // Reload captures to show new image
      console.log('[handleUploadImage] Reloading captures...')
      await loadCaptures()
      console.log('[handleUploadImage] Captures reloaded successfully')
    } catch (error) {
      console.error('[handleUploadImage] ERROR:', error)
      alert(`Failed to upload image: ${error}`)
    }
  }

  const handleAddLink = () => {
    setLinkUrl('')
    setLinkTitle('')
    setShowLinkModal(true)
  }

  const handleLinkUrlChange = async (url: string) => {
    setLinkUrl(url)

    // Try to fetch title if URL is valid
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      try {
        setFetchingTitle(true)
        const title = await window.electron.links.fetchTitle(url)
        setLinkTitle(title)
      } catch (error) {
        console.log('Could not fetch title:', error)
        // Leave title empty for manual entry
      } finally {
        setFetchingTitle(false)
      }
    }
  }

  const handleSaveLink = async () => {
    if (!linkUrl.trim()) return

    try {
      await window.electron.captures.create({
        projectId,
        type: 'link',
        title: linkTitle.trim() || linkUrl,
        bodyText: linkUrl.trim()
      })

      setShowLinkModal(false)
      setLinkUrl('')
      setLinkTitle('')
      await loadCaptures()
    } catch (error) {
      console.error('Failed to save link:', error)
      alert('Failed to save link')
    }
  }

  const handleScreenshot = async () => {
    if (isCapturingScreenshot) return

    setIsCapturingScreenshot(true)

    try {
      console.log('[Screenshot] Starting screenshot capture...')

      // Detect platform
      const isWindows = navigator.platform.toLowerCase().includes('win')

      if (isWindows) {
        // Windows: Use Snipping Tool with clipboard monitoring
        console.log('[Screenshot] Using Windows Snipping Tool')
        const result = await window.electron.screenshot.snip(projectId)

        if (!result) {
          console.log('[Screenshot] Capture cancelled or timed out, trying fallback...')
          // Fall back to desktopCapturer
          // Don't return - let the fallback show its modal
          await handleScreenshotFallback()
          // Fallback modal is shown, will handle its own state clearing
          return
        }

        console.log('[Screenshot] Screenshot captured:', result.filePath)

        // Create capture with metadata
        const capture = await window.electron.captures.create({
          projectId,
          type: 'image',
          title: `Screenshot ${new Date().toLocaleString()}`,
          filePath: result.filePath,
          metadata: JSON.stringify(result.metadata)
        })

        console.log('[Screenshot] Capture created:', capture.id)

        // Enqueue image description job
        await window.electron.images.requestDescription(capture.id, result.filePath)
        console.log('[Screenshot] Image description job enqueued')

        // Reload captures
        await loadCaptures()
      } else {
        // macOS/Linux: Use desktopCapturer source picker
        console.log('[Screenshot] Using desktopCapturer (macOS/Linux)')
        await handleScreenshotFallback()
      }
    } catch (error) {
      console.error('[Screenshot] Error:', error)
      alert(`Screenshot failed: ${error}`)
    } finally {
      setIsCapturingScreenshot(false)
    }
  }

  const handleScreenshotFallback = async () => {
    try {
      console.log('[Screenshot] Getting desktop sources...')
      const sources = await window.electron.screenshot.getSources()

      if (sources.length === 0) {
        alert('No screens or windows available for capture')
        return
      }

      setDesktopSources(sources)
      setShowSourcePicker(true)
    } catch (error) {
      console.error('[Screenshot] Failed to get sources:', error)
      throw error
    }
  }

  const handleCaptureSource = async (sourceId: string, sourceName: string) => {
    setShowSourcePicker(false)

    try {
      console.log('[Screenshot] Capturing source:', sourceName)

      // Use getUserMedia to capture the selected source
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        } as any
      })

      // Capture a frame from the stream
      const video = document.createElement('video')
      video.srcObject = stream
      video.autoplay = true

      await new Promise((resolve) => {
        video.onloadedmetadata = resolve
      })

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Failed to get canvas context')
      }

      ctx.drawImage(video, 0, 0)

      // Stop the stream
      stream.getTracks().forEach(track => track.stop())

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => {
          if (b) resolve(b)
        }, 'image/png')
      })

      const arrayBuffer = await blob.arrayBuffer()

      // Save screenshot
      const filePath = await window.electron.files.saveImage(projectId, arrayBuffer, 'png')
      console.log('[Screenshot] Saved to:', filePath)

      // Determine screenshot type
      const screenshotType = sourceId.startsWith('screen') ? 'full-screen' : 'window'

      // Create capture with metadata
      const capture = await window.electron.captures.create({
        projectId,
        type: 'image',
        title: `Screenshot: ${sourceName}`,
        filePath,
        metadata: JSON.stringify({
          source: 'screenshot',
          captureMethod: 'desktop-capturer',
          screenshotType,
          windowTitle: sourceName,
          timestamp: new Date().toISOString()
        })
      })

      console.log('[Screenshot] Capture created:', capture.id)

      // Enqueue image description job
      await window.electron.images.requestDescription(capture.id, filePath)
      console.log('[Screenshot] Image description job enqueued')

      // Reload captures
      await loadCaptures()
    } catch (error) {
      console.error('[Screenshot] Capture source failed:', error)
      alert(`Failed to capture screenshot: ${error}`)
    } finally {
      setIsCapturingScreenshot(false)
    }
  }

  const filteredCaptures = captures.filter(c => {
    if (filterType !== 'all' && c.type !== filterType) return false
    return true
  })

  if (loading) {
    return <div className="loading">Loading project...</div>
  }

  if (!project) {
    return <div className="error">Project not found</div>
  }

  return (
    <div
      className="project-view"
      onDrop={handleImageDrop}
      onDragOver={handleDragOverProject}
      onDragLeave={handleDragLeaveProject}
      onPaste={handleImagePaste}
    >
      {isDraggingExternal && (
        <div className="drop-zone-overlay">
          <div className="drop-zone-message">Drop files to create capture</div>
        </div>
      )}
      <div className="project-header">
        <h1>{project.name}</h1>
        <button className="danger" onClick={() => setShowDeleteConfirm(true)}>
          Delete Project
        </button>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
        <button
          className={`tab ${activeTab === 'captures' ? 'active' : ''}`}
          onClick={() => setActiveTab('captures')}
        >
          Captures
        </button>
        <button
          className={`tab ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          Tasks
        </button>
      </div>

      {activeTab === 'summary' && (
        <div className="tab-content">
          <div
            className="project-summary-panel"
            draggable={!!summary}
            onDragStart={(e) => {
              if (!summary) return
              const dragData = {
                type: 'summary',
                id: summary.id,
                title: 'Project Summary',
                data: summary
              }
              e.dataTransfer.setData('application/json', JSON.stringify(dragData))
              e.dataTransfer.effectAllowed = 'copy'
            }}
            style={{ cursor: summary ? 'grab' : 'default' }}
          >
            <div className="summary-header">
              <h2>Project Summary</h2>
              <button onClick={handleGenerateSummary} disabled={generatingSummary}>
                {generatingSummary ? 'Generating...' : 'Regenerate'}
              </button>
            </div>
            {summary ? (
              <div className="summary-content">
                <MarkdownRenderer content={summary.summaryMd} className="md-summary" />
              </div>
            ) : (
              <div className="summary-empty">
                No summary yet. Click Regenerate to create one.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'captures' && (
        <div className="tab-content">
          <div className="captures-section">
            <div className="captures-header">
              <div className="captures-controls">
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="all">All Types</option>
                  <option value="text">Text</option>
                  <option value="image">Image</option>
                  <option value="audio">Audio</option>
                  <option value="chat">Chat</option>
                  <option value="decision">Decision</option>
                </select>
              </div>
              <div className="capture-actions">
                <button onClick={handleScreenshot} disabled={isCapturingScreenshot}>
                  {isCapturingScreenshot ? '⏳ Capturing...' : '📸 Screenshot'}
                </button>
                <button onClick={handleUploadImage}>🖼️ Image</button>
                <button onClick={() => window.electron.textCapture.openWindow(projectId)}>+ Text</button>
                <button onClick={handleAddLink}>🔗 Link</button>
                <button onClick={isRecording ? handleStopRecording : handleStartRecording}>
                  {isRecording ? '⏹ Stop' : '🎤 Record'}
                </button>
              </div>
            </div>

            <div className="captures-accordion">
              {filteredCaptures.map((capture) => (
                <CaptureAccordion
                  key={capture.id}
                  capture={capture}
                  isExpanded={expandedCaptures.has(capture.id)}
                  onToggle={() => toggleCaptureExpanded(capture.id)}
                  onEdit={handleEditCapture}
                  onDelete={handleDeleteCapture}
                />
              ))}
              {filteredCaptures.length === 0 && (
                <div className="captures-empty">
                  No captures yet. Drop images here or create text captures.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="tab-content">
          <div className="tasks-section">
            <div className="tasks-header">
              <h2>Tasks ({tasks.length})</h2>
              <button onClick={() => setShowTaskModal(true)}>+ New Task</button>
            </div>

            <div className="task-list">
              {tasks.map(task => (
                <div
                  key={task.id}
                  className={`task-card ${task.status === 'done' ? 'done' : ''}`}
                  draggable={true}
                  onDragStart={(e) => {
                    const dragData = {
                      type: 'task',
                      id: task.id,
                      title: task.title,
                      data: task
                    }
                    e.dataTransfer.setData('application/json', JSON.stringify(dragData))
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  style={{ cursor: 'grab' }}
                >
                  <div className="task-card-header">
                    <input
                      type="checkbox"
                      checked={task.status === 'done'}
                      onChange={() => handleToggleTaskStatus(task)}
                    />
                    <span className={`priority-badge priority-${task.priority}`}>
                      P{task.priority}
                    </span>
                    <h3 className="task-title">{task.title}</h3>
                  </div>

                  <div className="task-card-meta">
                    <span className="task-estimate">{task.estimateMinutes} min</span>

                    <div className="task-actions">
                      {task.status === 'open' && (
                        <button className="icon-btn work-mode" onClick={() => handleStartWorkMode(task)} title="Start Work Mode">
                          ▶️
                        </button>
                      )}
                      <button className="icon-btn" onClick={() => handleEditTask(task)} title="Edit">
                        ✏️
                      </button>
                      <button className="icon-btn delete" onClick={() => handleDeleteTask(task)} title="Delete">
                        🗑️
                      </button>
                    </div>
                  </div>

                  {task.notes && (
                    <div className="task-notes">{task.notes}</div>
                  )}
                </div>
              ))}
              {tasks.length === 0 && (
                <div className="tasks-empty">
                  No tasks yet. Click "+ New Task" to create one.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editingCapture && (
        <div className="modal-overlay" onClick={() => setEditingCapture(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Text Capture</h2>
            {editingCapture.title && (
              <div className="form-group">
                <label>Title (AI-generated)</label>
                <div className="read-only-title">{editingCapture.title}</div>
              </div>
            )}
            <div className="form-group">
              <label>Text Content</label>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Enter text"
                autoFocus
                rows={10}
              />
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setEditingCapture(null)}>
                Cancel
              </button>
              <button onClick={handleSaveEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showSourcePicker && (
        <div className="modal-overlay" onClick={() => {
          setShowSourcePicker(false)
          setIsCapturingScreenshot(false)
        }}>
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
              <button className="secondary" onClick={() => {
                setShowSourcePicker(false)
                setIsCapturingScreenshot(false)
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showTaskModal && (
        <div className="modal-overlay" onClick={handleCloseTaskModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingTask ? 'Edit Task' : 'New Task'}</h2>

            <div className="form-group">
              <label>Title *</label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Task title"
                autoFocus
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Estimate (minutes)</label>
                <input
                  type="number"
                  value={taskEstimate}
                  onChange={(e) => setTaskEstimate(parseInt(e.target.value))}
                  min="5"
                  step="5"
                />
              </div>

              <div className="form-group">
                <label>Priority (1-5)</label>
                <input
                  type="number"
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(parseInt(e.target.value))}
                  min="1"
                  max="5"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                placeholder="Additional details"
                rows={3}
              />
            </div>

            <div className="modal-actions">
              <button className="secondary" onClick={handleCloseTaskModal}>
                Cancel
              </button>
              <button
                onClick={editingTask ? handleSaveTask : handleCreateTask}
                disabled={!taskTitle.trim()}
              >
                {editingTask ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLinkModal && (
        <div className="modal-overlay" onClick={() => setShowLinkModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Link</h2>

            <div className="form-group">
              <label>URL *</label>
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => handleLinkUrlChange(e.target.value)}
                placeholder="https://example.com"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Title {fetchingTitle && '(fetching...)'}</label>
              <input
                type="text"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder="Optional - will use URL if empty"
                disabled={fetchingTitle}
              />
              {!linkTitle && !fetchingTitle && (
                <small style={{ color: '#666', fontSize: '0.875rem' }}>
                  Title will be auto-fetched from URL if possible
                </small>
              )}
            </div>

            <div className="modal-actions">
              <button className="secondary" onClick={() => setShowLinkModal(false)}>
                Cancel
              </button>
              <button
                onClick={handleSaveLink}
                disabled={!linkUrl.trim() || fetchingTitle}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && project && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Delete Project?</h2>
            <p>
              Are you sure you want to delete <strong>{project.name}</strong>?
            </p>
            <p className="warning-text">
              This will permanently delete all captures, tasks, and summaries for this project. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button className="danger" onClick={handleConfirmDelete}>
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CaptureAccordion({
  capture,
  isExpanded,
  onToggle,
  onEdit,
  onDelete
}: {
  capture: Capture
  isExpanded: boolean
  onToggle: () => void
  onEdit: (capture: Capture) => void
  onDelete: (id: string, title: string) => void
}) {
  const [transcription, setTranscription] = useState<Transcription | null>(null)
  const [imageData, setImageData] = useState<string | null>(null)
  const [audioData, setAudioData] = useState<string | null>(null)

  useEffect(() => {
    if (capture.type === 'audio') {
      loadTranscription()
      if (capture.filePath) {
        loadAudio()
      }
    } else if (capture.type === 'image' && capture.filePath) {
      loadImage()
    }
  }, [capture])

  const loadTranscription = async () => {
    const trans = await window.electron.captures.getTranscription(capture.id)
    setTranscription(trans || null)
  }

  const loadImage = async () => {
    if (!capture.filePath) return
    try {
      const arrayBuffer = await window.electron.files.readImage(capture.filePath)
      const blob = new Blob([arrayBuffer])
      const url = URL.createObjectURL(blob)
      setImageData(url)
    } catch (error) {
      console.error('Failed to load image:', error)
    }
  }

  const loadAudio = async () => {
    if (!capture.filePath) return
    try {
      const arrayBuffer = await window.electron.files.readAudio(capture.filePath)
      const blob = new Blob([arrayBuffer], { type: 'audio/webm' })
      const url = URL.createObjectURL(blob)
      setAudioData(url)
    } catch (error) {
      console.error('Failed to load audio:', error)
    }
  }

  return (
    <div
      className={`capture-accordion ${isExpanded ? 'expanded' : ''}`}
      draggable={true}
      onDragStart={(e) => {
        const dragData = {
          type: 'capture',
          id: capture.id,
          title: capture.title || `${capture.type} capture`,
          data: capture
        }
        e.dataTransfer.setData('application/json', JSON.stringify(dragData))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      style={{ cursor: 'grab' }}
    >
      <div className="accordion-header" onClick={onToggle}>
        <div className="accordion-title">
          <span className={`capture-type capture-type-${capture.type}`}>
            {capture.type}
          </span>
          <h3>{capture.title || `Untitled ${capture.type} note`}</h3>
          <span className="capture-date">
            {new Date(capture.createdAt).toLocaleString()}
          </span>
        </div>
        <div className="accordion-controls" onClick={(e) => e.stopPropagation()}>
          <div className="capture-actions">
            {capture.type === 'text' && (
              <button className="capture-action-btn" onClick={() => onEdit(capture)} title="Edit">
                ✏️
              </button>
            )}
            <button className="capture-action-btn delete" onClick={() => onDelete(capture.id, capture.title || `Untitled ${capture.type} note`)} title="Delete">
              🗑️
            </button>
          </div>
          <span className="accordion-icon">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="accordion-content">
          {capture.type === 'chat' && capture.bodyText && (() => {
            try {
              const messages: ChatMessageType[] = JSON.parse(capture.bodyText)
              return (
                <div className="chat-messages-replay">
                  {messages.map((msg, index) => (
                    <ChatMessage key={index} message={msg} />
                  ))}
                </div>
              )
            } catch (error) {
              console.error('Failed to parse chat messages:', error)
              return <div className="capture-body">Error loading chat transcript</div>
            }
          })()}
          {capture.type !== 'chat' && capture.bodyText && (
            <div className="capture-body">
              <MarkdownRenderer content={capture.bodyText} className="md-capture" />
            </div>
          )}
          {imageData && <img src={imageData} alt={capture.title} className="capture-image" />}
          {capture.type === 'audio' && audioData && (
            <div className="audio-player-container">
              <audio controls src={audioData} className="audio-player">
                Your browser does not support the audio element.
              </audio>
            </div>
          )}
          {capture.type === 'audio' && transcription && (
            <div className="transcription">
              <strong>Transcription:</strong>
              <p className={`transcription-${transcription.status}`}>
                {transcription.status === 'done' && transcription.text}
                {transcription.status === 'pending' && 'Transcribing...'}
                {transcription.status === 'error' &&
                  `Error: ${transcription.errorMessage || 'Unknown error'}`}
              </p>
            </div>
          )}
          {capture.type === 'link' && capture.bodyText && (
            <div className="link-capture">
              <a
                href={capture.bodyText}
                target="_blank"
                rel="noopener noreferrer"
                className="link-url"
              >
                🔗 {capture.bodyText}
              </a>
            </div>
          )}
          {capture.type === 'image' && capture.detailedDescription && (
            <div className="capture-description">
              <strong>Description:</strong>
              <p>{capture.detailedDescription}</p>
            </div>
          )}
          {capture.tags && capture.tags.length > 0 && (
            <div className="capture-tags">
              {capture.tags.map((tag, index) => (
                <span key={index} className="capture-tag">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { Project, Capture, ProjectSummary, Transcription } from '../../types'
import { useJobs } from '../contexts/JobsContext'
import './ProjectView.css'

interface ProjectViewProps {
  projectId: string
  onDeleteProject: (id: string) => void
}

export function ProjectView({ projectId, onDeleteProject }: ProjectViewProps) {
  const [project, setProject] = useState<Project | null>(null)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [summary, setSummary] = useState<ProjectSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [showTextModal, setShowTextModal] = useState(false)
  const [textTitle, setTextTitle] = useState('')
  const [textBody, setTextBody] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [filterType, setFilterType] = useState<string>('all')
  const [editingCapture, setEditingCapture] = useState<Capture | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [activeTab, setActiveTab] = useState<'summary' | 'captures'>('summary')
  const [expandedCaptures, setExpandedCaptures] = useState<Set<string>>(new Set())

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Subscribe to jobs context for this project
  const { jobs } = useJobs({ projectId })

  useEffect(() => {
    loadProject()
  }, [projectId])

  // Listen for job completions and auto-reload relevant data
  useEffect(() => {
    const completedJobs = jobs.filter(j => j.status === 'done')

    if (completedJobs.length === 0) return

    // Check most recent completed job
    const latestCompleted = completedJobs[completedJobs.length - 1]

    if (latestCompleted.type === 'image-description') {
      console.log('[ProjectView] Image description completed, reloading captures')
      loadCaptures()
    } else if (latestCompleted.type === 'summary') {
      console.log('[ProjectView] Summary completed, reloading summary')
      loadSummary()
      setGeneratingSummary(false)
    } else if (latestCompleted.type === 'transcription') {
      console.log('[ProjectView] Transcription completed, reloading captures')
      loadCaptures()
    }
  }, [jobs])

  const loadCaptures = async () => {
    try {
      const caps = await window.electron.captures.getByProject(projectId)
      setCaptures(caps)
    } catch (error) {
      console.error('Failed to reload captures:', error)
    }
  }

  const loadSummary = async () => {
    try {
      const summ = await window.electron.summaries.getLatest(projectId)
      setSummary(summ || null)
    } catch (error) {
      console.error('Failed to reload summary:', error)
    }
  }

  // Listen for global hotkey trigger
  useEffect(() => {
    const handleTriggerUpload = () => {
      console.log('[ProjectView] Global hotkey triggered, opening file picker')
      handleUploadImage()
    }

    if (window.electron.onTriggerImageUpload) {
      window.electron.onTriggerImageUpload(handleTriggerUpload)
    }

    return () => {
      if (window.electron.offTriggerImageUpload) {
        window.electron.offTriggerImageUpload(handleTriggerUpload)
      }
    }
  }, [projectId]) // Re-register when project changes

  const loadProject = async () => {
    setLoading(true)
    try {
      const proj = await window.electron.projects.get(projectId)
      const caps = await window.electron.captures.getByProject(projectId)
      const summ = await window.electron.summaries.getLatest(projectId)

      setProject(proj)
      setCaptures(caps)
      setSummary(summ || null)
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

  const handleCreateTextCapture = async () => {
    if (!textTitle.trim()) return

    try {
      await window.electron.captures.create({
        projectId,
        type: 'text',
        title: textTitle.trim(),
        bodyText: textBody.trim()
      })

      setTextTitle('')
      setTextBody('')
      setShowTextModal(false)
      await loadProject()
    } catch (error) {
      console.error('Failed to create text capture:', error)
    }
  }

  const handleImageDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))

    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const extension = file.name.split('.').pop() || 'png'
        const filePath = await window.electron.files.saveImage(projectId, arrayBuffer, extension)

        await window.electron.captures.create({
          projectId,
          type: 'image',
          title: file.name,
          filePath
        })
      } catch (error) {
        console.error('Failed to save image:', error)
      }
    }

    await loadProject()
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

        await window.electron.captures.create({
          projectId,
          type: 'image',
          title: `Pasted image ${new Date().toLocaleString()}`,
          filePath
        })
      } catch (error) {
        console.error('Failed to save pasted image:', error)
      }
    }

    await loadProject()
  }

  const handleStartRecording = async () => {
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
          const filePath = await window.electron.files.saveAudio(projectId, arrayBuffer)

          const capture = await window.electron.captures.create({
            projectId,
            type: 'audio',
            title: `Recording ${new Date().toLocaleString()}`,
            filePath
          })

          // Request transcription
          await window.electron.audio.requestTranscription(capture.id, filePath)

          await loadProject()
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

  const handleEditCapture = (capture: Capture) => {
    setEditingCapture(capture)
    setEditTitle(capture.title)
    setEditBody(capture.bodyText || '')
  }

  const handleSaveEdit = async () => {
    if (!editingCapture || !editTitle.trim()) return

    try {
      await window.electron.captures.update(editingCapture.id, editTitle.trim(), editBody.trim())
      setEditingCapture(null)
      setEditTitle('')
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

      // Reload project to show new capture
      console.log('[handleUploadImage] Reloading project...')
      await loadProject()
      console.log('[handleUploadImage] Project reloaded successfully')
    } catch (error) {
      console.error('[handleUploadImage] ERROR:', error)
      alert(`Failed to upload image: ${error}`)
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
      onDragOver={(e) => e.preventDefault()}
      onPaste={handleImagePaste}
    >
      <div className="project-header">
        <h1>{project.name}</h1>
        <button className="danger" onClick={() => onDeleteProject(project.id)}>
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
      </div>

      {activeTab === 'summary' && (
        <div className="tab-content">
          <div className="project-summary-panel">
            <div className="summary-header">
              <h2>Project Summary</h2>
              <button onClick={handleGenerateSummary} disabled={generatingSummary}>
                {generatingSummary ? 'Generating...' : 'Regenerate'}
              </button>
            </div>
            {summary ? (
              <div className="summary-content">
                <ReactMarkdown>{summary.summaryMd}</ReactMarkdown>
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
                </select>
              </div>
              <div className="capture-actions">
                <button onClick={handleUploadImage}>📷 Image</button>
                <button onClick={() => setShowTextModal(true)}>+ Text</button>
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

      {showTextModal && (
        <div className="modal-overlay" onClick={() => setShowTextModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Text Capture</h2>
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                placeholder="Enter title"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Notes (optional)</label>
              <textarea
                value={textBody}
                onChange={(e) => setTextBody(e.target.value)}
                placeholder="Enter details"
              />
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setShowTextModal(false)}>
                Cancel
              </button>
              <button onClick={handleCreateTextCapture} disabled={!textTitle.trim()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {editingCapture && (
        <div className="modal-overlay" onClick={() => setEditingCapture(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Text Capture</h2>
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Enter title"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Notes (optional)</label>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Enter details"
              />
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setEditingCapture(null)}>
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={!editTitle.trim()}>
                Save
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

  useEffect(() => {
    if (capture.type === 'audio') {
      loadTranscription()
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

  return (
    <div className={`capture-accordion ${isExpanded ? 'expanded' : ''}`}>
      <div className="accordion-header" onClick={onToggle}>
        <div className="accordion-title">
          <span className={`capture-type capture-type-${capture.type}`}>
            {capture.type}
          </span>
          <h3>{capture.title}</h3>
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
            <button className="capture-action-btn delete" onClick={() => onDelete(capture.id, capture.title)} title="Delete">
              🗑️
            </button>
          </div>
          <span className="accordion-icon">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="accordion-content">
          {capture.bodyText && (
            <div className="capture-body">
              <ReactMarkdown>{capture.bodyText}</ReactMarkdown>
            </div>
          )}
          {imageData && <img src={imageData} alt={capture.title} className="capture-image" />}
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
        </div>
      )}
    </div>
  )
}

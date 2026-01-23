import { useState, useEffect } from 'react'
import { CalendarEvent, Task, TimeBlock } from '../../types'
import './PlannerView.css'

export function PlannerView() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [loading, setLoading] = useState(false)
  const [showICSInput, setShowICSInput] = useState(false)
  const [icsText, setIcsText] = useState('')
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskEstimate, setNewTaskEstimate] = useState(30)
  const [newTaskPriority, setNewTaskPriority] = useState(3)
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null)

  useEffect(() => {
    loadData()
  }, [selectedDate])

  const loadData = async () => {
    setLoading(true)
    try {
      const evts = await window.electron.calendar.getEventsForDate(selectedDate)
      const tsks = await window.electron.tasks.getOpen()
      const plan = await window.electron.planning.get(selectedDate)

      setEvents(evts)
      setTasks(tsks)

      if (plan) {
        setBlocks(plan.blocks)
      } else {
        setBlocks([])
      }
    } catch (error) {
      console.error('Failed to load planner data:', error)
    }
    setLoading(false)
  }

  const handleImportICSFile = async () => {
    const icsContent = await window.electron.calendar.importICS()
    if (icsContent) {
      await window.electron.calendar.parseICS(icsContent)
      await loadData()
    }
  }

  const handleImportICSText = async () => {
    if (!icsText.trim()) return

    try {
      await window.electron.calendar.parseICS(icsText)
      setIcsText('')
      setShowICSInput(false)
      await loadData()
    } catch (error) {
      console.error('Failed to parse ICS:', error)
      alert('Failed to parse ICS content')
    }
  }

  const handleGeneratePlan = async () => {
    setLoading(true)
    try {
      const generatedBlocks = await window.electron.planning.generate(selectedDate)
      setBlocks(generatedBlocks)
    } catch (error) {
      console.error('Failed to generate plan:', error)
      alert('Failed to generate plan')
    }
    setLoading(false)
  }

  const handleSavePlan = async () => {
    try {
      await window.electron.planning.save(selectedDate, blocks)
      await loadData()
      alert('Plan saved successfully')
    } catch (error) {
      console.error('Failed to save plan:', error)
      alert('Failed to save plan')
    }
  }

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return

    try {
      await window.electron.tasks.create({
        title: newTaskTitle.trim(),
        estimateMinutes: newTaskEstimate,
        priority: newTaskPriority
      })

      setNewTaskTitle('')
      setNewTaskEstimate(30)
      setNewTaskPriority(3)
      setShowTaskModal(false)
      await loadData()
    } catch (error) {
      console.error('Failed to create task:', error)
    }
  }

  const handleEditBlock = (block: TimeBlock) => {
    setEditingBlock({ ...block })
  }

  const handleSaveBlockEdit = async () => {
    if (!editingBlock || !editingBlock.id) return

    try {
      await window.electron.planning.updateBlock(editingBlock.id, editingBlock)
      setEditingBlock(null)
      await loadData()
    } catch (error) {
      console.error('Failed to update block:', error)
    }
  }

  const handleDeleteBlock = async (blockId: string) => {
    if (!confirm('Delete this block?')) return

    try {
      await window.electron.planning.deleteBlock(blockId)
      await loadData()
    } catch (error) {
      console.error('Failed to delete block:', error)
    }
  }

  return (
    <div className="planner-view">
      <div className="planner-header">
        <h1>Day Planner</h1>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>

      <div className="planner-sections">
        <div className="planner-section">
          <div className="section-header">
            <h2>Calendar Events</h2>
            <div>
              <button onClick={handleImportICSFile}>Import .ics File</button>
              <button onClick={() => setShowICSInput(!showICSInput)}>
                Paste ICS Text
              </button>
            </div>
          </div>
          {showICSInput && (
            <div className="ics-input-panel">
              <textarea
                value={icsText}
                onChange={(e) => setIcsText(e.target.value)}
                placeholder="Paste ICS content here..."
                rows={6}
              />
              <button onClick={handleImportICSText} disabled={!icsText.trim()}>
                Import
              </button>
            </div>
          )}
          <div className="events-list">
            {events.map((event) => (
              <div key={event.id} className="event-card">
                <strong>{event.title}</strong>
                <div className="event-time">
                  {new Date(event.startDt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}{' '}
                  -{' '}
                  {new Date(event.endDt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <div className="empty-state">No events for this day</div>
            )}
          </div>
        </div>

        <div className="planner-section">
          <div className="section-header">
            <h2>Open Tasks</h2>
            <button onClick={() => setShowTaskModal(true)}>+ Task</button>
          </div>
          <div className="tasks-list">
            {tasks.map((task) => (
              <div key={task.id} className="task-card">
                <strong>{task.title}</strong>
                <div className="task-meta">
                  Priority: {task.priority} | {task.estimateMinutes}min
                </div>
              </div>
            ))}
            {tasks.length === 0 && <div className="empty-state">No open tasks</div>}
          </div>
        </div>
      </div>

      <div className="plan-section">
        <div className="section-header">
          <h2>Generated Plan</h2>
          <div>
            <button onClick={handleGeneratePlan} disabled={loading}>
              {loading ? 'Generating...' : 'Generate Plan'}
            </button>
            {blocks.length > 0 && (
              <button onClick={handleSavePlan}>Commit Plan</button>
            )}
          </div>
        </div>

        <div className="blocks-list">
          {blocks.map((block, index) => (
            <div key={block.id || index} className="block-card">
              <div className="block-time">
                {new Date(block.startDt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}{' '}
                -{' '}
                {new Date(block.endDt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
              <div className="block-label">{block.label}</div>
              {block.notes && <div className="block-notes">{block.notes}</div>}
              {block.id && (
                <div className="block-actions">
                  <button onClick={() => handleEditBlock(block)}>Edit</button>
                  <button onClick={() => handleDeleteBlock(block.id!)}>Delete</button>
                </div>
              )}
            </div>
          ))}
          {blocks.length === 0 && (
            <div className="empty-state">
              No plan generated yet. Click Generate Plan to create one.
            </div>
          )}
        </div>
      </div>

      {showTaskModal && (
        <div className="modal-overlay" onClick={() => setShowTaskModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Task</h2>
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                autoFocus
                placeholder="Task title"
              />
            </div>
            <div className="form-group">
              <label>Estimate (minutes)</label>
              <input
                type="number"
                value={newTaskEstimate}
                onChange={(e) => setNewTaskEstimate(parseInt(e.target.value))}
                min={5}
                step={5}
              />
            </div>
            <div className="form-group">
              <label>Priority (1-5, higher is more important)</label>
              <input
                type="number"
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(parseInt(e.target.value))}
                min={1}
                max={5}
              />
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setShowTaskModal(false)}>
                Cancel
              </button>
              <button onClick={handleCreateTask} disabled={!newTaskTitle.trim()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {editingBlock && (
        <div className="modal-overlay" onClick={() => setEditingBlock(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Block</h2>
            <div className="form-group">
              <label>Label</label>
              <input
                type="text"
                value={editingBlock.label}
                onChange={(e) =>
                  setEditingBlock({ ...editingBlock, label: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label>Start Time</label>
              <input
                type="time"
                value={new Date(editingBlock.startDt).toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                onChange={(e) => {
                  const [hours, minutes] = e.target.value.split(':')
                  const newDate = new Date(editingBlock.startDt)
                  newDate.setHours(parseInt(hours), parseInt(minutes))
                  setEditingBlock({ ...editingBlock, startDt: newDate })
                }}
              />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <input
                type="time"
                value={new Date(editingBlock.endDt).toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                onChange={(e) => {
                  const [hours, minutes] = e.target.value.split(':')
                  const newDate = new Date(editingBlock.endDt)
                  newDate.setHours(parseInt(hours), parseInt(minutes))
                  setEditingBlock({ ...editingBlock, endDt: newDate })
                }}
              />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={editingBlock.notes || ''}
                onChange={(e) =>
                  setEditingBlock({ ...editingBlock, notes: e.target.value })
                }
              />
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setEditingBlock(null)}>
                Cancel
              </button>
              <button onClick={handleSaveBlockEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

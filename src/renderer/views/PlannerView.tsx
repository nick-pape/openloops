import { useState, useEffect } from 'react'
import { CalendarEvent, Task, TimeBlock, DayPlan } from '../../types'
import './PlannerView.css'

export function PlannerView() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [plan, setPlan] = useState<DayPlan | null>(null)
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

  // Subscribe to domain events for live updates
  useEffect(() => {
    const handleDomainEvent = (event: any) => {
      console.log('[PlannerView] Domain event received:', event.type)
      // Reload plan if it's affected by this event
      if (event.type.startsWith('plan.') || event.type.startsWith('planning.')) {
        console.log('[PlannerView] Reloading plan due to event:', event.type)
        loadData()
      }
    }

    window.electron.onDomainEvent(handleDomainEvent)
    return () => window.electron.offDomainEvent(handleDomainEvent)
  }, []) // Empty deps - subscribe once, loadData uses current state via closure

  const loadData = async () => {
    setLoading(true)
    try {
      const evts = await window.electron.calendar.getEventsForDate(selectedDate)
      const tsks = await window.electron.tasks.getOpen()
      const planData = await window.electron.planning.get(selectedDate)

      setEvents(evts)
      setTasks(tsks)

      if (planData) {
        setPlan(planData.plan)
        setBlocks(planData.blocks)
      } else {
        setPlan(null)
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

  const handleDiscardDraft = async () => {
    if (!confirm('Discard this draft plan? This cannot be undone.')) return

    try {
      setLoading(true)
      // Delete the draft plan
      if (plan?.id) {
        await window.electron.planning.delete(plan.id)
      }
      await loadData()
    } catch (error) {
      console.error('Failed to discard draft:', error)
      alert('Failed to discard draft')
    }
    setLoading(false)
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
    // Can't edit locked blocks
    if (block.locked) {
      alert('This block is locked and cannot be edited')
      return
    }

    // Can't edit committed plans
    if (plan?.status === 'committed') {
      alert('Cannot edit blocks in a committed plan')
      return
    }

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

  // Build unified timeline combining events and blocks
  const timelineItems = [
    ...events.map(event => ({
      type: 'event' as const,
      startDt: event.startDt,
      endDt: event.endDt,
      title: event.title,
      data: event
    })),
    ...blocks.map(block => ({
      type: 'block' as const,
      startDt: block.startDt,
      endDt: block.endDt,
      title: block.label,
      data: block
    }))
  ].sort((a, b) => new Date(a.startDt).getTime() - new Date(b.startDt).getTime())

  const getBlockKindIcon = (kind: string) => {
    switch (kind) {
      case 'task': return '✓'
      case 'focus': return '🎯'
      case 'break': return '☕'
      case 'buffer': return '⏸'
      case 'admin': return '📋'
      case 'calendar_fixed': return '📅'
      default: return '•'
    }
  }

  const getBlockKindClass = (kind: string) => {
    return `block-kind-${kind}`
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

      {plan && (
        <div className={`plan-status plan-status-${plan.status}`}>
          <span className="status-label">
            {plan.status === 'draft' ? '📝 Draft Plan' : '✅ Committed Plan'}
          </span>
          {plan.status === 'draft' && (
            <button className="discard-btn" onClick={handleDiscardDraft} disabled={loading}>
              Discard Draft
            </button>
          )}
        </div>
      )}

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
          <h2>Timeline</h2>
          <div className="timeline-legend">
            <span className="legend-item">📅 Calendar Event</span>
            <span className="legend-item">✓ Task Block</span>
            <span className="legend-item">🎯 Focus Block</span>
            <span className="legend-item">🔒 Locked</span>
          </div>
        </div>

        {!plan && (
          <div className="empty-state">
            <p>No plan for this day yet.</p>
            <p className="chat-hint">Ask the AI assistant to create a plan for you!</p>
          </div>
        )}

        {plan && timelineItems.length === 0 && (
          <div className="empty-state">
            <p>Plan is empty.</p>
            <p className="chat-hint">Ask the AI assistant to add blocks to your plan.</p>
          </div>
        )}

        <div className="timeline">
          {timelineItems.map((item, index) => {
            if (item.type === 'event') {
              const event = item.data as CalendarEvent
              return (
                <div key={`event-${event.id}`} className="timeline-item timeline-event">
                  <div className="timeline-time">
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
                  <div className="timeline-content">
                    <span className="timeline-icon">📅</span>
                    <span className="timeline-label">{event.title}</span>
                    <span className="timeline-badge">Calendar Event</span>
                  </div>
                </div>
              )
            } else {
              const block = item.data as TimeBlock
              return (
                <div
                  key={`block-${block.id || index}`}
                  className={`timeline-item timeline-block ${getBlockKindClass(block.kind)}`}
                >
                  <div className="timeline-time">
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
                  <div className="timeline-content">
                    <span className="timeline-icon">{getBlockKindIcon(block.kind)}</span>
                    <span className="timeline-label">{block.label}</span>
                    {block.locked && <span className="timeline-badge timeline-locked">🔒 Locked</span>}
                    {block.notes && <div className="timeline-notes">{block.notes}</div>}
                  </div>
                  {block.id && plan?.status !== 'committed' && !block.locked && (
                    <div className="timeline-actions">
                      <button className="action-btn" onClick={() => handleEditBlock(block)}>Edit</button>
                      <button className="action-btn delete-btn" onClick={() => handleDeleteBlock(block.id!)}>Delete</button>
                    </div>
                  )}
                </div>
              )
            }
          })}
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

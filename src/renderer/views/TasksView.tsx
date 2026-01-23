import { useState, useEffect } from 'react'
import { Task, Project } from '../../types'
import './TasksView.css'

export function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  // Task form state
  const [taskTitle, setTaskTitle] = useState('')
  const [taskProjectId, setTaskProjectId] = useState<string>('')
  const [taskEstimate, setTaskEstimate] = useState(30)
  const [taskPriority, setTaskPriority] = useState(3)
  const [taskNotes, setTaskNotes] = useState('')

  // Filters
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'done'>('open')
  const [filterPriority, setFilterPriority] = useState<number | null>(null)

  useEffect(() => {
    loadData()
  }, [filterStatus])

  const loadData = async () => {
    setLoading(true)
    try {
      const [allProjects, allTasks] = await Promise.all([
        window.electron.projects.getAll(),
        window.electron.tasks.getOpen()
      ])

      setProjects(allProjects)
      setTasks(allTasks)
    } catch (error) {
      console.error('Failed to load tasks:', error)
    }
    setLoading(false)
  }

  const handleCreateTask = async () => {
    if (!taskTitle.trim()) return

    try {
      await window.electron.tasks.create({
        title: taskTitle.trim(),
        projectId: taskProjectId || undefined,
        estimateMinutes: taskEstimate,
        priority: taskPriority,
        notes: taskNotes.trim() || undefined
      })

      resetForm()
      setShowTaskModal(false)
      await loadData()
    } catch (error) {
      console.error('Failed to create task:', error)
      alert('Failed to create task')
    }
  }

  const handleEditTask = (task: Task) => {
    setEditingTask(task)
    setTaskTitle(task.title)
    setTaskProjectId(task.projectId || '')
    setTaskEstimate(task.estimateMinutes)
    setTaskPriority(task.priority)
    setTaskNotes(task.notes || '')
    setShowTaskModal(true)
  }

  const handleSaveEdit = async () => {
    if (!editingTask || !taskTitle.trim()) return

    try {
      await window.electron.tasks.update(editingTask.id, {
        title: taskTitle.trim(),
        projectId: taskProjectId || null,
        estimateMinutes: taskEstimate,
        priority: taskPriority,
        notes: taskNotes.trim() || undefined
      })

      resetForm()
      setEditingTask(null)
      setShowTaskModal(false)
      await loadData()
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
      await loadData()
    } catch (error) {
      console.error('Failed to toggle task status:', error)
    }
  }

  const handleDeleteTask = async (task: Task) => {
    if (!confirm(`Delete task "${task.title}"?`)) return

    try {
      await window.electron.tasks.delete(task.id)
      await loadData()
    } catch (error) {
      console.error('Failed to delete task:', error)
      alert('Failed to delete task')
    }
  }

  const resetForm = () => {
    setTaskTitle('')
    setTaskProjectId('')
    setTaskEstimate(30)
    setTaskPriority(3)
    setTaskNotes('')
  }

  const handleCloseModal = () => {
    resetForm()
    setEditingTask(null)
    setShowTaskModal(false)
  }

  // Group tasks
  const inboxTasks = tasks.filter(t => !t.projectId)
  const tasksByProject = projects.reduce((acc, project) => {
    const projectTasks = tasks.filter(t => t.projectId === project.id)
    if (projectTasks.length > 0) {
      acc[project.id] = { project, tasks: projectTasks }
    }
    return acc
  }, {} as Record<string, { project: Project; tasks: Task[] }>)

  // Apply filters
  const filterTasks = (taskList: Task[]) => {
    let filtered = taskList

    if (filterStatus !== 'all') {
      filtered = filtered.filter(t => t.status === filterStatus)
    }

    if (filterPriority !== null) {
      filtered = filtered.filter(t => t.priority === filterPriority)
    }

    return filtered
  }

  if (loading) {
    return <div className="loading">Loading tasks...</div>
  }

  return (
    <div className="tasks-view">
      <div className="tasks-header">
        <h1>Tasks</h1>
        <button onClick={() => setShowTaskModal(true)}>+ New Task</button>
      </div>

      <div className="tasks-filters">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="done">Done</option>
        </select>

        <select
          value={filterPriority || ''}
          onChange={(e) => setFilterPriority(e.target.value ? parseInt(e.target.value) : null)}
        >
          <option value="">All Priorities</option>
          <option value="5">P5 (Critical)</option>
          <option value="4">P4 (High)</option>
          <option value="3">P3 (Medium)</option>
          <option value="2">P2 (Low)</option>
          <option value="1">P1 (Nice to have)</option>
        </select>
      </div>

      <div className="tasks-groups">
        {/* Inbox Tasks */}
        {inboxTasks.length > 0 && (
          <div className="task-group">
            <h2 className="group-header">
              📥 Inbox ({filterTasks(inboxTasks).length})
            </h2>
            <div className="task-list">
              {filterTasks(inboxTasks).map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  projectName={null}
                  onToggle={handleToggleTaskStatus}
                  onEdit={handleEditTask}
                  onDelete={handleDeleteTask}
                />
              ))}
            </div>
          </div>
        )}

        {/* Tasks by Project */}
        {Object.values(tasksByProject).map(({ project, tasks: projectTasks }) => {
          const filtered = filterTasks(projectTasks)
          if (filtered.length === 0) return null

          return (
            <div key={project.id} className="task-group">
              <h2 className="group-header">
                📁 {project.name} ({filtered.length})
              </h2>
              <div className="task-list">
                {filtered.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    projectName={project.name}
                    onToggle={handleToggleTaskStatus}
                    onEdit={handleEditTask}
                    onDelete={handleDeleteTask}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {tasks.length === 0 && (
          <div className="tasks-empty">
            No tasks yet. Click "+ New Task" to create one.
          </div>
        )}
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
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

            <div className="form-group">
              <label>Project</label>
              <select value={taskProjectId} onChange={(e) => setTaskProjectId(e.target.value)}>
                <option value="">Inbox (no project)</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
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
              <button className="secondary" onClick={handleCloseModal}>
                Cancel
              </button>
              <button
                onClick={editingTask ? handleSaveEdit : handleCreateTask}
                disabled={!taskTitle.trim()}
              >
                {editingTask ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface TaskCardProps {
  task: Task
  projectName: string | null
  onToggle: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}

function TaskCard({ task, projectName, onToggle, onEdit, onDelete }: TaskCardProps) {
  return (
    <div className={`task-card ${task.status === 'done' ? 'done' : ''}`}>
      <div className="task-card-header">
        <input
          type="checkbox"
          checked={task.status === 'done'}
          onChange={() => onToggle(task)}
        />
        <span className={`priority-badge priority-${task.priority}`}>
          P{task.priority}
        </span>
        <h3 className="task-title">{task.title}</h3>
      </div>

      <div className="task-card-meta">
        <span className="task-estimate">{task.estimateMinutes} min</span>

        <div className="task-actions">
          <button className="icon-btn" onClick={() => onEdit(task)} title="Edit">
            ✏️
          </button>
          <button className="icon-btn delete" onClick={() => onDelete(task)} title="Delete">
            🗑️
          </button>
        </div>
      </div>

      {task.notes && (
        <div className="task-notes">{task.notes}</div>
      )}
    </div>
  )
}

# Task Management - Spec

**Status:** ✅ Completed
**Phase:** Core
**Completed:** 2026-01-23

## Overview

Create and manage tasks with priorities and time estimates for day planning integration.

## Goals

1. **Quick Task Entry**: Simple form for creating tasks
2. **Priority System**: Numeric priorities for planning algorithm
3. **Time Estimates**: Duration estimates for time blocking
4. **Project Linking**: Tasks can be project-specific or global
5. **Status Tracking**: Open vs. completed tasks

## User Flow

### Creating a Task

1. User navigates to Planner view
2. Clicks "+ New Task" button
3. Modal opens with fields:
   - **Title** (required): Task name
   - **Estimate** (default: 30): Duration in minutes
   - **Priority** (default: 3): 1-5 scale
   - **Notes** (optional): Additional details
4. User fills in details
5. Clicks "Create" button
6. Task appears in sidebar
7. Available for day planning

### Editing a Task

1. User finds task in sidebar
2. Clicks ✏️ edit button
3. Edit modal opens with current values
4. User modifies fields
5. Clicks "Save" button
6. Task updates in sidebar

### Deleting a Task

1. User clicks 🗑️ delete button on task
2. Browser confirmation appears
3. User confirms deletion
4. Task removed from sidebar
5. Any linked time blocks updated

### Using Tasks in Planning

1. Tasks automatically appear in planner sidebar
2. "Generate Plan" allocates tasks to free time:
   - Highest priority tasks first
   - Respects time estimates
   - Fits within working hours
3. Generated blocks linked to tasks
4. Completing plan marks associated tasks

## Technical Implementation

### Task Creation

**UI Modal:**
```tsx
<div className="modal-overlay" onClick={closeModal}>
  <div className="modal" onClick={stopPropagation}>
    <h2>New Task</h2>
    <div className="form-group">
      <label>Title</label>
      <input
        type="text"
        value={newTaskTitle}
        onChange={(e) => setNewTaskTitle(e.target.value)}
        placeholder="Task name"
        autoFocus
      />
    </div>
    <div className="form-group">
      <label>Estimate (minutes)</label>
      <input
        type="number"
        value={newTaskEstimate}
        onChange={(e) => setNewTaskEstimate(parseInt(e.target.value))}
        min="5"
        step="5"
      />
    </div>
    <div className="form-group">
      <label>Priority (1-5)</label>
      <input
        type="number"
        value={newTaskPriority}
        onChange={(e) => setNewTaskPriority(parseInt(e.target.value))}
        min="1"
        max="5"
      />
    </div>
    <div className="form-group">
      <label>Notes</label>
      <textarea
        value={newTaskNotes}
        onChange={(e) => setNewTaskNotes(e.target.value)}
        placeholder="Additional details"
      />
    </div>
    <div className="modal-actions">
      <button className="secondary" onClick={closeModal}>Cancel</button>
      <button onClick={handleCreate} disabled={!newTaskTitle.trim()}>
        Create
      </button>
    </div>
  </div>
</div>
```

**Create Handler:**
```typescript
const handleCreateTask = async () => {
  if (!newTaskTitle.trim()) return

  try {
    await window.electron.tasks.create({
      title: newTaskTitle.trim(),
      estimateMinutes: newTaskEstimate,
      priority: newTaskPriority,
      notes: newTaskNotes.trim() || undefined,
      projectId: undefined // Global task
    })

    setNewTaskTitle('')
    setNewTaskEstimate(30)
    setNewTaskPriority(3)
    setNewTaskNotes('')
    setShowTaskModal(false)

    await loadData()
  } catch (error) {
    console.error('Failed to create task:', error)
    alert('Failed to create task')
  }
}
```

### Database Schema

```typescript
interface Task {
  id: string                  // UUID
  projectId?: string          // Optional project link
  title: string               // Task name
  notes?: string              // Optional details
  status: 'open' | 'done'     // Completion status
  priority: number            // 1-5, higher = more important
  estimateMinutes: number     // Duration estimate
  dueDate?: Date              // Optional due date
  createdAt: Date
  updatedAt: Date
}
```

### IPC Handlers

**Create Task:**
```typescript
ipcMain.handle('tasks:create', async (_, input: {
  title: string
  estimateMinutes: number
  priority: number
  notes?: string
  projectId?: string
}) => {
  return repository.createTask({
    id: uuidv4(),
    title: input.title,
    estimateMinutes: input.estimateMinutes,
    priority: input.priority,
    notes: input.notes,
    projectId: input.projectId,
    status: 'open',
    createdAt: new Date(),
    updatedAt: new Date()
  })
})
```

**Get Open Tasks:**
```typescript
ipcMain.handle('tasks:getOpen', async (_, projectId?: string) => {
  return repository.getOpenTasks(projectId)
})
```

**Update Task:**
```typescript
ipcMain.handle('tasks:update', async (_, id: string, input: Partial<Task>) => {
  return repository.updateTask(id, input)
})
```

**Delete Task:**
```typescript
ipcMain.handle('tasks:delete', async (_, id: string) => {
  await repository.deleteTask(id)
})
```

### Task Display

**Sidebar List:**
```tsx
<div className="tasks-sidebar">
  <div className="sidebar-header">
    <h3>Open Tasks ({tasks.length})</h3>
    <button onClick={() => setShowTaskModal(true)}>+ New Task</button>
  </div>

  <div className="task-list">
    {tasks
      .sort((a, b) => b.priority - a.priority)
      .map(task => (
        <div key={task.id} className="task-item">
          <div className="task-header">
            <span className={`priority-badge priority-${task.priority}`}>
              P{task.priority}
            </span>
            <span className="task-title">{task.title}</span>
          </div>
          <div className="task-meta">
            <span className="task-estimate">{task.estimateMinutes} min</span>
            <div className="task-actions">
              <button onClick={() => handleEditTask(task)}>✏️</button>
              <button onClick={() => handleDeleteTask(task.id)}>🗑️</button>
            </div>
          </div>
          {task.notes && (
            <div className="task-notes">{task.notes}</div>
          )}
        </div>
      ))}
  </div>
</div>
```

### Priority System

**Priority Levels:**
- **5**: Critical (ASAP)
- **4**: High (today/tomorrow)
- **3**: Medium (this week) - Default
- **2**: Low (when possible)
- **1**: Nice to have (someday)

**Planning Integration:**
```typescript
// Sort tasks by priority (descending) before allocation
const sortedTasks = tasks
  .filter(t => t.status === 'open')
  .sort((a, b) => b.priority - a.priority)
```

### Time Estimates

**Common Durations:**
- 15 min: Quick tasks
- 30 min: Standard task (default)
- 60 min: Medium task
- 120 min: Large task
- Custom: Any 5-min increment

**Planning Usage:**
```typescript
const durationMs = task.estimateMinutes * 60 * 1000
const blockEnd = new Date(slot.startDt.getTime() + durationMs)
```

## Features Implemented

✅ CRUD operations (Create, Read, Update, Delete)
✅ Priority system (1-5 scale)
✅ Time estimates in minutes
✅ Optional notes field
✅ Global and project-specific tasks
✅ Status tracking (open/done)
✅ Sidebar display sorted by priority
✅ Integration with day planner
✅ Task linking in time blocks
✅ Validation (title required)
✅ Form defaults (30 min, priority 3)

## UI Components

**Priority Badge Colors:**
```css
.priority-badge.priority-5 { background: #dc3545; color: white; }
.priority-badge.priority-4 { background: #fd7e14; color: white; }
.priority-badge.priority-3 { background: #ffc107; color: black; }
.priority-badge.priority-2 { background: #28a745; color: white; }
.priority-badge.priority-1 { background: #6c757d; color: white; }
```

**Task Item Layout:**
```css
.task-item {
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.task-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.task-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
  color: #666;
}
```

## Integration Points

- **Day Planner**: Tasks used for time blocking
- **Project Summaries**: Open tasks included in AI summaries
- **Time Blocks**: Tasks linked to scheduled blocks
- **Priority Sorting**: Higher priority allocated first

## Edge Cases

1. **Task too long**: If estimate exceeds available time, skipped
2. **No time left**: Lower priority tasks not allocated
3. **Equal priorities**: First-created task wins
4. **Task updates during planning**: Requires plan regeneration
5. **Deleted task with blocks**: Blocks keep label but lose link
6. **Zero-minute estimate**: Treated as 5 minutes minimum

## Future Enhancements

- [ ] Recurring tasks (daily, weekly, etc.)
- [ ] Subtasks (checklist within task)
- [ ] Task dependencies (blocked by X)
- [ ] Due dates with reminders
- [ ] Task templates
- [ ] Bulk operations (complete multiple)
- [ ] Tags/labels for categorization
- [ ] Time tracking (actual vs. estimated)
- [ ] Task history and completion stats
- [ ] Drag-and-drop reordering

---

**Dependencies:**
- SQLite for task storage
- Day planner algorithm for allocation
- React forms for CRUD UI

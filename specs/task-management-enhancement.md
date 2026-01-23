# Task Management Enhancement - Spec

**Status:** 🚧 Ready for Implementation
**Phase:** P0a (prerequisite for Work Mode)
**Priority:** High
**Last Updated:** 2026-01-23

## Summary

Enhanced task management with dedicated views for organizing work. Tasks can be project-specific or inbox/ad-hoc. Captures can link directly to tasks, and task-project assignment is flexible (can be changed later).

---

## Goals

1. **Global Task View**: See all tasks across projects
2. **Project Task Tab**: See tasks for a specific project
3. **Inbox Tasks**: Support tasks without a project (side-loaded work)
4. **Flexible Linking**: Tasks can be assigned to projects later; captures follow via joins

---

## User Flows

### Creating a Task

**From Global Tasks View:**
1. User clicks "Tools" → "Tasks" in left nav
2. Clicks "+ New Task" button
3. Modal opens with fields:
   - **Title** (required)
   - **Project** (optional dropdown, can leave unassigned)
   - **Estimate** (default: 30 min)
   - **Priority** (default: 3)
   - **Notes** (optional)
4. Clicks "Create"
5. Task appears in appropriate list

**From Project View:**
1. User in "Projects" → "My Project" → "Tasks" tab
2. Clicks "+ New Task"
3. Modal pre-fills project field
4. Rest same as above

### Viewing Tasks

**Global Tasks View (Tools → Tasks):**
- Shows all open tasks across all projects
- Grouped by:
  - **Inbox** (tasks with no project)
  - **By Project** (tasks grouped by project name)
- Can filter: Open/Done, Priority, Project
- Can sort: Priority, Created Date, Estimate

**Project Tasks Tab:**
- New tab in ProjectView (alongside Summary/Captures)
- Shows only tasks for this project
- Same list/card layout as global view

### Assigning Task to Project

1. User edits task (from either view)
2. Changes project dropdown
3. Saves
4. Task moves to new project section
5. **All captures linked to this task now appear in new project** (via join)

### Linking Captures to Tasks

**Manual Linking (Future):**
- Edit capture, add task link

**Automatic Linking (Work Mode):**
- Covered in Work Mode spec

---

## Data Model

### Updated Capture Schema

```typescript
interface Capture {
  id: string
  projectId?: string        // Set if project-level capture
  linkedTaskId?: string     // Set if task-level capture
  type: 'text' | 'image' | 'audio'
  title: string
  bodyText?: string
  filePath?: string
  metadata?: string
  createdAt: Date
  isOpenLoop?: boolean

  // CONSTRAINT: Exactly one of projectId or linkedTaskId must be set
  // NOT BOTH, NOT NEITHER
}
```

### Task Schema (existing, clarified)

```typescript
interface Task {
  id: string
  projectId?: string        // NULLABLE - inbox tasks have null
  title: string
  notes?: string
  status: 'open' | 'done'
  priority: number          // 1-5
  estimateMinutes: number
  dueDate?: Date
  createdAt: Date
  updatedAt: Date
}
```

---

## UI Components

### Left Nav Addition

**New "Tools" section:**
```
Sidebar:
├── Projects
│   └── [project list]
└── Tools                    // NEW
    ├── Tasks                // NEW
    └── Planner
```

### Global Tasks View (`/tasks`)

**Layout:**
```
┌─────────────────────────────────────────┐
│ Tasks                        + New Task │
├─────────────────────────────────────────┤
│ [Filters: Status, Project, Priority]   │
├─────────────────────────────────────────┤
│ 📥 Inbox (3)                           │
│   □ [P4] Review support ticket #123    │
│   □ [P3] Teams ping from Bob           │
│   □ [P5] Research X for meeting        │
├─────────────────────────────────────────┤
│ 📁 Project: Open Loops (2)            │
│   □ [P5] Implement work mode           │
│   □ [P3] Fix screenshot bug            │
├─────────────────────────────────────────┤
│ 📁 Project: Client Work (1)           │
│   □ [P2] Deploy feature X              │
└─────────────────────────────────────────┘
```

### Project Tasks Tab

**Added to ProjectView:**
```tsx
<div className="tabs">
  <button className={activeTab === 'summary' ? 'active' : ''}>
    Summary
  </button>
  <button className={activeTab === 'captures' ? 'active' : ''}>
    Captures
  </button>
  <button className={activeTab === 'tasks' ? 'active' : ''}>  {/* NEW */}
    Tasks
  </button>
</div>
```

**Tab content:**
- Shows tasks where `projectId = current project`
- Same card layout as global view
- Create task button pre-fills project

### Task Card Component

```tsx
<div className="task-card">
  <div className="task-header">
    <input type="checkbox" checked={task.status === 'done'} />
    <span className="priority-badge">P{task.priority}</span>
    <h3>{task.title}</h3>
  </div>
  <div className="task-meta">
    {task.projectId && (
      <span className="project-badge">{projectName}</span>
    )}
    <span className="estimate">{task.estimateMinutes} min</span>
    <button className="edit-btn">✏️</button>
    <button className="delete-btn">🗑️</button>
  </div>
  {task.notes && <p className="task-notes">{task.notes}</p>}
</div>
```

---

## Capture Display Logic

### Project View Captures Query

**Show captures where:**
```sql
SELECT * FROM captures
WHERE projectId = ?
   OR linkedTaskId IN (
     SELECT id FROM tasks WHERE projectId = ?
   )
ORDER BY createdAt DESC
```

This automatically includes:
- Project-level captures (`projectId` set)
- Task-level captures (via `linkedTaskId` → task → project join)

### Task-Linked Capture Badge

In ProjectView accordion, add badge if linked to task:
```tsx
{capture.linkedTaskId && (
  <span className="task-badge" title={taskTitle}>
    📋 {taskTitle}
  </span>
)}
```

---

## Implementation Phases

### Phase 1: Database Updates

1. **Update Captures Schema**
   - Add `linkedTaskId` column (nullable)
   - Remove `projectId NOT NULL` constraint (make nullable)
   - Add CHECK constraint: `(projectId IS NOT NULL AND linkedTaskId IS NULL) OR (projectId IS NULL AND linkedTaskId IS NOT NULL)`

2. **Migration Script**
   - Existing captures: ensure all have `projectId` set
   - New captures: validate constraint

3. **Update Repository Methods**
   - `getCapturesByProject(projectId)` - include task-linked captures
   - `getCapturesByTask(taskId)` - new method
   - `createCapture()` - validate constraint

### Phase 2: Global Tasks View

1. **Create TasksView Component**
   - File: `src/renderer/views/TasksView.tsx`
   - Route: `/tasks`
   - Layout: Grouped list (Inbox + By Project)

2. **Add to Left Nav**
   - Create "Tools" section
   - Add "Tasks" nav item

3. **Task List Component**
   - Checkbox for completion
   - Priority badge
   - Project badge (if assigned)
   - Edit/delete buttons

4. **Filters**
   - Status: Open/Done
   - Project: All/Inbox/Specific project
   - Priority: All/1-5

### Phase 3: Project Tasks Tab

1. **Update ProjectView**
   - Add "Tasks" tab
   - Create task list component
   - Pre-fill project on create

2. **Task Creation**
   - Update modal to include project dropdown
   - Load project list for dropdown
   - Optional/nullable project field

### Phase 4: Capture Linking

1. **Update Capture Queries**
   - Modify `getCapturesByProject` to include task joins
   - Add task badge to capture accordion

2. **Task Assignment Changes**
   - When task's `projectId` changes, captures follow automatically (no DB updates needed)

---

## IPC Handlers

**New/Updated:**
- `tasks:getAll()` - All tasks
- `tasks:getByProject(projectId)` - Tasks for project
- `tasks:getInbox()` - Tasks where `projectId IS NULL`
- `tasks:create(input)` - Create with optional `projectId`
- `tasks:update(id, input)` - Can update `projectId`
- `captures:getByTask(taskId)` - New query
- `captures:getByProject(projectId)` - Updated to include task joins

---

## Edge Cases

1. **Task with no project, linked captures**
   - Captures appear in global Tasks view
   - Captures don't appear in any project view
   - When task assigned to project → captures appear there

2. **Task deleted**
   - Captures with `linkedTaskId` → orphaned
   - Options:
     - Convert to project captures (set `projectId`, clear `linkedTaskId`)
     - Keep orphaned (show in "Orphaned Captures" section)
   - **Recommendation**: Convert to project captures if task had project, else delete captures

3. **Project deleted**
   - Tasks with `projectId` → should also be deleted? Or moved to inbox?
   - **Recommendation**: Move tasks to inbox (clear `projectId`)

4. **Capture constraint violation**
   - Attempting to create capture with both or neither IDs
   - Return error, don't create

---

## Acceptance Criteria

- [ ] Global Tasks view accessible from Tools → Tasks
- [ ] Tasks grouped by Inbox and Project
- [ ] Can create task with or without project
- [ ] Can assign/reassign task to different project
- [ ] Project Tasks tab shows only project tasks
- [ ] Captures linked to tasks appear in project view
- [ ] Moving task to different project moves its captures
- [ ] Inbox tasks and their captures visible in Tasks view
- [ ] Task completion checkbox works
- [ ] Filters work correctly

---

## Future Enhancements

- [ ] Kanban board view
- [ ] Task dependencies
- [ ] Recurring tasks
- [ ] Subtasks/checklists
- [ ] Drag-and-drop task ordering
- [ ] Bulk task operations
- [ ] Task templates
- [ ] Due date reminders

---

## Dependencies

- Existing task management system
- Existing capture system
- React Router for `/tasks` route


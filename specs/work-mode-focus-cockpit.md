# Work Mode (Focus Cockpit) - Spec

**Status:** 🚧 Ready for Implementation (after Task Management Enhancement)
**Phase:** P0b (depends on Task Management)
**Priority:** High
**Last Updated:** 2026-01-23

## Summary

Work Mode is a compact, always-on-top toolbar for focused work. It's tied to a specific task and provides ultra-low-friction capture via global hotkeys. All captures created in Work Mode automatically link to the active task.

---

## Prerequisites

**Requires:** Task Management Enhancement (spec: `task-management-enhancement.md`)

Work Mode cannot be entered without selecting a task from the enhanced task views.

---

## Goal

Make Open Loops usable *during* focused work.

Work Mode answers:
- **"What am I doing right now?"** → Active task display
- **"How do I capture this without derailing focus?"** → Global hotkeys
- **"Where does this belong?"** → Auto-routes to task + project

Work Mode should feel like a "timer + quick capture toolbar" that stays out of the way.

---

## Core UX

### Entry Point

**From Tasks View:**
1. User selects a task from global Tasks view or Project Tasks tab
2. Clicks "▶ Start Work Mode" button (or context menu)
3. Work Mode window opens
4. Task becomes "active task"

**Cannot enter Work Mode without an active task.**

### Window Behavior

- **Separate BrowserWindow** (not a route in main window)
- **Always-on-top** by default (toggle in settings)
- **Compact size**: ~350px wide × ~200px tall
- **Frameless** (custom title bar with drag handle)
- **Remembers position** (persisted in settings)
- **Stays visible** across workspace switches
- **Minimal chrome** - just content, no standard window controls

### Work Mode Layout

```
┌──────────────────────────────────────┐
│ ⋮⋮ 📋 Implement work mode        [✕]│  ← Drag handle + close
├──────────────────────────────────────┤
│ 📁 Open Loops                        │  ← Project name
│ P5 • 60 min                           │  ← Priority + estimate
├──────────────────────────────────────┤
│          ⏱ 24:37                     │  ← Timer (large)
│     [▶ Start]  [↻ Reset]  [+5]      │  ← Timer controls
├──────────────────────────────────────┤
│  [T] Text  [📸] Screen  [🎤] Voice   │  ← Quick capture
├──────────────────────────────────────┤
│  [✓ Done]  [🚫 Blocker]  [⚙ Stop]   │  ← Actions
└──────────────────────────────────────┘
```

### Actions

**Done Button:**
- Marks task as `status = 'done'`
- Closes Work Mode window
- Clears active task

**Log Blocker Button:**
- Opens tiny modal: description + optional link
- Creates text capture: `🚫 Blocker: {description}`
- Capture linked to active task
- Modal closes, stays in Work Mode

**Stop Button:**
- Closes Work Mode window
- Clears active task
- Task stays open

---

## Global Hotkeys

All hotkeys work system-wide (even when app not focused).

### Core Hotkeys

- **Ctrl+Shift+W** (Cmd+Shift+W): Toggle Work Mode
  - If closed: Opens task selector → Work Mode
  - If open: Closes Work Mode
- **Ctrl+Shift+T**: Quick Text Capture
  - Opens floating input
  - Saves capture linked to active task
- **Ctrl+Shift+S**: Quick Screenshot (existing)
  - Routes to active task if Work Mode active
  - Otherwise, existing behavior
- **Ctrl+Shift+R**: Quick Voice Capture
  - Starts/stops recording
  - Saves capture linked to active task

### Hotkey Behavior When Work Mode Closed

If user presses capture hotkey but Work Mode is not active:
- Capture created as project-level (existing behavior)
- OR show toast: "Start Work Mode to link captures to tasks"

**Recommendation:** Keep existing behavior (don't break non-Work-Mode usage)

---

## Timer Functionality

### Timer Behavior

- **Default duration:** Configurable in settings (default: 25 min)
- **Countdown:** Shows MM:SS
- **Controls:**
  - **Start/Pause:** Toggle timer
  - **Reset:** Back to default duration
  - **+5:** Add 5 minutes
- **Completion:** Audio chime + desktop notification (optional)

### Timer State (Ephemeral)

- Timer state lives in component (not persisted)
- If app closes, timer resets
- **Future:** Track focus sessions in DB

---

## Capture Routing

### Routing Logic

**Work Mode active:**
```typescript
const activeTask = await getActiveTask()

if (activeTask) {
  // Create capture with linkedTaskId
  await createCapture({
    linkedTaskId: activeTask.id,  // Links to task
    projectId: null,               // No direct project link
    type: captureType,
    title: captureTitle,
    // ... other fields
  })
}
```

**Captures inherit project via task:**
- Query: `SELECT project_id FROM tasks WHERE id = linkedTaskId`
- Display: Capture appears in task's project view

**Work Mode not active:**
- Existing behavior (project-level capture)

---

## Data Model

### Settings

**New settings entries:**
- `active_task_id` (nullable) - Currently active task
- `work_mode_window_state` (JSON: {x, y, width, height})
- `work_mode_always_on_top` (boolean, default: true)
- `focus_session_length` (integer, default: 25)

### No Task Status Changes

Tasks remain `'open' | 'done'`.

Active task is ephemeral state (settings only, not a task field).

---

## UI Components

### WorkModeWindow

**New separate BrowserWindow:**
- File: `src/main/windows/work-mode-window.ts`
- Creates frameless, always-on-top window
- Loads `/work-mode` route
- Manages window lifecycle

**Component:**
- File: `src/renderer/views/WorkModeView.tsx`
- Loads active task
- Renders timer
- Handles hotkey captures

### Task Selector Modal

**Triggered by:** Ctrl+Shift+W when Work Mode closed

**UI:**
```
┌────────────────────────────┐
│ Start Work Mode            │
├────────────────────────────┤
│ [Search tasks...]          │
│                            │
│ 📥 Inbox                   │
│   □ [P4] Review ticket     │
│   □ [P3] Teams ping        │
│                            │
│ 📁 Open Loops              │
│   □ [P5] Implement WM      │
│                            │
│         [Cancel]           │
└────────────────────────────┘
```

- Type to filter tasks
- Arrow keys to navigate
- Enter to start Work Mode with selected task

---

## Implementation Phases

### Phase 1: Active Task Service

1. **Create ActiveTaskService**
   - File: `src/main/work-mode/active-task-service.ts`
   - Methods: `get()`, `set()`, `clear()`
   - Persists to settings

2. **Add IPC Handlers**
   - `workMode:getActiveTask`
   - `workMode:setActiveTask`
   - `workMode:clearActiveTask`

3. **Preload API**
   - Expose `window.electron.workMode.*`

### Phase 2: Work Mode Window

1. **Create WorkModeWindow Manager**
   - File: `src/main/windows/work-mode-window.ts`
   - Manages separate BrowserWindow
   - Always-on-top, frameless, compact
   - Position persistence

2. **Create WorkModeView**
   - File: `src/renderer/views/WorkModeView.tsx`
   - Layout: Task card + timer + actions
   - Load active task on mount

3. **Timer Component**
   - File: `src/renderer/components/Timer.tsx`
   - Countdown with start/pause/reset
   - +5 min button

### Phase 3: Enhanced Hotkeys

1. **Register Work Mode Hotkey**
   - `Ctrl+Shift+W`: Toggle Work Mode
   - Opens task selector if no active task
   - Closes window if already open

2. **Update Capture Hotkeys**
   - Check for active task before creating capture
   - Set `linkedTaskId` if active task exists

3. **Quick Capture Modal**
   - `Ctrl+Shift+T`: Floating text input
   - Submit → create capture with task link

### Phase 4: Task Selector

1. **Create TaskSelectorModal**
   - File: `src/renderer/components/TaskSelectorModal.tsx`
   - Search/filter tasks
   - Keyboard navigation
   - On select: Set active task, open Work Mode

2. **Add to App.tsx**
   - Listen for `trigger-work-mode-toggle`
   - Show selector if no active task

### Phase 5: Log Blocker

1. **Create LogBlockerModal**
   - File: `src/renderer/components/LogBlockerModal.tsx`
   - Description input (required)
   - Link input (optional)
   - Creates text capture with blocker metadata

2. **Add Button Handler**
   - In WorkModeView, "Log Blocker" button
   - Opens modal, stays in Work Mode

---

## Window Management

### Creating Work Mode Window

```typescript
// src/main/windows/work-mode-window.ts

export class WorkModeWindow {
  private window: BrowserWindow | null = null

  create() {
    const state = getWindowState() // From settings

    this.window = new BrowserWindow({
      width: 350,
      height: 200,
      x: state.x,
      y: state.y,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    })

    if (isDev) {
      this.window.loadURL('http://localhost:5173/#/work-mode')
    } else {
      this.window.loadFile('dist/index.html', { hash: '/work-mode' })
    }

    // Save position on move
    this.window.on('move', () => this.savePosition())
  }

  close() {
    this.window?.close()
    this.window = null
  }

  toggle() {
    if (this.window) {
      this.close()
    } else {
      this.create()
    }
  }
}
```

---

## Acceptance Criteria

- [ ] Cannot enter Work Mode without selecting a task
- [ ] Work Mode window is always-on-top and compact
- [ ] Window position persists across sessions
- [ ] Timer counts down correctly
- [ ] Hotkeys work from anywhere in OS
- [ ] Ctrl+Shift+T creates text capture linked to active task
- [ ] Ctrl+Shift+S routes screenshot to active task
- [ ] Ctrl+Shift+R records audio linked to active task
- [ ] "Done" button marks task complete and closes Work Mode
- [ ] "Log Blocker" creates linked capture
- [ ] "Stop" closes Work Mode without marking task done
- [ ] Captures linked to task appear in project view
- [ ] Hotkey to capture completes in <2 seconds

---

## Edge Cases

1. **Active task deleted while Work Mode open**
   - Close Work Mode, show notification

2. **Active task's project deleted**
   - Task moved to inbox, Work Mode stays open

3. **User presses Ctrl+Shift+W but no tasks exist**
   - Show message: "Create a task first"

4. **Multiple rapid hotkey presses**
   - Queue captures, don't lose any

5. **App quit while Work Mode open**
   - Clear active task on quit
   - Reopen Work Mode on next launch? (optional)

---

## Performance Requirements

- **Hotkey → persisted capture:** <2 seconds
- **Work Mode window opens:** <1 second
- **Timer updates:** Every 1 second, no UI lag
- **Window always-on-top:** Never loses focus unexpectedly

---

## Future Enhancements

- [ ] Focus session tracking in database
- [ ] Plan vs. actual time comparison
- [ ] Pomodoro mode (auto-break reminders)
- [ ] Multiple timers for different tasks
- [ ] Minimize to system tray
- [ ] Custom hotkey configuration
- [ ] Themes/color schemes for Work Mode window

---

## Dependencies

- Task Management Enhancement (must be implemented first)
- Existing global hotkey system
- Existing capture pipeline
- Settings persistence system


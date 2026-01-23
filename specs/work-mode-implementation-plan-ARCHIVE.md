# Work Mode Implementation Plan

**Status:** 🚧 Planning
**Created:** 2026-01-23

## Overview

This plan breaks down the Work Mode feature into 8 implementation phases, leveraging existing patterns and infrastructure.

---

## Phase 1: Database Schema & Settings Foundation

**Goal:** Prepare data layer for Work Mode state and task linking.

### Tasks

1. **Update Captures Table**
   - Add `linkedTaskId` column (nullable, foreign key to tasks)
   - Create migration script
   - Update repository methods

2. **Add Work Mode Settings**
   - `active_task_id` (nullable)
   - `work_mode_enabled` (boolean, default: false)
   - `work_mode_window_state` (JSON: {x, y, width, height})
   - `work_mode_always_on_top` (boolean, default: false)
   - `focus_session_length` (integer, default: 25)
   - `auto_link_to_active_task` (boolean, default: true)
   - `last_active_project_id` (nullable)

3. **Update TypeScript Types**
   - Extend `Capture` interface with `linkedTaskId`
   - Create `WorkModeSettings` interface
   - Create `FocusSession` interface (optional for P0)

### Files to Modify

- `src/main/db/schema.ts` (if using Drizzle)
- `src/main/db/migrations/` (add migration)
- `src/main/db/repository.ts` (update methods)
- `src/types/index.ts` (add types)

### Acceptance Criteria

- [ ] Database migration runs successfully
- [ ] `captures.linkedTaskId` column exists
- [ ] Work mode settings can be persisted and retrieved
- [ ] TypeScript types updated with no compilation errors

---

## Phase 2: Active Task State Management

**Goal:** Track and persist the currently active task.

### Tasks

1. **Create Active Task Service**
   - `src/main/work-mode/active-task-service.ts`
   - Methods:
     - `getActiveTask()` → Task | null
     - `setActiveTask(taskId: string)` → void
     - `clearActiveTask()` → void
     - `getActiveTaskProject()` → Project | null

2. **Add IPC Handlers**
   - `workMode:getActiveTask`
   - `workMode:setActiveTask`
   - `workMode:clearActiveTask`
   - Wire up to main.ts

3. **Expose in Preload**
   - Add `workMode` namespace to preload API
   - Expose active task methods

### Files to Create/Modify

- `src/main/work-mode/active-task-service.ts` (new)
- `src/main/main.ts` (add IPC handlers)
- `src/main/preload.ts` (add workMode API)
- `src/types/index.ts` (add window.electron.workMode types)

### Acceptance Criteria

- [ ] Active task can be set/retrieved via IPC
- [ ] Active task persists across app restarts
- [ ] Clearing active task works correctly
- [ ] Project can be derived from active task

---

## Phase 3: Enhanced Global Hotkeys

**Goal:** Add new global hotkeys for Work Mode interactions.

### Tasks

1. **Register New Hotkeys**
   - `Ctrl+Shift+W` (Cmd+Shift+W on Mac): Toggle Work Mode
   - `Ctrl+Shift+T`: Quick Text Capture
   - `Ctrl+Shift+R`: Quick Voice Capture
   - `Ctrl+Shift+K`: Task Switcher

2. **Add IPC Events**
   - `trigger-work-mode-toggle`
   - `trigger-quick-text-capture`
   - `trigger-quick-voice-capture`
   - `trigger-task-switcher`

3. **Update Main Process**
   - Register hotkeys in `app.whenReady()`
   - Send events to renderer when triggered
   - Handle app focus/restore

4. **Update Preload**
   - Add event listeners for new triggers
   - Add cleanup methods

### Files to Modify

- `src/main/main.ts` (register hotkeys)
- `src/main/preload.ts` (add event listeners)
- `src/types/index.ts` (add event types)

### Acceptance Criteria

- [ ] All hotkeys trigger from anywhere in OS
- [ ] App comes to foreground when hotkey pressed
- [ ] IPC events fire correctly
- [ ] No hotkey conflicts with existing shortcuts

---

## Phase 4: Work Mode View UI

**Goal:** Create the compact Work Mode interface.

### Tasks

1. **Create WorkModeView Component**
   - `src/renderer/views/WorkModeView.tsx`
   - Layout:
     - Active task card (or "No active task" state)
     - Timer component
     - Quick actions (Mark Done, Log Blocker, Switch Task)
     - Capture bar (Text, Screenshot, Record buttons)

2. **Create Timer Component**
   - `src/renderer/components/Timer.tsx`
   - Features:
     - Countdown display (MM:SS)
     - Start/Pause button
     - Reset button
     - +5 min button
     - Audio notification on completion (optional)

3. **Add Routing**
   - Add `/work-mode` route to App.tsx
   - Add "Work Mode" to sidebar navigation

4. **Create Styles**
   - `src/renderer/views/WorkModeView.css`
   - Compact layout (400px width max)
   - Card-based design
   - Clear visual hierarchy

### Files to Create/Modify

- `src/renderer/views/WorkModeView.tsx` (new)
- `src/renderer/views/WorkModeView.css` (new)
- `src/renderer/components/Timer.tsx` (new)
- `src/renderer/components/Timer.css` (new)
- `src/renderer/App.tsx` (add route)
- `src/renderer/components/Sidebar.tsx` (add nav item)

### Acceptance Criteria

- [ ] Work Mode view accessible from sidebar
- [ ] Active task displays correctly
- [ ] Timer counts down properly
- [ ] All buttons render and are clickable
- [ ] "No active task" state displays when appropriate

---

## Phase 5: Quick Capture Modals

**Goal:** Lightweight capture interfaces triggered by hotkeys.

### Tasks

1. **Quick Text Capture Modal**
   - `src/renderer/components/QuickTextCapture.tsx`
   - Floating input (always-on-top if possible)
   - Single line input + optional "expand" for notes
   - Enter to submit
   - Escape to cancel
   - Routes to active task/project

2. **Quick Voice Capture Trigger**
   - Reuse existing recording logic
   - Start/stop via hotkey
   - Show recording indicator
   - Auto-route to active task/project

3. **Wire Up Hotkey Listeners**
   - Listen for `trigger-quick-text-capture`
   - Listen for `trigger-quick-voice-capture`
   - Open appropriate modals

4. **Implement Capture Routing**
   - Check active task before creating capture
   - Add `linkedTaskId` if task exists
   - Route to task's project (or fallback logic)

### Files to Create/Modify

- `src/renderer/components/QuickTextCapture.tsx` (new)
- `src/renderer/components/QuickTextCapture.css` (new)
- `src/renderer/App.tsx` (add global listeners)
- `src/renderer/views/ProjectView.tsx` (update recording to support routing)

### Acceptance Criteria

- [ ] Ctrl+Shift+T opens quick text capture modal
- [ ] Text capture creates and routes correctly
- [ ] Ctrl+Shift+R starts/stops voice recording
- [ ] Voice capture routes to active task/project
- [ ] Captures link to active task if set

---

## Phase 6: Task Switcher

**Goal:** Type-to-filter task picker for setting active task.

### Tasks

1. **Create Task Switcher Modal**
   - `src/renderer/components/TaskSwitcher.tsx`
   - Search input at top
   - Filtered task list
   - Keyboard navigation (up/down arrows)
   - Enter to select
   - Shows:
     - Task title
     - Project name
     - Priority badge
     - Estimate

2. **Add Filtering Logic**
   - Filter by task title (fuzzy match)
   - Sort by priority (descending)
   - Show open tasks only

3. **Wire Up Hotkey**
   - Listen for `trigger-task-switcher`
   - Open modal
   - Focus search input

4. **Set Active Task**
   - On task selection, call `workMode.setActiveTask(taskId)`
   - Update Work Mode view
   - Close modal

### Files to Create/Modify

- `src/renderer/components/TaskSwitcher.tsx` (new)
- `src/renderer/components/TaskSwitcher.css` (new)
- `src/renderer/App.tsx` (add global listener)

### Acceptance Criteria

- [ ] Ctrl+Shift+K opens task switcher
- [ ] Typing filters tasks in real-time
- [ ] Arrow keys navigate tasks
- [ ] Enter sets active task
- [ ] Work Mode updates with new active task

---

## Phase 7: Log Blocker Feature

**Goal:** Quick blocker logging with task linking.

### Tasks

1. **Create Log Blocker Modal**
   - `src/renderer/components/LogBlocker.tsx`
   - Input: One-line blocker description (required)
   - Input: Optional URL/link
   - Submit button
   - Triggered from Work Mode "Log Blocker" button

2. **Create Blocker Capture**
   - Type: `text`
   - Title: "🚫 Blocker: {description}"
   - Body: Link (if provided)
   - Metadata: `{ source: 'blocker' }`
   - Linked to active task

3. **Optional: Task Status Update**
   - If task status field supports "Waiting", update task
   - Otherwise, just create capture

### Files to Create/Modify

- `src/renderer/components/LogBlocker.tsx` (new)
- `src/renderer/components/LogBlocker.css` (new)
- `src/renderer/views/WorkModeView.tsx` (add button handler)

### Acceptance Criteria

- [ ] "Log Blocker" button opens modal
- [ ] Blocker description required
- [ ] Link optional
- [ ] Capture created with blocker metadata
- [ ] Capture linked to active task
- [ ] Capture appears in project feed immediately

---

## Phase 8: Display Linked Captures

**Goal:** Show which captures are linked to tasks.

### Tasks

1. **Update Capture Display**
   - In ProjectView accordion, show task badge if linked
   - Add filter: "Show only task captures"

2. **Task Detail View (Optional)**
   - In Planner view, show linked captures for selected task
   - Or add expandable section in task card

3. **Update Capture Queries**
   - `captures:getByProject` includes `linkedTaskId`
   - Optional: `captures:getByTask(taskId)` query

4. **Visual Indicators**
   - Badge or icon on captures linked to tasks
   - Click to view task details

### Files to Modify

- `src/renderer/views/ProjectView.tsx` (display linked tasks)
- `src/renderer/views/ProjectView.css` (task badge styles)
- `src/main/db/repository.ts` (add getByTask query if needed)

### Acceptance Criteria

- [ ] Captures show task link if present
- [ ] Can filter captures by task
- [ ] Task badge clickable (optional)
- [ ] Linked captures visible in project feed

---

## Optional Enhancements (Post-P0)

### Focus Sessions Tracking
- Create `focus_sessions` table
- Start session when timer starts
- End session when timer stops or task switches
- View session history

### Work Mode Window Options
- Always-on-top toggle
- Auto-hide when unfocused
- Dock to corner
- Separate BrowserWindow (vs route)

### Advanced Capture Routing
- Inbox project for captures without active task
- Auto-flag open loop when no active task

### Notification System
- Timer completion notification
- Transcription complete notification
- Non-blocking error toasts

---

## Testing Strategy

### Manual Testing Checklist

**Active Task Management:**
- [ ] Set active task
- [ ] Clear active task
- [ ] Active task persists across app restart

**Global Hotkeys:**
- [ ] Ctrl+Shift+W toggles Work Mode
- [ ] Ctrl+Shift+T opens quick text capture
- [ ] Ctrl+Shift+R starts/stops voice recording
- [ ] Ctrl+Shift+K opens task switcher
- [ ] Ctrl+Shift+S still works for screenshots

**Capture Routing:**
- [ ] Text capture links to active task
- [ ] Screenshot links to active task
- [ ] Voice capture links to active task
- [ ] Captures route to correct project
- [ ] Fallback routing works (no active task)

**Timer:**
- [ ] Timer counts down correctly
- [ ] Start/Pause works
- [ ] Reset works
- [ ] +5 min adds time

**Task Switcher:**
- [ ] Opens with Ctrl+Shift+K
- [ ] Filters tasks correctly
- [ ] Keyboard navigation works
- [ ] Sets active task on selection

**Log Blocker:**
- [ ] Opens from Work Mode
- [ ] Creates capture with blocker metadata
- [ ] Links to active task
- [ ] Appears in project feed

**Performance:**
- [ ] Hotkey → capture in <2 seconds
- [ ] UI remains responsive during operations
- [ ] No blocking on transcription

### Edge Cases

- [ ] No active task set
- [ ] Active task's project deleted
- [ ] Task deleted while active
- [ ] Hotkey conflicts
- [ ] Multiple rapid hotkey presses
- [ ] Recording already in progress

---

## Implementation Order

Recommended sequence for maximum incremental value:

1. **Phase 1** (Foundation) - Required for all other phases
2. **Phase 2** (Active Task) - Core state management
3. **Phase 3** (Hotkeys) - Enable quick interactions
4. **Phase 4** (UI) - Visual interface
5. **Phase 5** (Quick Captures) - High-value quick wins
6. **Phase 6** (Task Switcher) - Complete the workflow
7. **Phase 7** (Log Blocker) - Nice-to-have
8. **Phase 8** (Display) - Polish

**MVP Definition (Phases 1-5):**
- Active task management
- Global hotkeys for captures
- Work Mode view with timer
- Quick text/voice capture with routing

This delivers core value while remaining achievable.

---

## Estimated Effort

**Phase 1:** 2-3 hours (database + types)
**Phase 2:** 2-3 hours (service + IPC)
**Phase 3:** 1-2 hours (hotkey registration)
**Phase 4:** 3-4 hours (UI components)
**Phase 5:** 3-4 hours (capture modals + routing)
**Phase 6:** 2-3 hours (task switcher)
**Phase 7:** 1-2 hours (log blocker)
**Phase 8:** 1-2 hours (display updates)

**Total MVP (Phases 1-5):** ~11-16 hours
**Full Implementation:** ~15-23 hours

---

## Dependencies & Risks

### Technical Dependencies
- Electron globalShortcut API (already in use)
- Existing capture pipeline (already implemented)
- Existing job queue (already implemented)
- Settings persistence (already implemented)

### Risks
1. **Hotkey conflicts**: May conflict with OS or other apps
   - Mitigation: Make hotkeys configurable
2. **Always-on-top behavior**: Platform-specific issues
   - Mitigation: Make optional, test on Windows/Mac/Linux
3. **Performance**: Hotkeys should never block UI
   - Mitigation: Use IPC + background jobs as already established

### Unknowns
- Separate BrowserWindow vs route for Work Mode
- Best UX for "No active task" state
- Task status field (Waiting vs custom)

---

## Next Steps

1. Review plan with user
2. Confirm scope for MVP (Phases 1-5 vs full)
3. Begin Phase 1 implementation
4. Iterate based on feedback


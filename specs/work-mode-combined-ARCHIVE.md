# Work Mode (Focus + Hotkeys + Ultra-Low-Friction Capture) - Spec

**Status:** 🚧 Ready for Implementation
**Phase:** P0
**Priority:** Critical
**Last Updated:** 2026-01-23

## Summary

Work Mode is the "execution cockpit" for Open Loops. It's a compact, low-friction UI + global hotkeys that let the user stay in flow while still capturing context (text/screenshot/voice), logging progress, and avoiding priority inversions. It is explicitly optimized for the reality of constant interruptions, side-loaded asks, and context switching.

---

## Goal

Make Open Loops usable *during* work.

Work Mode answers:
- **"What am I doing right now?"**
- **"How do I capture this without derailing focus?"**
- **"Where does this belong (project/task)?"**

Work Mode should feel closer to a "command palette + timer" than a full app screen.

---

## Non-goals (P0)

- No automatic agent execution
- No complex workflow engine
- No "perfect" time tracking analytics
- No syncing/exporting of focus sessions (local only)

---

## Core UX

### Entry Points

- Sidebar button: **Work Mode**
- Global hotkey: **Toggle Work Mode** (Ctrl+Shift+W)
- Optional: Tray icon menu entry (if app already uses tray)

### Window Behavior

- Compact panel/window sized for "glance + action"
- Optional **Always-on-top**
- Optional "Dock to corner" behavior (remembers last position)
- Optional "Auto-hide when unfocused" (nice-to-have; not required P0)

### Work Mode Layout (P0)

1. **Active Task Card**
   - Task title
   - Project name
   - Estimate minutes
   - Priority (1–5)
   - Status (Backlog/Next/Doing/Done)

2. **Timer**
   - Countdown timer (default focus session length configurable)
   - Controls: **Start/Pause**, **Reset**, **+5 min**

3. **Quick Actions**
   - **Mark Done**
   - **Log Blocker**
   - **Switch Task** (opens task picker)

4. **Capture Bar**
   - **Text** (Ctrl+Shift+T)
   - **Screenshot** (Ctrl+Shift+S - already implemented)
   - **Record** (Ctrl+Shift+R)

5. **Context Refresh**
   - Opens:
     - Project summary (cached, with "regenerate" elsewhere)
     - Active task detail
     - Recent captures linked to the active task

### "Log Blocker" Behavior (P0)

- Opens a tiny modal or inline input:
  - One-line description (required)
  - Optional link field
- Creates a **capture** linked to the active task (and project)
- Optionally sets task status to "Waiting" (only if such a status exists; otherwise just logs blocker)

---

## Hotkeys (Required)

All hotkeys must be global OS-level (work even if Open Loops is not focused), and must execute in **<2 seconds** from keypress to persisted artifact.

### Core Hotkeys

- **Ctrl+Shift+W**: Toggle Work Mode
- **Ctrl+Shift+T**: Quick Text Capture
  - Opens a minimal floating input or quick modal
  - Enter → saves capture
- **Ctrl+Shift+S**: Quick Screenshot Capture (already implemented)
  - Takes screenshot (region or full screen depending on platform)
  - Saves capture immediately
- **Ctrl+Shift+R**: Quick Voice Capture
  - Starts recording immediately
  - Second press stops
  - Save → transcribe → attach transcript to capture
- **Ctrl+Shift+K**: Task Switcher
  - Type-to-filter picker (tasks)
  - Selecting sets `active_task_id` and updates Work Mode display

### Hotkey Behavior Guarantees

- Hotkeys must never block the UI thread
- If transcription is slow, capture is still created immediately with status "transcribing…"
- If capture fails, show a non-modal error toast and keep the user in flow

---

## Routing Rules

### Primary Routing

If an **active task** exists:
- Capture **links to that task**
- Capture **routes to that task's project**

If **no active task**:
- Capture routes to **last active project**
- Capture optionally auto-flags as an **open loop** (configurable default)

### Edge Cases

- If last active project is missing/deleted:
  - Route to a default "Inbox" project (or global inbox capture bucket)
- If task's project is missing:
  - Route to Inbox + link task if still exists
- If user has multiple windows/workspaces open:
  - Work Mode uses app-wide single active task (P0)

---

## Capture Types & Behavior (P0)

### Text Capture

- Minimal UI:
  - Single input + optional expanded notes
- Stored as a `capture(type='text')`
- Linked to task if active

### Screenshot Capture

- Use existing implementation (Windows Snipping Tool + desktopCapturer fallback)
- Result stored as file in app data directory
- Stored as `capture(type='image', file_path=...)`
- Optional post-capture title prompt (non-blocking)

### Voice Capture

- Record via MediaRecorder (existing implementation)
- Save audio file locally
- Create `capture(type='audio', file_path=...)` immediately
- Enqueue transcription job:
  - `transcriptions(status='pending')`
- When done:
  - Attach transcript text to transcription record
- Failure:
  - Set status `error`
  - Keep audio capture intact

---

## Data Model / Persistence

### Required State

**Settings table entries:**
- `active_task_id` (nullable) - Currently active task
- `work_mode_enabled` (boolean) - Work Mode window open/closed
- `work_mode_window_state` (JSON: {x, y, width, height}) - Window position
- `work_mode_always_on_top` (boolean) - Always-on-top preference
- `focus_session_length` (integer) - Default timer duration in minutes
- `auto_link_to_active_task` (boolean) - Auto-link captures to active task
- `last_active_project_id` (nullable) - Fallback routing

### Capture ↔ Task Linkage

**Option A (Recommended for P0):**
- Add `linkedTaskId` to captures table (nullable)
- Simplest implementation
- Already partially exists in schema

**Database Schema Updates:**
```typescript
interface Capture {
  id: string
  projectId: string
  type: 'text' | 'image' | 'audio'
  title: string
  bodyText?: string
  filePath?: string
  metadata?: string
  linkedTaskId?: string  // NEW: Link to active task
  createdAt: Date
  isOpenLoop?: boolean
}
```

### Focus Sessions (Optional P0-lite)

```typescript
interface FocusSession {
  id: string
  taskId?: string
  projectId?: string
  startDt: Date
  endDt?: Date           // Null if still running
  plannedMinutes: number
  actualMinutes?: number // Calculated from end_dt
  notes?: string
  createdAt: Date
}
```

### Derived Data Requirements

- If a capture is deleted, ensure linked task references remain consistent
- If a task is deleted, linked captures remain in project feed (with task link removed)

---

## Settings

### Work Mode Settings (P0)

- **Focus session length**: 25/45/60 minutes (default: 25)
- **Auto-link captures to active task**: On by default
- **When no active task**:
  - Route to last project vs Inbox
  - Auto-flag open loop (on/off)
- **Always on top**: Off by default
- **Screenshot mode**: Region vs full screen (use existing implementation)

---

## Performance & Reliability Requirements

- **Hotkey → persisted capture**: <2 seconds (excluding transcription)
- App must remain responsive during:
  - Audio recording start/stop
  - Screenshot capture
  - Transcription job enqueue
- Transcription and summary generation must occur off the UI thread
- Captures must be written durably before UI shows success toast

---

## Security / Safety Requirements (Local-First)

- Captures stored under app data directory
- If transcription is local (Ollama/whisper.cpp), ensure endpoints are local-only
- Never log capture contents in plaintext debug logs

---

## Acceptance Criteria

1. **Global capture speed**
   - From anywhere in the OS:
     - Hotkey → capture created and visible in correct project/task in <2 seconds

2. **Low-friction execution**
   - Work Mode usable without mouse-heavy flows:
     - Toggle window, switch task, capture text/screenshot/voice via hotkeys end-to-end

3. **Correct routing**
   - With active task set:
     - Captures always link to the correct task and project
   - Without active task:
     - Captures route to last project (or Inbox) consistently

4. **Immediate visibility**
   - Captures appear instantly in:
     - Project feed
     - Task detail view (if linked)

5. **Graceful async**
   - Voice capture creates an artifact immediately
   - Transcription completes later without blocking
   - Transcription failure is visible but does not lose audio capture

---

## Implementation Notes

### Existing Patterns to Leverage

✅ **Global hotkeys**: Already implemented for image upload and screenshot
✅ **Screenshot capture**: Fully implemented with Windows Snipping Tool + fallback
✅ **Audio recording**: MediaRecorder API with transcription job queue
✅ **Text captures**: Modal-based capture creation
✅ **Job queue**: Background processing for transcription and AI tasks
✅ **Settings persistence**: Database-backed settings system

### New Components Needed

🆕 **Work Mode View** (`WorkModeView.tsx`)
- Compact window/panel UI
- Active task display
- Timer component
- Quick action buttons
- Capture shortcuts

🆕 **Timer System**
- Countdown timer with start/pause/reset
- Focus session tracking (optional)

🆕 **Active Task State**
- Persist active task ID in settings
- Link captures to active task

🆕 **Quick Capture Modals**
- Lightweight floating inputs
- Hotkey-triggered
- Auto-focus and quick submit

🆕 **Task Switcher**
- Type-to-filter task picker
- Hotkey-triggered
- Set active task

🆕 **Log Blocker Feature**
- Inline blocker input
- Creates linked capture

### Technical Approach

**Global Hotkeys:**
- Use existing `globalShortcut` API pattern
- Register in `main.ts` on app ready
- Send IPC events to renderer

**Work Mode Window:**
- Either:
  1. New route in existing window (`/work-mode`)
  2. Separate BrowserWindow (if always-on-top needed)
- Compact size: ~400x600px
- Remember position in settings

**Capture Routing:**
- Before creating capture, check `active_task_id` setting
- If set, add `linkedTaskId` to capture input
- Route to task's project

**Timer:**
- React component with `setInterval`
- Persist timer state in component state (ephemeral)
- Focus sessions optional for P0

---

## Dependencies

- Existing global hotkey system
- Existing capture creation pipeline
- Existing job queue for transcription
- Settings persistence system
- Task management system

# Day Planner - Spec

**Status:** ✅ Completed
**Phase:** Core
**Completed:** 2026-01-23

## Overview

Smart day planning with calendar integration and automatic time blocking based on tasks and events.

## Goals

1. **Calendar Import**: Load calendar events from .ics files
2. **Auto-Planning**: Generate time blocks based on events and tasks
3. **Manual Editing**: Adjust generated plans
4. **Persistence**: Save and retrieve plans for any date

## User Flow

### Importing Calendar

**Option A: File Import**
1. User clicks "Import .ics File" button
2. File picker opens
3. User selects calendar file (.ics)
4. Events parsed and loaded into database
5. Events appear for dates they fall on

**Option B: Text Paste**
1. User clicks "Paste ICS" button
2. Text area modal opens
3. User pastes ICS content (e.g., from Google Calendar export)
4. Clicks "Import" button
5. Events parsed and loaded
6. Modal closes

### Generating a Plan

1. User selects date using date picker (defaults to today)
2. Views calendar events for that date (read-only, blue blocks)
3. Views open tasks in sidebar
4. Clicks "Generate Plan" button
5. Algorithm allocates tasks into free time slots:
   - Respects working hours (9 AM - 5 PM default)
   - Avoids calendar events
   - Uses greedy algorithm (highest priority first)
   - Creates minimum block size (30 min default)
6. Time blocks appear in timeline (yellow blocks)

### Editing Plan

1. User clicks on generated task block
2. Edit modal opens with:
   - Start time
   - End time
   - Label (task name)
   - Notes
3. User modifies times/label
4. Clicks "Save"
5. Block updates in timeline

### Saving Plan

1. User reviews generated/edited plan
2. Clicks "Save Plan" button
3. Plan persisted to database for selected date
4. Success message appears
5. Reloading planner shows saved plan

## Technical Implementation

### Calendar Import

**ICS File Import:**
```typescript
ipcMain.handle('calendar:importICS', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Calendar Files', extensions: ['ics'] }]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const icsContent = fs.readFileSync(result.filePaths[0], 'utf-8')
  return icsContent
})
```

**ICS Parsing:**
```typescript
import ICAL from 'ical.js'

export function parseICSFile(icsContent: string): CalendarEvent[] {
  const jcalData = ICAL.parse(icsContent)
  const component = new ICAL.Component(jcalData)
  const vevents = component.getAllSubcomponents('vevent')

  return vevents.map(vevent => {
    const event = new ICAL.Event(vevent)

    return {
      title: event.summary || 'Untitled Event',
      startDt: event.startDate.toJSDate(),
      endDt: event.endDate.toJSDate(),
      uid: event.uid,
      raw: vevent.toString()
    }
  })
}
```

**Database Storage:**
```typescript
ipcMain.handle('calendar:parseICS', async (_, icsContent: string) => {
  const events = parseICSFile(icsContent)

  // Clear existing events and import new ones
  await repository.clearCalendarEvents()

  for (const event of events) {
    await repository.createCalendarEvent(
      event.title,
      event.startDt,
      event.endDt,
      event.uid,
      JSON.stringify(event.raw)
    )
  }

  return events
})
```

### Day Planning Algorithm

**Greedy Time Allocation:**
```typescript
export class DayPlanner {
  private config: PlannerConfig

  constructor(config: PlannerConfig) {
    this.config = config
  }

  generatePlan(date: Date, events: CalendarEvent[], tasks: Task[]): TimeBlock[] {
    // Set working hours boundary
    const dayStart = new Date(date)
    dayStart.setHours(this.config.workingHoursStart, 0, 0, 0)

    const dayEnd = new Date(date)
    dayEnd.setHours(this.config.workingHoursEnd, 0, 0, 0)

    // Create free time slots (avoid calendar events)
    const freeSlots = this.calculateFreeSlots(dayStart, dayEnd, events)

    // Sort tasks by priority (descending)
    const sortedTasks = tasks
      .filter(t => t.status === 'open')
      .sort((a, b) => b.priority - a.priority)

    const blocks: TimeBlock[] = []

    // Greedy allocation
    for (const task of sortedTasks) {
      const durationMs = task.estimateMinutes * 60 * 1000

      // Find first free slot that fits
      for (let i = 0; i < freeSlots.length; i++) {
        const slot = freeSlots[i]
        const slotDuration = slot.endDt.getTime() - slot.startDt.getTime()

        if (slotDuration >= durationMs) {
          // Allocate task to this slot
          const blockEnd = new Date(slot.startDt.getTime() + durationMs)

          blocks.push({
            startDt: new Date(slot.startDt),
            endDt: blockEnd,
            label: task.title,
            linkedTaskId: task.id,
            notes: task.notes
          })

          // Update free slot (shrink it)
          slot.startDt = blockEnd

          // If slot now too small, remove it
          if (slot.endDt.getTime() - slot.startDt.getTime() < this.config.minBlockSizeMinutes * 60 * 1000) {
            freeSlots.splice(i, 1)
          }

          break // Move to next task
        }
      }
    }

    return blocks
  }

  private calculateFreeSlots(dayStart: Date, dayEnd: Date, events: CalendarEvent[]): TimeSlot[] {
    const slots: TimeSlot[] = [{ startDt: dayStart, endDt: dayEnd }]

    // Subtract calendar events from free time
    for (const event of events) {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]

        // Event overlaps with this slot
        if (event.startDt < slot.endDt && event.endDt > slot.startDt) {
          slots.splice(i, 1) // Remove overlapping slot

          // Add remaining fragments
          if (event.startDt > slot.startDt) {
            slots.push({ startDt: slot.startDt, endDt: event.startDt })
          }
          if (event.endDt < slot.endDt) {
            slots.push({ startDt: event.endDt, endDt: slot.endDt })
          }

          i-- // Recheck this index
        }
      }
    }

    return slots.sort((a, b) => a.startDt.getTime() - b.startDt.getTime())
  }
}
```

### Plan Persistence

**Save Plan:**
```typescript
ipcMain.handle('planning:save', async (_, dateStr: string, blocks: TimeBlock[]) => {
  // Delete existing plan for this date
  const existingPlan = await repository.getDayPlan(dateStr)
  if (existingPlan) {
    await repository.deleteDayPlan(existingPlan.id)
  }

  // Create new plan
  const planId = await repository.createDayPlan(dateStr)

  // Create blocks
  for (const block of blocks) {
    await repository.createDayPlanBlock(
      planId,
      new Date(block.startDt),
      new Date(block.endDt),
      block.label,
      block.linkedTaskId,
      block.notes
    )
  }

  return planId
})
```

**Load Plan:**
```typescript
ipcMain.handle('planning:get', async (_, dateStr: string) => {
  const plan = await repository.getDayPlan(dateStr)
  if (!plan) return null

  const blocks = await repository.getDayPlanBlocks(plan.id)
  return { plan, blocks }
})
```

### UI Components

**Timeline View:**
```tsx
<div className="timeline">
  {hours.map(hour => (
    <div key={hour} className="timeline-hour">
      <div className="hour-label">{hour}:00</div>
      <div className="hour-slot">
        {/* Calendar events (read-only, blue) */}
        {eventsInHour.map(event => (
          <div className="time-block event-block" style={positionStyle}>
            {event.title}
          </div>
        ))}

        {/* Task blocks (editable, yellow) */}
        {blocksInHour.map(block => (
          <div
            className="time-block task-block"
            onClick={() => setEditingBlock(block)}
            style={positionStyle}
          >
            {block.label}
          </div>
        ))}
      </div>
    </div>
  ))}
</div>
```

**Date Picker:**
```tsx
<input
  type="date"
  value={selectedDate}
  onChange={(e) => setSelectedDate(e.target.value)}
/>
```

### Configuration

**Settings Page:**
- Working Hours Start: 9 (9:00 AM)
- Working Hours End: 17 (5:00 PM)
- Minimum Block Size: 30 minutes

## Features Implemented

✅ ICS file import via file picker
✅ ICS text paste and parsing
✅ Calendar event storage and retrieval
✅ Events displayed by date
✅ Greedy time allocation algorithm
✅ Priority-based task sorting
✅ Free slot calculation (avoids events)
✅ Minimum block size enforcement
✅ Manual block editing
✅ Plan persistence per date
✅ Date picker navigation
✅ Timeline visualization
✅ Task sidebar with create/delete
✅ Configurable working hours

## Database Schema

```typescript
interface CalendarEvent {
  id: string
  source: string            // 'ics-import'
  externalUid?: string      // Original event UID
  title: string
  startDt: Date
  endDt: Date
  rawJson: string           // Full ICS data
  importedAt: Date
}

interface DayPlan {
  id: string
  date: string              // YYYY-MM-DD
  createdAt: Date
}

interface TimeBlock {
  id?: string               // Optional, assigned on save
  planId?: string           // Foreign key to DayPlan
  startDt: Date
  endDt: Date
  label: string
  linkedTaskId?: string     // Optional task reference
  notes?: string
}
```

## Edge Cases

1. **No calendar events**: Algorithm allocates entire working day
2. **All-day events**: Treated as blocking entire day
3. **Events outside working hours**: Ignored by planner
4. **Tasks too large to fit**: Skipped with warning (future)
5. **Overlapping events**: Events can overlap, tasks cannot
6. **No tasks**: Empty plan generated
7. **Date change during edit**: Confirms unsaved changes

## Integration Points

- **Task Management**: Uses open tasks for planning
- **Settings**: Respects working hours and block size config
- **Calendar**: Events imported from external sources
- **Database**: Plans persist across sessions

## Future Enhancements

- [ ] Drag-and-drop block rescheduling
- [ ] Recurring tasks
- [ ] Break time allocation
- [ ] Travel time between events
- [ ] Multi-day task splitting
- [ ] Calendar sync (OAuth)
- [ ] Export plan to ICS
- [ ] Smart task ordering (dependencies)
- [ ] Buffer time between blocks

---

**Dependencies:**
- ical.js (calendar parsing)
- SQLite for event/plan storage
- Date picker UI component

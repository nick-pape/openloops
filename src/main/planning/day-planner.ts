export interface CalendarEvent {
  id: string
  title: string
  startDt: Date
  endDt: Date
}

export interface Task {
  id: string
  title: string
  estimateMinutes: number
  priority: number
  dueDate?: Date | null
  status?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface TimeBlock {
  startDt: Date
  endDt: Date
  label: string
  linkedTaskId?: string
  notes?: string
}

export interface PlannerConfig {
  workingHoursStart: number // 0-23
  workingHoursEnd: number // 0-23
  minBlockSizeMinutes: number
}

interface FreeWindow {
  startDt: Date
  endDt: Date
  durationMinutes: number
}

export class DayPlanner {
  constructor(
    private config: PlannerConfig = {
      workingHoursStart: 9,
      workingHoursEnd: 17,
      minBlockSizeMinutes: 30
    }
  ) {}

  generatePlan(date: Date, events: CalendarEvent[], tasks: Task[]): TimeBlock[] {
    // Find free windows
    const freeWindows = this.findFreeWindows(date, events)

    // Sort tasks by priority (desc), due date (asc), estimate (desc)
    const sortedTasks = this.sortTasks(tasks)

    // Allocate tasks to windows
    const blocks = this.allocateTasksToWindows(freeWindows, sortedTasks)

    return blocks
  }

  private findFreeWindows(date: Date, events: CalendarEvent[]): FreeWindow[] {
    const windows: FreeWindow[] = []

    // Create working hours boundaries
    const dayStart = new Date(date)
    dayStart.setHours(this.config.workingHoursStart, 0, 0, 0)

    const dayEnd = new Date(date)
    dayEnd.setHours(this.config.workingHoursEnd, 0, 0, 0)

    // Sort events by start time
    const sortedEvents = [...events].sort((a, b) => a.startDt.getTime() - b.startDt.getTime())

    let currentTime = dayStart

    for (const event of sortedEvents) {
      const eventStart = new Date(Math.max(event.startDt.getTime(), dayStart.getTime()))
      const eventEnd = new Date(Math.min(event.endDt.getTime(), dayEnd.getTime()))

      // Add free window before this event
      if (currentTime < eventStart) {
        const durationMinutes = (eventStart.getTime() - currentTime.getTime()) / (1000 * 60)
        if (durationMinutes >= this.config.minBlockSizeMinutes) {
          windows.push({
            startDt: new Date(currentTime),
            endDt: new Date(eventStart),
            durationMinutes
          })
        }
      }

      // Move current time to after this event
      currentTime = new Date(Math.max(currentTime.getTime(), eventEnd.getTime()))
    }

    // Add final window if there's time left
    if (currentTime < dayEnd) {
      const durationMinutes = (dayEnd.getTime() - currentTime.getTime()) / (1000 * 60)
      if (durationMinutes >= this.config.minBlockSizeMinutes) {
        windows.push({
          startDt: new Date(currentTime),
          endDt: new Date(dayEnd),
          durationMinutes
        })
      }
    }

    return windows
  }

  private sortTasks(tasks: Task[]): Task[] {
    return [...tasks].sort((a, b) => {
      // Priority first (higher priority first)
      if (a.priority !== b.priority) {
        return b.priority - a.priority
      }

      // Due date second (earlier due date first)
      if (a.dueDate && b.dueDate) {
        return a.dueDate.getTime() - b.dueDate.getTime()
      }
      if (a.dueDate) return -1
      if (b.dueDate) return 1

      // Estimate third (longer tasks first)
      return b.estimateMinutes - a.estimateMinutes
    })
  }

  private allocateTasksToWindows(windows: FreeWindow[], tasks: Task[]): TimeBlock[] {
    const blocks: TimeBlock[] = []
    const remainingTasks = [...tasks]

    for (const window of windows) {
      let currentTime = new Date(window.startDt)
      const windowEnd = new Date(window.endDt)

      while (remainingTasks.length > 0 && currentTime < windowEnd) {
        const task = remainingTasks[0]
        const availableMinutes = (windowEnd.getTime() - currentTime.getTime()) / (1000 * 60)

        if (availableMinutes < this.config.minBlockSizeMinutes) {
          // Not enough time for minimum block
          break
        }

        if (task.estimateMinutes <= availableMinutes) {
          // Task fits entirely in remaining window
          const blockEnd = new Date(currentTime.getTime() + task.estimateMinutes * 60 * 1000)
          blocks.push({
            startDt: new Date(currentTime),
            endDt: blockEnd,
            label: `Task: ${task.title}`,
            linkedTaskId: task.id
          })

          currentTime = blockEnd
          remainingTasks.shift()
        } else if (availableMinutes >= this.config.minBlockSizeMinutes) {
          // Split task - allocate what we can
          const blockEnd = new Date(currentTime.getTime() + availableMinutes * 60 * 1000)
          blocks.push({
            startDt: new Date(currentTime),
            endDt: blockEnd,
            label: `Task: ${task.title} (Part ${Math.ceil((task.estimateMinutes - availableMinutes) / availableMinutes) + 1})`,
            linkedTaskId: task.id,
            notes: `Partial allocation: ${Math.round(availableMinutes)}/${task.estimateMinutes} minutes`
          })

          // Update task estimate for remaining time
          task.estimateMinutes -= availableMinutes
          currentTime = blockEnd
        } else {
          break
        }
      }

      // Fill remaining window time with buffer
      if (currentTime < windowEnd) {
        const remainingMinutes = (windowEnd.getTime() - currentTime.getTime()) / (1000 * 60)
        if (remainingMinutes >= this.config.minBlockSizeMinutes) {
          blocks.push({
            startDt: new Date(currentTime),
            endDt: new Date(windowEnd),
            label: 'Buffer / Admin Time',
            notes: 'Unallocated time for breaks, admin work, or overflow'
          })
        }
      }
    }

    return blocks
  }
}

import { describe, it, expect } from 'vitest'
import { DayPlanner, CalendarEvent, Task } from './day-planner'

describe('DayPlanner', () => {
  const createDate = (hours: number, minutes: number = 0): Date => {
    const date = new Date('2024-01-15')
    date.setHours(hours, minutes, 0, 0)
    return date
  }

  it('should find free windows between events', () => {
    const planner = new DayPlanner({
      workingHoursStart: 9,
      workingHoursEnd: 17,
      minBlockSizeMinutes: 30
    })

    const date = new Date('2024-01-15')

    const events: CalendarEvent[] = [
      {
        id: '1',
        title: 'Meeting',
        startDt: createDate(10, 0),
        endDt: createDate(11, 0)
      },
      {
        id: '2',
        title: 'Lunch',
        startDt: createDate(12, 0),
        endDt: createDate(13, 0)
      }
    ]

    const tasks: Task[] = []

    const blocks = planner.generatePlan(date, events, tasks)

    // Should have 3 free windows:
    // 9:00-10:00, 11:00-12:00, 13:00-17:00
    expect(blocks.length).toBe(3)
    expect(blocks[0].label).toContain('Buffer')
    expect(blocks[1].label).toContain('Buffer')
    expect(blocks[2].label).toContain('Buffer')
  })

  it('should allocate tasks to free windows', () => {
    const planner = new DayPlanner({
      workingHoursStart: 9,
      workingHoursEnd: 17,
      minBlockSizeMinutes: 30
    })

    const date = new Date('2024-01-15')

    const events: CalendarEvent[] = [
      {
        id: '1',
        title: 'Meeting',
        startDt: createDate(14, 0),
        endDt: createDate(15, 0)
      }
    ]

    const tasks: Task[] = [
      {
        id: 't1',
        title: 'Task 1',
        estimateMinutes: 60,
        priority: 5,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 't2',
        title: 'Task 2',
        estimateMinutes: 120,
        priority: 3,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]

    const blocks = planner.generatePlan(date, events, tasks)

    // Should allocate high priority task first
    const taskBlocks = blocks.filter(b => b.linkedTaskId)
    expect(taskBlocks.length).toBeGreaterThan(0)
    expect(taskBlocks[0].linkedTaskId).toBe('t1')
  })

  it('should respect minimum block size', () => {
    const planner = new DayPlanner({
      workingHoursStart: 9,
      workingHoursEnd: 17,
      minBlockSizeMinutes: 60
    })

    const date = new Date('2024-01-15')

    const events: CalendarEvent[] = [
      {
        id: '1',
        title: 'Meeting 1',
        startDt: createDate(9, 0),
        endDt: createDate(9, 45)
      },
      {
        id: '2',
        title: 'Meeting 2',
        startDt: createDate(10, 0),
        endDt: createDate(17, 0)
      }
    ]

    const tasks: Task[] = []

    const blocks = planner.generatePlan(date, events, tasks)

    // Should not create a block for the 15-minute window
    // (less than minBlockSizeMinutes)
    expect(blocks.length).toBe(0)
  })

  it('should sort tasks by priority, due date, and estimate', () => {
    const planner = new DayPlanner()

    const date = new Date('2024-01-15')
    const events: CalendarEvent[] = []

    const tasks: Task[] = [
      {
        id: 't1',
        title: 'Low priority',
        estimateMinutes: 60,
        priority: 1,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 't2',
        title: 'High priority',
        estimateMinutes: 60,
        priority: 5,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 't3',
        title: 'Medium priority with due date',
        estimateMinutes: 60,
        priority: 3,
        status: 'open',
        dueDate: new Date('2024-01-16'),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]

    const blocks = planner.generatePlan(date, events, tasks)

    const taskBlocks = blocks.filter(b => b.linkedTaskId)

    // High priority task should be first
    expect(taskBlocks[0].linkedTaskId).toBe('t2')
    // Medium priority with due date should be second
    expect(taskBlocks[1].linkedTaskId).toBe('t3')
    // Low priority should be last
    expect(taskBlocks[2].linkedTaskId).toBe('t1')
  })

  it('should split tasks if they do not fit in a window', () => {
    const planner = new DayPlanner({
      workingHoursStart: 9,
      workingHoursEnd: 11,
      minBlockSizeMinutes: 30
    })

    const date = new Date('2024-01-15')
    const events: CalendarEvent[] = []

    const tasks: Task[] = [
      {
        id: 't1',
        title: 'Long task',
        estimateMinutes: 180,
        priority: 5,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]

    const blocks = planner.generatePlan(date, events, tasks)

    const taskBlocks = blocks.filter(b => b.linkedTaskId === 't1')

    // Task should be split (120 minutes available, 180 needed)
    expect(taskBlocks.length).toBe(1)
    expect(taskBlocks[0].label).toContain('Part')
  })
})

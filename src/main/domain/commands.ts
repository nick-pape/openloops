import { repository } from '../db/repository'
import { domainEvents } from '../events/emitter'
import type {
  CreateProjectInput,
  CreateCaptureInput,
  CreateTaskInput,
  UpdateTaskInput
} from '../db/repository'

/**
 * Domain Commands - Single Mutation Pipeline
 *
 * All state mutations MUST flow through these commands.
 * Commands are responsible for:
 * 1. Calling repository methods
 * 2. Emitting domain events after successful mutations
 * 3. Returning updated entities
 *
 * Read operations can bypass commands and call repository directly.
 */

export class ProjectCommands {
  async createProject(input: CreateProjectInput) {
    const project = await repository.createProject(input)
    domainEvents.emitDomainEvent({
      type: 'project.created',
      projectId: project.id,
      name: project.name
    })
    return project
  }

  async updateProject(id: string, name: string) {
    const project = await repository.updateProject(id, name)
    domainEvents.emitDomainEvent({
      type: 'project.updated',
      projectId: id,
      name
    })
    return project
  }

  async deleteProject(id: string) {
    await repository.deleteProject(id)
    domainEvents.emitDomainEvent({
      type: 'project.deleted',
      projectId: id
    })
  }

  // Read operations - no events
  async getProject(id: string) {
    return repository.getProject(id)
  }

  async listProjects() {
    return repository.getAllProjects()
  }

  async getProjectSummary(projectId: string) {
    return repository.getLatestProjectSummary(projectId)
  }
}

export class CaptureCommands {
  async createCapture(input: CreateCaptureInput) {
    const capture = await repository.createCapture(input)
    domainEvents.emitDomainEvent({
      type: 'capture.created',
      captureId: capture.id,
      projectId: capture.projectId || '',
      captureType: capture.type
    })
    return capture
  }

  async updateCapture(id: string, title: string, bodyText: string) {
    const capture = await repository.updateCapture(id, title, bodyText)
    domainEvents.emitDomainEvent({
      type: 'capture.updated',
      captureId: id
    })
    return capture
  }

  async deleteCapture(id: string) {
    // Get capture to check if it has a file
    const capture = await repository.getCapture(id)

    // Delete from database
    await repository.deleteCapture(id)

    // Delete file from disk if it exists
    if (capture && capture.filePath) {
      const fs = require('fs')
      try {
        if (fs.existsSync(capture.filePath)) {
          fs.unlinkSync(capture.filePath)
          console.log('[Commands] Deleted file:', capture.filePath)
        }
      } catch (error) {
        console.error('[Commands] Failed to delete file:', capture.filePath, error)
      }
    }

    domainEvents.emitDomainEvent({
      type: 'capture.deleted',
      captureId: id
    })
  }

  // Read operations - no events
  async getCapture(id: string) {
    return repository.getCapture(id)
  }

  async searchCaptures(
    projectId: string,
    type?: string,
    query?: string,
    startDate?: Date,
    endDate?: Date
  ) {
    let captures = await repository.getCapturesWithFlags(projectId)

    // Filter by type
    if (type) {
      captures = captures.filter(c => c.type === type)
    }

    // Filter by text search (case-insensitive search on title and bodyText)
    if (query) {
      const lowerQuery = query.toLowerCase()
      captures = captures.filter(c => {
        const titleMatch = c.title?.toLowerCase().includes(lowerQuery)
        const bodyMatch = c.bodyText?.toLowerCase().includes(lowerQuery)
        return titleMatch || bodyMatch
      })
    }

    // Filter by date range
    if (startDate) {
      captures = captures.filter(c => new Date(c.createdAt) >= startDate)
    }
    if (endDate) {
      captures = captures.filter(c => new Date(c.createdAt) <= endDate)
    }

    return captures
  }

  async getCapturesByProject(projectId: string) {
    return repository.getCapturesByProject(projectId)
  }

  async getCapturesWithFlags(projectId: string) {
    return repository.getCapturesWithFlags(projectId)
  }

  async toggleCaptureOpenLoop(captureId: string) {
    await repository.toggleCaptureOpenLoop(captureId)
    domainEvents.emitDomainEvent({
      type: 'capture.updated',
      captureId
    })
  }
}

export class TaskCommands {
  async createTask(input: CreateTaskInput) {
    const task = await repository.createTask(input)
    domainEvents.emitDomainEvent({
      type: 'task.created',
      taskId: task.id,
      projectId: task.projectId || undefined,
      title: task.title
    })
    return task
  }

  async updateTask(id: string, input: UpdateTaskInput) {
    const task = await repository.updateTask(id, input)
    domainEvents.emitDomainEvent({
      type: 'task.updated',
      taskId: id,
      status: input.status
    })
    return task
  }

  async deleteTask(id: string) {
    await repository.deleteTask(id)
    domainEvents.emitDomainEvent({
      type: 'task.deleted',
      taskId: id
    })
  }

  // Read operations - no events
  async getTask(id: string) {
    return repository.getTask(id)
  }

  async listTasks(projectId?: string, status?: 'open' | 'done') {
    if (status === 'open') {
      return repository.getOpenTasks(projectId)
    }
    return repository.getAllTasks(projectId)
  }

  async getOpenTasks(projectId?: string) {
    return repository.getOpenTasks(projectId)
  }

  async getAllTasks(projectId?: string) {
    return repository.getAllTasks(projectId)
  }

  async getInboxTasks() {
    return repository.getInboxTasks()
  }
}

export class SummaryCommands {
  async createSummary(projectId: string, summaryMd: string, provider: string, windowStart: Date, windowEnd: Date) {
    const summaryId = await repository.createProjectSummary(projectId, summaryMd, provider, windowStart, windowEnd)
    domainEvents.emitDomainEvent({
      type: 'summary.generated',
      projectId,
      summaryId
    })
    return summaryId
  }

  // Read operations - no events
  async getLatestSummary(projectId: string) {
    return repository.getLatestProjectSummary(projectId)
  }
}

export class PlanningProfileCommands {
  async createProfile(name: string, instructionsText: string, constraintsJson?: string) {
    const profile = await repository.createPlanningProfile(name, instructionsText, constraintsJson)
    domainEvents.emitDomainEvent({
      type: 'planning.profile.created',
      profileId: profile.id,
      name
    })
    return profile
  }

  async updateProfile(id: string, name: string, instructionsText: string, constraintsJson?: string) {
    const profile = await repository.updatePlanningProfile(id, name, instructionsText, constraintsJson)
    domainEvents.emitDomainEvent({
      type: 'planning.profile.updated',
      profileId: id
    })
    return profile
  }

  async setDefaultProfile(id: string) {
    await repository.setPlanningProfileDefault(id)
    domainEvents.emitDomainEvent({
      type: 'planning.profile.set_default',
      profileId: id
    })
  }

  async deleteProfile(id: string) {
    await repository.deletePlanningProfile(id)
    domainEvents.emitDomainEvent({
      type: 'planning.profile.deleted',
      profileId: id
    })
  }

  // Read operations - no events
  async getProfile(id: string) {
    return repository.getPlanningProfile(id)
  }

  async listProfiles() {
    return repository.getAllPlanningProfiles()
  }
}

export class PlannerCommands {
  // Draft Plan Lifecycle
  async createDraft(date: string, planningProfileId?: string) {
    // Delete existing draft for this date if any
    const existing = await repository.getDayPlan(date)
    if (existing && existing.status === 'draft') {
      await repository.deleteDayPlan(existing.id)
    }

    const planId = await repository.createDayPlan(date, 'draft', planningProfileId)
    domainEvents.emitDomainEvent({
      type: 'plan.draft.created',
      planId,
      date
    })
    return planId
  }

  async getDraft(date: string) {
    const plan = await repository.getDayPlan(date)
    if (!plan || plan.status !== 'draft') return null
    const blocks = await repository.getDayPlanBlocks(plan.id)
    return { plan, blocks }
  }

  async discardDraft(date: string) {
    const plan = await repository.getDayPlan(date)
    if (!plan || plan.status !== 'draft') {
      throw new Error('No draft plan found for this date')
    }
    await repository.deleteDayPlan(plan.id)
    domainEvents.emitDomainEvent({
      type: 'plan.draft.discarded',
      planId: plan.id,
      date
    })
  }

  async commitDraft(date: string) {
    const plan = await repository.getDayPlan(date)
    if (!plan || plan.status !== 'draft') {
      throw new Error('No draft plan found for this date')
    }

    // Check if there's already a committed plan for this date
    // (shouldn't happen, but handle it)
    const blocks = await repository.getDayPlanBlocks(plan.id)

    // Validate before commit
    const validation = await this.validateDraft(plan.id)
    if (validation.errors.length > 0) {
      throw new Error(`Cannot commit plan with validation errors: ${validation.errors.map(e => e.message).join(', ')}`)
    }

    await repository.updateDayPlanStatus(plan.id, 'committed')
    domainEvents.emitDomainEvent({
      type: 'plan.committed',
      planId: plan.id,
      date,
      blockCount: blocks.length
    })
    return plan.id
  }

  async uncommitDraft(date: string) {
    const plan = await repository.getDayPlan(date)
    if (!plan || plan.status !== 'committed') {
      throw new Error('No committed plan found for this date')
    }

    await repository.updateDayPlanStatus(plan.id, 'draft')
    domainEvents.emitDomainEvent({
      type: 'plan.uncommitted',
      planId: plan.id,
      date
    })
    return plan.id
  }

  // Block Primitives
  async addBlock(
    planId: string,
    startDt: Date,
    endDt: Date,
    label: string,
    kind: 'calendar_fixed' | 'task' | 'focus' | 'break' | 'buffer' | 'admin',
    locked: boolean,
    source?: { type: 'calendar'; eventId: string },
    linkedTaskId?: string,
    notes?: string
  ) {
    const plan = await repository.getDayPlanById(planId)
    if (!plan) {
      throw new Error('Plan not found')
    }
    if (plan.status === 'committed') {
      throw new Error('Cannot modify committed plan')
    }

    const blockId = await repository.createDayPlanBlock(
      planId,
      startDt,
      endDt,
      label,
      kind,
      locked,
      source,
      linkedTaskId,
      notes
    )
    domainEvents.emitDomainEvent({
      type: 'plan.block.added',
      planId,
      blockId,
      kind
    })
    return blockId
  }

  async updateBlock(
    blockId: string,
    updates: {
      startDt?: Date
      endDt?: Date
      label?: string
      kind?: 'calendar_fixed' | 'task' | 'focus' | 'break' | 'buffer' | 'admin'
      locked?: boolean
      source?: { type: 'calendar'; eventId: string } | null
      linkedTaskId?: string
      notes?: string
    }
  ) {
    const block = await repository.getDayPlanBlock(blockId)
    if (!block) {
      throw new Error('Block not found')
    }

    const plan = await repository.getDayPlanById(block.dayPlanId)
    if (plan.status === 'committed') {
      throw new Error('Cannot modify committed plan')
    }

    if (block.locked && (updates.startDt !== undefined || updates.endDt !== undefined)) {
      throw new Error('Cannot move locked block')
    }

    const updated = await repository.updateDayPlanBlock(blockId, updates)
    domainEvents.emitDomainEvent({
      type: 'plan.block.updated',
      planId: block.dayPlanId,
      blockId
    })
    return updated
  }

  async moveBlock(blockId: string, startDt: Date, endDt: Date) {
    return this.updateBlock(blockId, { startDt, endDt })
  }

  async deleteBlock(blockId: string) {
    const block = await repository.getDayPlanBlock(blockId)
    if (!block) {
      throw new Error('Block not found')
    }

    const plan = await repository.getDayPlanById(block.dayPlanId)
    if (plan.status === 'committed') {
      throw new Error('Cannot modify committed plan')
    }

    if (block.locked) {
      throw new Error('Cannot delete locked block')
    }

    await repository.deleteDayPlanBlock(blockId)
    domainEvents.emitDomainEvent({
      type: 'plan.block.deleted',
      planId: block.dayPlanId,
      blockId
    })
  }

  // Validation
  async validateDraft(planId: string): Promise<{
    valid: boolean
    errors: Array<{ type: string; message: string; blockId?: string }>
  }> {
    const plan = await repository.getDayPlanById(planId)
    if (!plan) {
      throw new Error('Plan not found')
    }

    const blocks = await repository.getDayPlanBlocks(planId)
    const errors: Array<{ type: string; message: string; blockId?: string }> = []

    // Get calendar events for this date to check conflicts
    const planDate = new Date(plan.date)
    const calendarEvents = await repository.getCalendarEventsForDate(planDate)

    // Check for overlapping blocks (non-calendar blocks can't overlap)
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const blockA = blocks[i]
        const blockB = blocks[j]

        // Skip if either is calendar_fixed (they can overlap)
        if (blockA.kind === 'calendar_fixed' || blockB.kind === 'calendar_fixed') continue

        const startA = new Date(blockA.startDt).getTime()
        const endA = new Date(blockA.endDt).getTime()
        const startB = new Date(blockB.startDt).getTime()
        const endB = new Date(blockB.endDt).getTime()

        if (startA < endB && startB < endA) {
          errors.push({
            type: 'overlap',
            message: `Block "${blockA.label}" overlaps with "${blockB.label}"`,
            blockId: blockA.id
          })
        }
      }
    }

    // Check conflicts with calendar events (non-calendar blocks shouldn't overlap calendar events)
    for (const block of blocks) {
      if (block.kind === 'calendar_fixed') continue

      const blockStart = new Date(block.startDt).getTime()
      const blockEnd = new Date(block.endDt).getTime()

      for (const event of calendarEvents) {
        const eventStart = new Date(event.startDt).getTime()
        const eventEnd = new Date(event.endDt).getTime()

        if (blockStart < eventEnd && eventStart < blockEnd) {
          errors.push({
            type: 'calendar_conflict',
            message: `Block "${block.label}" conflicts with calendar event "${event.title}"`,
            blockId: block.id
          })
        }
      }
    }

    // Check that blocks are within the day bounds
    const dayStart = new Date(plan.date + 'T00:00:00')
    const dayEnd = new Date(plan.date + 'T23:59:59')

    for (const block of blocks) {
      const blockStart = new Date(block.startDt)
      const blockEnd = new Date(block.endDt)

      if (blockStart < dayStart || blockEnd > dayEnd) {
        errors.push({
          type: 'out_of_bounds',
          message: `Block "${block.label}" is outside day bounds`,
          blockId: block.id
        })
      }

      if (blockStart >= blockEnd) {
        errors.push({
          type: 'invalid_time',
          message: `Block "${block.label}" has invalid time range`,
          blockId: block.id
        })
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  // Read operations - no events
  async getDayPlan(date: string) {
    return repository.getDayPlan(date)
  }

  async getPlanBlocks(planId: string) {
    return repository.getDayPlanBlocks(planId)
  }
}

// Export singleton instances
export const projectCommands = new ProjectCommands()
export const captureCommands = new CaptureCommands()
export const taskCommands = new TaskCommands()
export const summaryCommands = new SummaryCommands()
export const planningProfileCommands = new PlanningProfileCommands()
export const plannerCommands = new PlannerCommands()

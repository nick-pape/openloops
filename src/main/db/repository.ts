import { eq, and, or, desc, gte, lte, inArray, isNull } from 'drizzle-orm'
import { getDatabase } from './database'
import * as schema from './schema'
import { v4 as uuidv4 } from 'uuid'

export interface CreateProjectInput {
  name: string
}

export interface CreateCaptureInput {
  projectId?: string        // Set if project-level capture
  linkedTaskId?: string     // Set if task-level capture
  type: 'text' | 'image' | 'audio' | 'chat' | 'decision'
  title?: string | null     // Optional - AI can generate
  bodyText?: string
  filePath?: string
  metadata?: string
  // CONSTRAINT: Exactly one of projectId or linkedTaskId must be set
}

export interface CreateTaskInput {
  projectId?: string
  title: string
  notes?: string
  priority?: number
  estimateMinutes?: number
  dueDate?: Date
}

export interface UpdateTaskInput {
  title?: string
  notes?: string
  status?: 'open' | 'done'
  priority?: number
  estimateMinutes?: number
  dueDate?: Date
  projectId?: string | null  // Allow reassigning task to different project or inbox
}

export class Repository {
  // Projects
  async createProject(input: CreateProjectInput) {
    const db = getDatabase()
    const id = uuidv4()
    const now = new Date()

    await db.insert(schema.projects).values({
      id,
      name: input.name,
      createdAt: now,
      updatedAt: now
    })

    return this.getProject(id)
  }

  async getProject(id: string) {
    const db = getDatabase()
    const result = await db.select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1)
    return result[0]
  }

  async getAllProjects() {
    const db = getDatabase()
    return db.select().from(schema.projects).orderBy(desc(schema.projects.updatedAt))
  }

  async updateProject(id: string, name: string) {
    const db = getDatabase()
    await db.update(schema.projects)
      .set({ name, updatedAt: new Date() })
      .where(eq(schema.projects.id, id))
    return this.getProject(id)
  }

  async deleteProject(id: string) {
    const db = getDatabase()
    await db.delete(schema.projects).where(eq(schema.projects.id, id))
  }

  // Captures
  async createCapture(input: CreateCaptureInput) {
    const db = getDatabase()
    const id = uuidv4()
    const flagId = uuidv4()

    // Validate constraint: exactly one of projectId or linkedTaskId must be set
    const hasProjectId = !!input.projectId
    const hasLinkedTaskId = !!input.linkedTaskId

    if (hasProjectId === hasLinkedTaskId) {
      throw new Error('Capture must have exactly one of projectId or linkedTaskId')
    }

    await db.insert(schema.captures).values({
      id,
      projectId: input.projectId,
      linkedTaskId: input.linkedTaskId,
      type: input.type,
      title: input.title,
      bodyText: input.bodyText,
      filePath: input.filePath,
      metadata: input.metadata,
      createdAt: new Date()
    })

    await db.insert(schema.captureFlags).values({
      id: flagId,
      captureId: id,
      isOpenLoop: false
    })

    return this.getCapture(id)
  }

  // Helper to parse tags from database
  private parseCaptureFields(capture: any) {
    if (!capture) return capture
    return {
      ...capture,
      tags: capture.tags ? JSON.parse(capture.tags) : []
    }
  }

  async getCapture(id: string) {
    const db = getDatabase()
    const result = await db.select().from(schema.captures).where(eq(schema.captures.id, id)).limit(1)
    return this.parseCaptureFields(result[0])
  }

  async getCapturesByProject(projectId: string) {
    const db = getDatabase()
    const results = await db.select().from(schema.captures)
      .where(eq(schema.captures.projectId, projectId))
      .orderBy(desc(schema.captures.createdAt))
    return results.map(c => this.parseCaptureFields(c))
  }

  async getCapturesWithFlags(projectId: string) {
    const db = getDatabase()

    // Get all captures for this project, including:
    // 1. Direct project captures (projectId = X)
    // 2. Task-linked captures (linkedTaskId IN (tasks for project X))

    // First, get task IDs for this project
    const projectTasks = await db.select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId))

    const taskIds = projectTasks.map(t => t.id)

    // Build where clause
    const whereClause = taskIds.length > 0
      ? or(
          eq(schema.captures.projectId, projectId),
          inArray(schema.captures.linkedTaskId, taskIds)
        )
      : eq(schema.captures.projectId, projectId)

    // Get captures with flags
    const captures = await db.select({
      capture: schema.captures,
      flag: schema.captureFlags
    })
      .from(schema.captures)
      .leftJoin(schema.captureFlags, eq(schema.captures.id, schema.captureFlags.captureId))
      .where(whereClause)
      .orderBy(desc(schema.captures.createdAt))

    return captures.map(c => this.parseCaptureFields({
      ...c.capture,
      isOpenLoop: c.flag?.isOpenLoop || false
    }))
  }

  async toggleCaptureOpenLoop(captureId: string) {
    const db = getDatabase()
    const flag = await db.select().from(schema.captureFlags)
      .where(eq(schema.captureFlags.captureId, captureId))
      .limit(1)

    if (flag[0]) {
      await db.update(schema.captureFlags)
        .set({ isOpenLoop: !flag[0].isOpenLoop })
        .where(eq(schema.captureFlags.captureId, captureId))
    }
  }

  async updateCapture(id: string, title: string, bodyText: string) {
    const db = getDatabase()
    await db.update(schema.captures)
      .set({ title, bodyText })
      .where(eq(schema.captures.id, id))
    return this.getCapture(id)
  }

  async updateCaptureDetailedDescription(id: string, detailedDescription: string) {
    const db = getDatabase()
    await db.update(schema.captures)
      .set({ detailedDescription })
      .where(eq(schema.captures.id, id))
  }

  async updateCaptureTags(id: string, tags: string[]) {
    const db = getDatabase()
    await db.update(schema.captures)
      .set({ tags: JSON.stringify(tags) })
      .where(eq(schema.captures.id, id))
  }

  async deleteCapture(id: string) {
    const db = getDatabase()
    // Delete associated flags
    await db.delete(schema.captureFlags).where(eq(schema.captureFlags.captureId, id))
    // Delete associated transcriptions
    await db.delete(schema.transcriptions).where(eq(schema.transcriptions.captureId, id))
    // Delete the capture
    await db.delete(schema.captures).where(eq(schema.captures.id, id))
  }

  async getCapturesByTask(taskId: string) {
    const db = getDatabase()
    const results = await db.select().from(schema.captures)
      .where(eq(schema.captures.linkedTaskId, taskId))
      .orderBy(desc(schema.captures.createdAt))
    return results.map(c => this.parseCaptureFields(c))
  }

  // Transcriptions
  async createTranscription(captureId: string, provider: string) {
    const db = getDatabase()
    const id = uuidv4()
    const now = new Date()

    await db.insert(schema.transcriptions).values({
      id,
      captureId,
      status: 'pending',
      provider,
      createdAt: now,
      updatedAt: now
    })

    return id
  }

  async updateTranscription(id: string, status: 'done' | 'error', text?: string, errorMessage?: string) {
    const db = getDatabase()
    await db.update(schema.transcriptions)
      .set({ status, text, errorMessage, updatedAt: new Date() })
      .where(eq(schema.transcriptions.id, id))
  }

  async getTranscriptionByCapture(captureId: string) {
    const db = getDatabase()
    const result = await db.select().from(schema.transcriptions)
      .where(eq(schema.transcriptions.captureId, captureId))
      .orderBy(desc(schema.transcriptions.createdAt))
      .limit(1)
    return result[0]
  }

  // Tasks
  async createTask(input: CreateTaskInput) {
    const db = getDatabase()
    const id = uuidv4()
    const now = new Date()

    await db.insert(schema.tasks).values({
      id,
      projectId: input.projectId,
      title: input.title,
      notes: input.notes,
      priority: input.priority || 3,
      estimateMinutes: input.estimateMinutes || 30,
      dueDate: input.dueDate,
      createdAt: now,
      updatedAt: now
    })

    return this.getTask(id)
  }

  async getTask(id: string) {
    const db = getDatabase()
    const result = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1)
    return result[0]
  }

  async getOpenTasks(projectId?: string) {
    const db = getDatabase()

    if (projectId) {
      return db.select().from(schema.tasks)
        .where(and(
          eq(schema.tasks.status, 'open'),
          eq(schema.tasks.projectId, projectId)
        ))
        .orderBy(desc(schema.tasks.priority), schema.tasks.dueDate)
    }

    return db.select().from(schema.tasks)
      .where(eq(schema.tasks.status, 'open'))
      .orderBy(desc(schema.tasks.priority), schema.tasks.dueDate)
  }

  async getAllTasks(projectId?: string) {
    const db = getDatabase()

    if (projectId) {
      return db.select().from(schema.tasks)
        .where(eq(schema.tasks.projectId, projectId))
        .orderBy(desc(schema.tasks.priority), schema.tasks.dueDate)
    }

    return db.select().from(schema.tasks)
      .orderBy(desc(schema.tasks.priority), schema.tasks.dueDate)
  }

  async getInboxTasks() {
    const db = getDatabase()
    // Get tasks where projectId is NULL (inbox/ad-hoc tasks)
    return db.select().from(schema.tasks)
      .where(isNull(schema.tasks.projectId))
      .orderBy(desc(schema.tasks.priority), schema.tasks.dueDate)
  }

  async updateTask(id: string, input: UpdateTaskInput) {
    const db = getDatabase()
    await db.update(schema.tasks)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.tasks.id, id))
    return this.getTask(id)
  }

  async deleteTask(id: string) {
    const db = getDatabase()
    await db.delete(schema.tasks).where(eq(schema.tasks.id, id))
  }

  // Project Summaries
  async createProjectSummary(projectId: string, summaryMd: string, provider: string, windowStart: Date, windowEnd: Date) {
    const db = getDatabase()
    const id = uuidv4()

    await db.insert(schema.projectSummaries).values({
      id,
      projectId,
      summaryMd,
      provider,
      sourceWindowStart: windowStart,
      sourceWindowEnd: windowEnd,
      createdAt: new Date()
    })

    return id
  }

  async getLatestProjectSummary(projectId: string) {
    const db = getDatabase()
    const result = await db.select().from(schema.projectSummaries)
      .where(eq(schema.projectSummaries.projectId, projectId))
      .orderBy(desc(schema.projectSummaries.createdAt))
      .limit(1)
    return result[0]
  }

  // Calendar Events
  async createCalendarEvent(title: string, startDt: Date, endDt: Date, externalUid?: string, rawJson?: string) {
    const db = getDatabase()
    const id = uuidv4()

    await db.insert(schema.calendarEvents).values({
      id,
      source: 'ics',
      externalUid,
      title,
      startDt,
      endDt,
      rawJson: rawJson || '{}',
      importedAt: new Date()
    })

    return id
  }

  async getCalendarEventsForDate(date: Date) {
    const db = getDatabase()
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    return db.select().from(schema.calendarEvents)
      .where(
        and(
          lte(schema.calendarEvents.startDt, endOfDay),
          gte(schema.calendarEvents.endDt, startOfDay)
        )
      )
      .orderBy(schema.calendarEvents.startDt)
  }

  async clearCalendarEvents() {
    const db = getDatabase()
    await db.delete(schema.calendarEvents)
  }

  async upsertMicrosoftGraphEvent(externalUid: string, title: string, startDt: Date, endDt: Date, rawJson: string) {
    const db = getDatabase()

    // Check if event already exists
    const existing = await db.select().from(schema.calendarEvents)
      .where(eq(schema.calendarEvents.externalUid, externalUid))
      .limit(1)

    if (existing.length > 0) {
      // Update existing event
      await db.update(schema.calendarEvents)
        .set({
          title,
          startDt,
          endDt,
          rawJson,
          importedAt: new Date()
        })
        .where(eq(schema.calendarEvents.externalUid, externalUid))

      return { id: existing[0].id, updated: true }
    } else {
      // Insert new event
      const id = uuidv4()
      await db.insert(schema.calendarEvents).values({
        id,
        source: 'microsoft-graph',
        externalUid,
        title,
        startDt,
        endDt,
        rawJson,
        importedAt: new Date()
      })

      return { id, updated: false }
    }
  }

  async getMicrosoftGraphEvents() {
    const db = getDatabase()
    return db.select().from(schema.calendarEvents)
      .where(eq(schema.calendarEvents.source, 'microsoft-graph'))
      .orderBy(schema.calendarEvents.startDt)
  }

  async deleteMicrosoftGraphEvents() {
    const db = getDatabase()
    await db.delete(schema.calendarEvents)
      .where(eq(schema.calendarEvents.source, 'microsoft-graph'))
  }

  // Planning Profiles
  async createPlanningProfile(name: string, instructionsText: string, constraintsJson?: string) {
    const db = getDatabase()
    const id = uuidv4()
    const now = new Date()

    await db.insert(schema.planningProfiles).values({
      id,
      name,
      instructionsText,
      constraintsJson,
      isDefault: false,
      createdAt: now,
      updatedAt: now
    })

    return this.getPlanningProfile(id)
  }

  async getPlanningProfile(id: string) {
    const db = getDatabase()
    const result = await db.select().from(schema.planningProfiles)
      .where(eq(schema.planningProfiles.id, id))
      .limit(1)
    return result[0]
  }

  async getAllPlanningProfiles() {
    const db = getDatabase()
    return db.select().from(schema.planningProfiles)
      .orderBy(desc(schema.planningProfiles.updatedAt))
  }

  async updatePlanningProfile(id: string, name: string, instructionsText: string, constraintsJson?: string) {
    const db = getDatabase()
    await db.update(schema.planningProfiles)
      .set({ name, instructionsText, constraintsJson, updatedAt: new Date() })
      .where(eq(schema.planningProfiles.id, id))
    return this.getPlanningProfile(id)
  }

  async setPlanningProfileDefault(id: string) {
    const db = getDatabase()
    // Unset all defaults
    await db.update(schema.planningProfiles).set({ isDefault: false })
    // Set this one as default
    await db.update(schema.planningProfiles)
      .set({ isDefault: true })
      .where(eq(schema.planningProfiles.id, id))
  }

  async deletePlanningProfile(id: string) {
    const db = getDatabase()
    await db.delete(schema.planningProfiles).where(eq(schema.planningProfiles.id, id))
  }

  // Day Plans
  async createDayPlan(date: string, status: 'draft' | 'committed' = 'draft', planningProfileId?: string) {
    const db = getDatabase()
    const id = uuidv4()

    await db.insert(schema.dayPlans).values({
      id,
      date,
      status,
      planningProfileId,
      createdAt: new Date()
    })

    return id
  }

  async getDayPlan(date: string) {
    const db = getDatabase()
    const result = await db.select().from(schema.dayPlans)
      .where(eq(schema.dayPlans.date, date))
      .limit(1)
    return result[0]
  }

  async getDayPlanById(id: string) {
    const db = getDatabase()
    const result = await db.select().from(schema.dayPlans)
      .where(eq(schema.dayPlans.id, id))
      .limit(1)
    return result[0]
  }

  async updateDayPlanStatus(id: string, status: 'draft' | 'committed') {
    const db = getDatabase()
    await db.update(schema.dayPlans)
      .set({ status })
      .where(eq(schema.dayPlans.id, id))
    return this.getDayPlanById(id)
  }

  async deleteDayPlan(id: string) {
    const db = getDatabase()
    await db.delete(schema.dayPlans).where(eq(schema.dayPlans.id, id))
  }

  async createDayPlanBlock(
    dayPlanId: string,
    startDt: Date,
    endDt: Date,
    label: string,
    kind: 'calendar_fixed' | 'task' | 'focus' | 'break' | 'buffer' | 'admin',
    locked: boolean,
    source?: { type: 'calendar'; eventId: string },
    linkedTaskId?: string,
    notes?: string
  ) {
    const db = getDatabase()
    const id = uuidv4()

    await db.insert(schema.dayPlanBlocks).values({
      id,
      dayPlanId,
      startDt,
      endDt,
      label,
      kind,
      locked,
      source: source ? JSON.stringify(source) : null,
      linkedTaskId,
      notes
    })

    return id
  }

  async getDayPlanBlocks(dayPlanId: string) {
    const db = getDatabase()
    return db.select().from(schema.dayPlanBlocks)
      .where(eq(schema.dayPlanBlocks.dayPlanId, dayPlanId))
      .orderBy(schema.dayPlanBlocks.startDt)
  }

  async getDayPlanBlock(id: string) {
    const db = getDatabase()
    const result = await db.select().from(schema.dayPlanBlocks)
      .where(eq(schema.dayPlanBlocks.id, id))
      .limit(1)
    return result[0]
  }

  async updateDayPlanBlock(
    id: string,
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
    const db = getDatabase()
    const setValues: any = {}
    if (updates.startDt !== undefined) setValues.startDt = updates.startDt
    if (updates.endDt !== undefined) setValues.endDt = updates.endDt
    if (updates.label !== undefined) setValues.label = updates.label
    if (updates.kind !== undefined) setValues.kind = updates.kind
    if (updates.locked !== undefined) setValues.locked = updates.locked
    if (updates.source !== undefined) setValues.source = updates.source ? JSON.stringify(updates.source) : null
    if (updates.linkedTaskId !== undefined) setValues.linkedTaskId = updates.linkedTaskId
    if (updates.notes !== undefined) setValues.notes = updates.notes

    await db.update(schema.dayPlanBlocks)
      .set(setValues)
      .where(eq(schema.dayPlanBlocks.id, id))

    return this.getDayPlanBlock(id)
  }

  async deleteDayPlanBlock(id: string) {
    const db = getDatabase()
    await db.delete(schema.dayPlanBlocks).where(eq(schema.dayPlanBlocks.id, id))
  }

  // Job Queue
  async enqueueJob(type: 'transcription' | 'summary' | 'image-description' | 'text-title-generation', payload: any) {
    const db = getDatabase()
    const id = uuidv4()
    const now = new Date()

    await db.insert(schema.jobQueue).values({
      id,
      type,
      status: 'pending',
      payload: JSON.stringify(payload),
      createdAt: now,
      updatedAt: now
    })

    return id
  }

  async getJob(id: string) {
    const db = getDatabase()
    const result = await db.select().from(schema.jobQueue)
      .where(eq(schema.jobQueue.id, id))
      .limit(1)
    return result[0]
  }

  async getAllJobs() {
    const db = getDatabase()
    return db.select().from(schema.jobQueue)
      .orderBy(schema.jobQueue.createdAt)
  }

  async getJobsByProject(projectId: string) {
    // Parse payload to filter by projectId or captureId
    const allJobs = await this.getAllJobs()
    return allJobs.filter(job => {
      try {
        const payload = JSON.parse(job.payload)
        return payload.projectId === projectId || payload.captureId
      } catch {
        return false
      }
    })
  }

  async getNextPendingJob(type: 'transcription' | 'summary' | 'image-description' | 'text-title-generation') {
    const db = getDatabase()
    const result = await db.select().from(schema.jobQueue)
      .where(and(
        eq(schema.jobQueue.type, type),
        eq(schema.jobQueue.status, 'pending')
      ))
      .orderBy(schema.jobQueue.createdAt)
      .limit(1)
    return result[0]
  }

  async getProcessingJobs() {
    const db = getDatabase()
    return db.select().from(schema.jobQueue)
      .where(eq(schema.jobQueue.status, 'processing'))
  }

  async updateJobStatus(id: string, status: 'processing' | 'done' | 'error', result?: string, errorMessage?: string) {
    const db = getDatabase()
    await db.update(schema.jobQueue)
      .set({ status, result, errorMessage, updatedAt: new Date() })
      .where(eq(schema.jobQueue.id, id))
  }

  async clearCompletedJobs() {
    const db = getDatabase()
    await db.delete(schema.jobQueue)
      .where(eq(schema.jobQueue.status, 'done'))
  }

  async clearAllJobs() {
    const db = getDatabase()
    await db.delete(schema.jobQueue)
  }

  // Settings
  async getSetting(key: string): Promise<string | null> {
    const db = getDatabase()
    const result = await db.select().from(schema.settings)
      .where(eq(schema.settings.key, key))
      .limit(1)
    return result[0]?.value ?? null
  }

  async setSetting(key: string, value: string) {
    const db = getDatabase()
    const existing = await db.select().from(schema.settings)
      .where(eq(schema.settings.key, key))
      .limit(1)

    if (existing.length > 0) {
      await db.update(schema.settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(schema.settings.key, key))
    } else {
      await db.insert(schema.settings).values({
        key,
        value,
        updatedAt: new Date()
      })
    }
  }
}

export const repository = new Repository()

import { eq, and, desc, gte, lte } from 'drizzle-orm'
import { getDatabase } from './database'
import * as schema from './schema'
import { v4 as uuidv4 } from 'uuid'

export interface CreateProjectInput {
  name: string
}

export interface CreateCaptureInput {
  projectId: string
  type: 'text' | 'image' | 'audio'
  title: string
  bodyText?: string
  filePath?: string
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

    await db.insert(schema.captures).values({
      id,
      projectId: input.projectId,
      type: input.type,
      title: input.title,
      bodyText: input.bodyText,
      filePath: input.filePath,
      createdAt: new Date()
    })

    await db.insert(schema.captureFlags).values({
      id: flagId,
      captureId: id,
      isOpenLoop: false
    })

    return this.getCapture(id)
  }

  async getCapture(id: string) {
    const db = getDatabase()
    const result = await db.select().from(schema.captures).where(eq(schema.captures.id, id)).limit(1)
    return result[0]
  }

  async getCapturesByProject(projectId: string) {
    const db = getDatabase()
    return db.select().from(schema.captures)
      .where(eq(schema.captures.projectId, projectId))
      .orderBy(desc(schema.captures.createdAt))
  }

  async getCapturesWithFlags(projectId: string) {
    const db = getDatabase()
    const captures = await db.select({
      capture: schema.captures,
      flag: schema.captureFlags
    })
      .from(schema.captures)
      .leftJoin(schema.captureFlags, eq(schema.captures.id, schema.captureFlags.captureId))
      .where(eq(schema.captures.projectId, projectId))
      .orderBy(desc(schema.captures.createdAt))

    return captures.map(c => ({
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

  async deleteCapture(id: string) {
    const db = getDatabase()
    // Delete associated flags
    await db.delete(schema.captureFlags).where(eq(schema.captureFlags.captureId, id))
    // Delete associated transcriptions
    await db.delete(schema.transcriptions).where(eq(schema.transcriptions.captureId, id))
    // Delete the capture
    await db.delete(schema.captures).where(eq(schema.captures.id, id))
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

  // Day Plans
  async createDayPlan(date: string) {
    const db = getDatabase()
    const id = uuidv4()

    await db.insert(schema.dayPlans).values({
      id,
      date,
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

  async deleteDayPlan(id: string) {
    const db = getDatabase()
    await db.delete(schema.dayPlans).where(eq(schema.dayPlans.id, id))
  }

  async createDayPlanBlock(dayPlanId: string, startDt: Date, endDt: Date, label: string, linkedTaskId?: string, notes?: string) {
    const db = getDatabase()
    const id = uuidv4()

    await db.insert(schema.dayPlanBlocks).values({
      id,
      dayPlanId,
      startDt,
      endDt,
      label,
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

  async updateDayPlanBlock(id: string, startDt: Date, endDt: Date, label: string, notes?: string) {
    const db = getDatabase()
    await db.update(schema.dayPlanBlocks)
      .set({ startDt, endDt, label, notes })
      .where(eq(schema.dayPlanBlocks.id, id))
  }

  async deleteDayPlanBlock(id: string) {
    const db = getDatabase()
    await db.delete(schema.dayPlanBlocks).where(eq(schema.dayPlanBlocks.id, id))
  }

  // Job Queue
  async enqueueJob(type: 'transcription' | 'summary', payload: any) {
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

  async getNextPendingJob(type: 'transcription' | 'summary') {
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

  async updateJobStatus(id: string, status: 'processing' | 'done' | 'error', result?: string, errorMessage?: string) {
    const db = getDatabase()
    await db.update(schema.jobQueue)
      .set({ status, result, errorMessage, updatedAt: new Date() })
      .where(eq(schema.jobQueue.id, id))
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

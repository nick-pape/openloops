import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
})

export const captures = sqliteTable('captures', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['text', 'image', 'audio'] }).notNull(),
  title: text('title').notNull(),
  bodyText: text('body_text'),
  filePath: text('file_path'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
})

export const captureFlags = sqliteTable('capture_flags', {
  id: text('id').primaryKey(),
  captureId: text('capture_id').notNull().references(() => captures.id, { onDelete: 'cascade' }),
  isOpenLoop: integer('is_open_loop', { mode: 'boolean' }).notNull().default(false)
})

export const transcriptions = sqliteTable('transcriptions', {
  id: text('id').primaryKey(),
  captureId: text('capture_id').notNull().references(() => captures.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'done', 'error'] }).notNull().default('pending'),
  text: text('text'),
  errorMessage: text('error_message'),
  provider: text('provider').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
})

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  notes: text('notes'),
  status: text('status', { enum: ['open', 'done'] }).notNull().default('open'),
  priority: integer('priority').notNull().default(3),
  estimateMinutes: integer('estimate_minutes').notNull().default(30),
  dueDate: integer('due_date', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
})

export const projectSummaries = sqliteTable('project_summaries', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  summaryMd: text('summary_md').notNull(),
  provider: text('provider').notNull(),
  sourceWindowStart: integer('source_window_start', { mode: 'timestamp' }).notNull(),
  sourceWindowEnd: integer('source_window_end', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
})

export const calendarEvents = sqliteTable('calendar_events', {
  id: text('id').primaryKey(),
  source: text('source').notNull().default('ics'),
  externalUid: text('external_uid'),
  title: text('title').notNull(),
  startDt: integer('start_dt', { mode: 'timestamp' }).notNull(),
  endDt: integer('end_dt', { mode: 'timestamp' }).notNull(),
  rawJson: text('raw_json').notNull(),
  importedAt: integer('imported_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
})

export const dayPlans = sqliteTable('day_plans', {
  id: text('id').primaryKey(),
  date: text('date').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
})

export const dayPlanBlocks = sqliteTable('day_plan_blocks', {
  id: text('id').primaryKey(),
  dayPlanId: text('day_plan_id').notNull().references(() => dayPlans.id, { onDelete: 'cascade' }),
  startDt: integer('start_dt', { mode: 'timestamp' }).notNull(),
  endDt: integer('end_dt', { mode: 'timestamp' }).notNull(),
  label: text('label').notNull(),
  linkedTaskId: text('linked_task_id').references(() => tasks.id, { onDelete: 'set null' }),
  notes: text('notes')
})

export const jobQueue = sqliteTable('job_queue', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['transcription', 'summary'] }).notNull(),
  status: text('status', { enum: ['pending', 'processing', 'done', 'error'] }).notNull().default('pending'),
  payload: text('payload').notNull(),
  result: text('result'),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
})

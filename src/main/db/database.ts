import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { runMigrations as runSchemaMigrations } from './migrations'

let db: ReturnType<typeof drizzle>
let sqlite: Database.Database

export function initDatabase() {
  const userDataPath = app.getPath('userData')
  const appDataDir = path.join(userDataPath, 'app-data')

  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true })
  }

  const dbPath = path.join(appDataDir, 'loops.db')
  sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')

  db = drizzle(sqlite, { schema })

  runMigrations()

  return db
}

function runMigrations() {
  // Run initial schema creation (for fresh databases)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      linked_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('text', 'image', 'audio', 'chat', 'decision')),
      title TEXT,
      body_text TEXT,
      file_path TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      CHECK (
        (project_id IS NOT NULL AND linked_task_id IS NULL) OR
        (project_id IS NULL AND linked_task_id IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS capture_flags (
      id TEXT PRIMARY KEY,
      capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
      is_open_loop INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transcriptions (
      id TEXT PRIMARY KEY,
      capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'done', 'error')),
      text TEXT,
      error_message TEXT,
      provider TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'done')),
      priority INTEGER NOT NULL DEFAULT 3,
      estimate_minutes INTEGER NOT NULL DEFAULT 30,
      due_date INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS project_summaries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      summary_md TEXT NOT NULL,
      provider TEXT NOT NULL,
      source_window_start INTEGER NOT NULL,
      source_window_end INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'ics',
      external_uid TEXT,
      title TEXT NOT NULL,
      start_dt INTEGER NOT NULL,
      end_dt INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      imported_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS day_plans (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS day_plan_blocks (
      id TEXT PRIMARY KEY,
      day_plan_id TEXT NOT NULL REFERENCES day_plans(id) ON DELETE CASCADE,
      start_dt INTEGER NOT NULL,
      end_dt INTEGER NOT NULL,
      label TEXT NOT NULL,
      linked_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS job_queue (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('transcription', 'summary', 'image-description', 'text-title-generation', 'task-extraction', 'decision-extraction')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'done', 'error')),
      payload TEXT NOT NULL,
      result TEXT,
      error_message TEXT,
      provider TEXT,
      model TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_captures_project ON captures(project_id);
    CREATE INDEX IF NOT EXISTS idx_captures_task ON captures(linked_task_id);
    CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(start_dt, end_dt);
    CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status, type);
  `)

  // Run schema migrations (for existing databases)
  runSchemaMigrations(sqlite)
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export function getSqlite() {
  if (!sqlite) {
    throw new Error('Database not initialized')
  }
  return sqlite
}

export function closeDatabase() {
  if (sqlite) {
    sqlite.close()
  }
}

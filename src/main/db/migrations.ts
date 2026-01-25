import Database from 'better-sqlite3'

export interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

// All migrations in order
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'add-image-description-job-type',
    up: (db) => {
      console.log('[Migration] Running: add-image-description-job-type')

      // SQLite doesn't support modifying CHECK constraints, so we recreate the table
      db.exec(`
        BEGIN TRANSACTION;

        -- Create new table with updated constraint
        CREATE TABLE job_queue_new (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK(type IN ('transcription', 'summary', 'image-description')),
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'done', 'error')),
          payload TEXT NOT NULL,
          result TEXT,
          error_message TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        -- Copy data from old table
        INSERT INTO job_queue_new SELECT * FROM job_queue;

        -- Drop old table
        DROP TABLE job_queue;

        -- Rename new table
        ALTER TABLE job_queue_new RENAME TO job_queue;

        COMMIT;
      `)

      console.log('[Migration] Completed: add-image-description-job-type')
    }
  },
  {
    version: 2,
    name: 'add-job-queue-metadata-columns',
    up: (db) => {
      console.log('[Migration] Running: add-job-queue-metadata-columns')

      // Add provider, model, and metadata columns to job_queue
      db.exec(`
        BEGIN TRANSACTION;

        -- Add new columns
        ALTER TABLE job_queue ADD COLUMN provider TEXT;
        ALTER TABLE job_queue ADD COLUMN model TEXT;
        ALTER TABLE job_queue ADD COLUMN metadata TEXT;

        COMMIT;
      `)

      console.log('[Migration] Completed: add-job-queue-metadata-columns')
    }
  },
  {
    version: 3,
    name: 'add-task-linked-captures',
    up: (db) => {
      console.log('[Migration] Running: add-task-linked-captures')

      // SQLite doesn't support modifying NOT NULL or adding CHECK constraints to existing tables
      // We need to recreate the captures table
      db.exec(`
        BEGIN TRANSACTION;

        -- Create new captures table with updated schema
        CREATE TABLE captures_new (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          linked_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK(type IN ('text', 'image', 'audio')),
          title TEXT NOT NULL,
          body_text TEXT,
          file_path TEXT,
          metadata TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          CHECK (
            (project_id IS NOT NULL AND linked_task_id IS NULL) OR
            (project_id IS NULL AND linked_task_id IS NOT NULL)
          )
        );

        -- Copy existing data (all have project_id, none have linked_task_id)
        INSERT INTO captures_new (id, project_id, linked_task_id, type, title, body_text, file_path, created_at)
        SELECT id, project_id, NULL, type, title, body_text, file_path, created_at
        FROM captures;

        -- Recreate dependent tables (capture_flags, transcriptions)
        -- First backup capture_flags
        CREATE TEMP TABLE capture_flags_backup AS SELECT * FROM capture_flags;
        DROP TABLE capture_flags;

        CREATE TABLE capture_flags (
          id TEXT PRIMARY KEY,
          capture_id TEXT NOT NULL REFERENCES captures_new(id) ON DELETE CASCADE,
          is_open_loop INTEGER NOT NULL DEFAULT 0
        );

        INSERT INTO capture_flags SELECT * FROM capture_flags_backup;
        DROP TABLE capture_flags_backup;

        -- Backup transcriptions
        CREATE TEMP TABLE transcriptions_backup AS SELECT * FROM transcriptions;
        DROP TABLE transcriptions;

        CREATE TABLE transcriptions (
          id TEXT PRIMARY KEY,
          capture_id TEXT NOT NULL REFERENCES captures_new(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'done', 'error')),
          text TEXT,
          error_message TEXT,
          provider TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        INSERT INTO transcriptions SELECT * FROM transcriptions_backup;
        DROP TABLE transcriptions_backup;

        -- Drop old captures table
        DROP TABLE captures;

        -- Rename new table
        ALTER TABLE captures_new RENAME TO captures;

        -- Recreate indexes
        CREATE INDEX IF NOT EXISTS idx_captures_project ON captures(project_id);
        CREATE INDEX IF NOT EXISTS idx_captures_task ON captures(linked_task_id);
        CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at DESC);

        COMMIT;
      `)

      console.log('[Migration] Completed: add-task-linked-captures')
    }
  },
  {
    version: 4,
    name: 'make-title-nullable-and-add-text-title-job',
    up: (db) => {
      console.log('[Migration] Running: make-title-nullable-and-add-text-title-job')

      db.exec(`
        BEGIN TRANSACTION;

        -- Recreate captures table with nullable title
        CREATE TABLE captures_new (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          linked_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK(type IN ('text', 'image', 'audio')),
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

        -- Copy existing data
        INSERT INTO captures_new SELECT * FROM captures;

        -- Backup and recreate dependent tables
        CREATE TEMP TABLE capture_flags_backup AS SELECT * FROM capture_flags;
        DROP TABLE capture_flags;

        CREATE TABLE capture_flags (
          id TEXT PRIMARY KEY,
          capture_id TEXT NOT NULL REFERENCES captures_new(id) ON DELETE CASCADE,
          is_open_loop INTEGER NOT NULL DEFAULT 0
        );

        INSERT INTO capture_flags SELECT * FROM capture_flags_backup;
        DROP TABLE capture_flags_backup;

        CREATE TEMP TABLE transcriptions_backup AS SELECT * FROM transcriptions;
        DROP TABLE transcriptions;

        CREATE TABLE transcriptions (
          id TEXT PRIMARY KEY,
          capture_id TEXT NOT NULL REFERENCES captures_new(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'done', 'error')),
          text TEXT,
          error_message TEXT,
          provider TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        INSERT INTO transcriptions SELECT * FROM transcriptions_backup;
        DROP TABLE transcriptions_backup;

        -- Drop old captures table
        DROP TABLE captures;

        -- Rename new table
        ALTER TABLE captures_new RENAME TO captures;

        -- Recreate indexes
        CREATE INDEX IF NOT EXISTS idx_captures_project ON captures(project_id);
        CREATE INDEX IF NOT EXISTS idx_captures_task ON captures(linked_task_id);
        CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at DESC);

        -- Update job_queue to include text-title-generation
        CREATE TABLE job_queue_new (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK(type IN ('transcription', 'summary', 'image-description', 'text-title-generation')),
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

        INSERT INTO job_queue_new (id, type, status, payload, result, error_message, provider, model, metadata, created_at, updated_at)
        SELECT id, type, status, payload, result, error_message, provider, model, metadata, created_at, updated_at FROM job_queue;
        DROP TABLE job_queue;
        ALTER TABLE job_queue_new RENAME TO job_queue;

        CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status, type);

        COMMIT;
      `)

      console.log('[Migration] Completed: make-title-nullable-and-add-text-title-job')
    }
  },
  {
    version: 5,
    name: 'add-chat-and-decision-capture-types',
    up: (db) => {
      console.log('[Migration] Running: add-chat-and-decision-capture-types')

      db.exec(`
        BEGIN TRANSACTION;

        -- Recreate captures table with chat and decision types
        CREATE TABLE captures_new (
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

        -- Copy existing data
        INSERT INTO captures_new SELECT * FROM captures;

        -- Backup and recreate dependent tables
        CREATE TEMP TABLE capture_flags_backup AS SELECT * FROM capture_flags;
        DROP TABLE capture_flags;

        CREATE TABLE capture_flags (
          id TEXT PRIMARY KEY,
          capture_id TEXT NOT NULL REFERENCES captures_new(id) ON DELETE CASCADE,
          is_open_loop INTEGER NOT NULL DEFAULT 0
        );

        INSERT INTO capture_flags SELECT * FROM capture_flags_backup;
        DROP TABLE capture_flags_backup;

        CREATE TEMP TABLE transcriptions_backup AS SELECT * FROM transcriptions;
        DROP TABLE transcriptions;

        CREATE TABLE transcriptions (
          id TEXT PRIMARY KEY,
          capture_id TEXT NOT NULL REFERENCES captures_new(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'done', 'error')),
          text TEXT,
          error_message TEXT,
          provider TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        INSERT INTO transcriptions SELECT * FROM transcriptions_backup;
        DROP TABLE transcriptions_backup;

        -- Drop old captures table
        DROP TABLE captures;

        -- Rename new table
        ALTER TABLE captures_new RENAME TO captures;

        -- Recreate indexes
        CREATE INDEX IF NOT EXISTS idx_captures_project ON captures(project_id);
        CREATE INDEX IF NOT EXISTS idx_captures_task ON captures(linked_task_id);
        CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at DESC);

        COMMIT;
      `)

      console.log('[Migration] Completed: add-chat-and-decision-capture-types')
    }
  },
  {
    version: 6,
    name: 'add-task-and-decision-extraction-job-types',
    up: (db) => {
      console.log('[Migration] Running: add-task-and-decision-extraction-job-types')

      db.exec(`
        BEGIN TRANSACTION;

        -- Recreate job_queue with new job types
        CREATE TABLE job_queue_new (
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

        INSERT INTO job_queue_new (id, type, status, payload, result, error_message, provider, model, metadata, created_at, updated_at)
        SELECT id, type, status, payload, result, error_message, provider, model, metadata, created_at, updated_at FROM job_queue;

        DROP TABLE job_queue;
        ALTER TABLE job_queue_new RENAME TO job_queue;

        CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status, type);

        COMMIT;
      `)

      console.log('[Migration] Completed: add-task-and-decision-extraction-job-types')
    }
  }
]

export function getCurrentVersion(db: Database.Database): number {
  // Check if schema_version table exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='schema_version'
  `).get()

  if (!tableExists) {
    // Create schema_version table
    db.exec(`
      CREATE TABLE schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `)
    return 0
  }

  // Get current version
  const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number | null }
  return row.version ?? 0
}

export function runMigrations(db: Database.Database): void {
  const currentVersion = getCurrentVersion(db)
  const pendingMigrations = migrations.filter(m => m.version > currentVersion)

  if (pendingMigrations.length === 0) {
    console.log('[Migrations] Database is up to date (version', currentVersion, ')')
    return
  }

  console.log(`[Migrations] Running ${pendingMigrations.length} pending migration(s)...`)

  for (const migration of pendingMigrations) {
    console.log(`[Migrations] Applying migration ${migration.version}: ${migration.name}`)

    try {
      migration.up(db)

      // Record migration
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version)

      console.log(`[Migrations] Successfully applied migration ${migration.version}`)
    } catch (error) {
      console.error(`[Migrations] Failed to apply migration ${migration.version}:`, error)
      throw error
    }
  }

  console.log('[Migrations] All migrations completed successfully')
}

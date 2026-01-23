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

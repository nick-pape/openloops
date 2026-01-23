import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { Repository } from './repository'

describe('Repository', () => {
  let db: ReturnType<typeof drizzle>
  let sqlite: Database.Database
  let repository: Repository

  beforeEach(() => {
    // Create in-memory database for testing
    sqlite = new Database(':memory:')
    db = drizzle(sqlite, { schema })

    // Run migrations
    sqlite.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN ('text', 'image', 'audio')),
        title TEXT NOT NULL,
        body_text TEXT,
        file_path TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE capture_flags (
        id TEXT PRIMARY KEY,
        capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
        is_open_loop INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE tasks (
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
    `)

    // Mock getDatabase to return our test db
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('./database').getDatabase = () => db

    repository = new Repository()
  })

  afterEach(() => {
    sqlite.close()
  })

  describe('Projects', () => {
    it('should create a project', async () => {
      const project = await repository.createProject({ name: 'Test Project' })

      expect(project).toBeDefined()
      expect(project.name).toBe('Test Project')
      expect(project.id).toBeDefined()
    })

    it('should get all projects', async () => {
      await repository.createProject({ name: 'Project 1' })
      await repository.createProject({ name: 'Project 2' })

      const projects = await repository.getAllProjects()

      expect(projects.length).toBe(2)
    })

    it('should update a project', async () => {
      const project = await repository.createProject({ name: 'Old Name' })
      const updated = await repository.updateProject(project.id, 'New Name')

      expect(updated?.name).toBe('New Name')
    })

    it('should delete a project', async () => {
      const project = await repository.createProject({ name: 'To Delete' })
      await repository.deleteProject(project.id)

      const projects = await repository.getAllProjects()
      expect(projects.length).toBe(0)
    })
  })

  describe('Captures', () => {
    it('should create a text capture', async () => {
      const project = await repository.createProject({ name: 'Test Project' })

      const capture = await repository.createCapture({
        projectId: project.id,
        type: 'text',
        title: 'Test Capture',
        bodyText: 'This is a test'
      })

      expect(capture).toBeDefined()
      expect(capture.title).toBe('Test Capture')
      expect(capture.type).toBe('text')
    })

    it('should get captures by project', async () => {
      const project = await repository.createProject({ name: 'Test Project' })

      await repository.createCapture({
        projectId: project.id,
        type: 'text',
        title: 'Capture 1'
      })

      await repository.createCapture({
        projectId: project.id,
        type: 'text',
        title: 'Capture 2'
      })

      const captures = await repository.getCapturesByProject(project.id)

      expect(captures.length).toBe(2)
    })
  })

  describe('Tasks', () => {
    it('should create a task', async () => {
      const task = await repository.createTask({
        title: 'Test Task',
        priority: 5,
        estimateMinutes: 60
      })

      expect(task).toBeDefined()
      expect(task.title).toBe('Test Task')
      expect(task.priority).toBe(5)
    })

    it('should get open tasks', async () => {
      await repository.createTask({ title: 'Task 1' })
      await repository.createTask({ title: 'Task 2' })

      const task3 = await repository.createTask({ title: 'Task 3' })
      await repository.updateTask(task3.id, { status: 'done' })

      const openTasks = await repository.getOpenTasks()

      expect(openTasks.length).toBe(2)
    })

    it('should update a task', async () => {
      const task = await repository.createTask({ title: 'Original' })
      const updated = await repository.updateTask(task.id, {
        title: 'Updated',
        priority: 5
      })

      expect(updated?.title).toBe('Updated')
      expect(updated?.priority).toBe(5)
    })
  })
})

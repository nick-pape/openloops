# Open Loops MCP Architecture Specification

**Status:** Draft
**Version:** 1.0
**Last Updated:** 2026-01-25

---

## Table of Contents

1. [North Star Vision](#north-star-vision)
2. [Current State Analysis](#current-state-analysis)
3. [Target Architecture](#target-architecture)
4. [Implementation Phases](#implementation-phases)
5. [Technical Design](#technical-design)
6. [Migration Strategy](#migration-strategy)

---

## North Star Vision

**Open Loops is an AI-powered app where "agentic behavior" is a means, not the product.**

The durable platform consists of:

1. **MCP server** that exposes app capabilities as composable "product primitives"
2. **In-app chat** that is just another MCP client (like Claude Desktop, Goose, etc.)
3. **Single capability surface** that powers both internal UX and external integrations

This architecture yields "AI-powered app for free" - one capability boundary serves all AI interactions.

---

## Current State Analysis

### Existing Architecture (Pre-MCP)

```
┌─────────────────────────────────────────────────────┐
│                    Renderer                         │
│  ┌──────────────┐         ┌─────────────────────┐  │
│  │  ProjectView │         │ ElectronChatRuntime │  │
│  │  TasksView   │ ◄────── │    (direct IPC)     │  │
│  │  PlannerView │         └─────────────────────┘  │
│  └──────────────┘                                   │
└─────────────────────────────────────────────────────┘
                    │ IPC                     │ IPC
                    ▼                         ▼
┌────────────────────────────────────────────────────┐
│                 Main Process                       │
│  ┌──────────────────┐        ┌─────────────────┐  │
│  │  IPC Handlers    │        │  Chat Handler   │  │
│  │  (projects:*)    │        │  (chat:send)    │  │
│  │  (tasks:*)       │        │                 │  │
│  │  (captures:*)    │        │                 │  │
│  └────────┬─────────┘        └────────┬────────┘  │
│           │                           │            │
│           └─────────┬─────────────────┘            │
│                     ▼                              │
│            ┌─────────────────┐                     │
│            │   repository    │                     │
│            │  (direct DB)    │                     │
│            └─────────────────┘                     │
│                     │                              │
│                     ▼                              │
│                  SQLite                            │
└────────────────────────────────────────────────────┘
```

### Problems with Current Architecture

1. ❌ **Dual APIs**: UI uses IPC handlers, chat uses separate chat API
2. ❌ **No events**: UI doesn't get notified when agent makes changes
3. ❌ **Direct DB access**: No command layer, no audit trail
4. ❌ **Can't use external agents**: No MCP server for Claude Desktop, etc.
5. ❌ **Inconsistent mutations**: Chat bypasses normal update paths

---

## Target Architecture

### MCP-First Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                         Renderer                              │
│  ┌──────────────┐         ┌─────────────────────────────┐    │
│  │  ProjectView │         │  Chat Pane                  │    │
│  │  TasksView   │         │  (MCP Client - Internal)    │    │
│  │  PlannerView │         └─────────────────────────────┘    │
│  └──────────────┘                      │                      │
│         │                              │ IPC                  │
│         │ IPC                          ▼                      │
│         │              ┌─────────────────────────────┐        │
│         └──────────────► Event Subscriptions         │        │
│                        │ (state change notifications)│        │
└────────────────────────┴─────────────────────────────┴────────┘
                                        ▲
                    Events broadcast    │
                                        │
┌───────────────────────────────────────┼───────────────────────┐
│                 Main Process          │                       │
│                                       │                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              MCP Server                                 │ │
│  │  ┌──────────────────────┐   ┌──────────────────────┐   │ │
│  │  │  Stdio Transport     │   │  HTTP Transport      │   │ │
│  │  │  (in-app chat)       │   │  (Claude Desktop,    │   │ │
│  │  │                      │   │   Goose, etc.)       │   │ │
│  │  └──────────┬───────────┘   └──────────┬───────────┘   │ │
│  │             │                           │               │ │
│  │             └───────────┬───────────────┘               │ │
│  │                         ▼                               │ │
│  │              ┌─────────────────────┐                    │ │
│  │              │   Tool Registry     │                    │ │
│  │              │  - projects_*       │                    │ │
│  │              │  - captures_*       │                    │ │
│  │              │  - tasks_*          │                    │ │
│  │              └──────────┬──────────┘                    │ │
│  └─────────────────────────┼───────────────────────────────┘ │
│                            │                                 │
│                            ▼                                 │
│              ┌──────────────────────────┐                    │
│              │  Domain Command Layer    │                    │
│              │  - ProjectCommands       │                    │
│              │  - CaptureCommands       │                    │
│              │  - TaskCommands          │                    │
│              │  (wraps repository)      │                    │
│              └──────────┬───────────────┘                    │
│                         │                                    │
│                         ▼                                    │
│              ┌──────────────────────────┐                    │
│              │      repository          │                    │
│              │    (DB operations)       │                    │
│              └──────────┬───────────────┘                    │
│                         │                                    │
│                         ▼                                    │
│                      SQLite                                  │
│                         │                                    │
│                         │ (after commit)                     │
│                         ▼                                    │
│              ┌──────────────────────────┐                    │
│              │     Event Emitter        │                    │
│              │  - project.created       │                    │
│              │  - capture.created       │                    │
│              │  - task.updated          │                    │
│              └──────────┬───────────────┘                    │
│                         │                                    │
│                         └──────────────────────────────────► │
│                              Broadcast to Renderer           │
└──────────────────────────────────────────────────────────────┘
```

### Key Architectural Invariants

1. ✅ **Single mutation pipeline**: All state changes flow through Domain Commands → Repository → DB → Events
2. ✅ **MCP is the boundary**: Both internal chat and external agents use MCP tools
3. ✅ **UI reacts to events**: No special "agent update" paths - same mechanism for all changes
4. ✅ **No direct UI updates**: Tool handlers never touch UI state directly
5. ✅ **Audit everything**: All tool invocations logged with context

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal:** Establish event-driven architecture without breaking existing functionality

**Deliverables:**
1. Event emitter system (`src/main/events/emitter.ts`)
2. Domain command layer (`src/main/domain/commands.ts`)
3. Migrate existing IPC handlers to use commands
4. Renderer subscribes to events for reactive updates

**Success Criteria:**
- All existing UI functionality works unchanged
- Events fire for all state mutations
- No regression in user experience

### Phase 2: MCP Server Core (Week 2)

**Goal:** Build MCP server with stdio transport for internal use

**Deliverables:**
1. Install `@modelcontextprotocol/sdk` and `zod`
2. Create MCP server (`src/main/mcp/server.ts`)
3. Implement tool registry with projects/captures/tasks tools
4. Stdio transport for in-process communication
5. Permission system

**Success Criteria:**
- MCP server starts on app launch
- Tools can be invoked via stdio
- Tool execution creates proper events
- Audit log captures all invocations

### Phase 3: Internal Chat Migration (Week 2-3)

**Goal:** Refactor in-app chat to use MCP client instead of direct IPC

**Deliverables:**
1. Create MCP client wrapper (`src/renderer/chat/MCPChatClient.ts`)
2. Replace `ElectronChatRuntime` to use MCP client
3. Update chat handler to use agent runtime (future: replace with real agent framework)
4. UI subscribes to events for tool execution feedback

**Success Criteria:**
- Chat works identically to before
- Chat-initiated changes trigger UI updates via events
- Tool execution visible in chat UI

### Phase 4: External Transport (Week 3)

**Goal:** Enable external agents (Claude Desktop, Goose) to use Open Loops

**Deliverables:**
1. HTTP transport for MCP server
2. CORS configuration
3. Settings UI for enabling/configuring HTTP transport
4. Documentation for connecting Claude Desktop

**Success Criteria:**
- Claude Desktop can connect to Open Loops MCP server
- External agents can list projects, create tasks, etc.
- Permission system prevents unauthorized actions
- Audit log shows external vs internal sources

### Phase 5: Advanced Features (Week 4+)

**Goal:** Polish and production-ready features

**Deliverables:**
1. Streaming support for tool progress
2. MCP resources (for exposing app state)
3. MCP prompts (for common workflows)
4. Token-based authentication for HTTP transport
5. Advanced permission policies

---

## Technical Design

### 1. Event Emitter System

**File:** `src/main/events/emitter.ts`

```typescript
import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'

export type DomainEvent =
  | { type: 'project.created'; projectId: string; name: string }
  | { type: 'project.updated'; projectId: string; name: string }
  | { type: 'project.deleted'; projectId: string }
  | { type: 'capture.created'; captureId: string; projectId: string; type: string }
  | { type: 'capture.updated'; captureId: string }
  | { type: 'capture.deleted'; captureId: string }
  | { type: 'task.created'; taskId: string; projectId?: string }
  | { type: 'task.updated'; taskId: string; status?: string }
  | { type: 'task.deleted'; taskId: string }
  | { type: 'summary.generated'; projectId: string; summaryId: string }

class DomainEventEmitter extends EventEmitter {
  private mainWindow: BrowserWindow | null = null

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  emitDomainEvent(event: DomainEvent) {
    // Emit for internal listeners
    this.emit('domain-event', event)

    // Broadcast to renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('domain-event', event)
    }

    // Log for audit
    console.log('[Domain Event]', event.type, event)
  }
}

export const domainEvents = new DomainEventEmitter()
```

### 2. Domain Command Layer

**File:** `src/main/domain/commands.ts`

```typescript
import { repository } from '../db/repository'
import { domainEvents } from '../events/emitter'
import type { CreateProjectInput, CreateCaptureInput, CreateTaskInput, UpdateTaskInput } from '../db/repository'

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

  // Read operations don't emit events
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
      projectId: capture.projectId || 'none',
      type: capture.type
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
    await repository.deleteCapture(id)
    domainEvents.emitDomainEvent({
      type: 'capture.deleted',
      captureId: id
    })
  }

  // Read operations
  async getCapture(id: string) {
    return repository.getCapture(id)
  }

  async searchCaptures(projectId: string, type?: string) {
    const captures = await repository.getCapturesWithFlags(projectId)
    if (type) {
      return captures.filter(c => c.type === type)
    }
    return captures
  }
}

export class TaskCommands {
  async createTask(input: CreateTaskInput) {
    const task = await repository.createTask(input)
    domainEvents.emitDomainEvent({
      type: 'task.created',
      taskId: task.id,
      projectId: task.projectId || undefined
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

  // Read operations
  async getTask(id: string) {
    return repository.getTask(id)
  }

  async listTasks(projectId?: string, status?: 'open' | 'done') {
    if (status === 'open') {
      return repository.getOpenTasks(projectId)
    }
    return repository.getAllTasks(projectId)
  }
}

// Export singleton instances
export const projectCommands = new ProjectCommands()
export const captureCommands = new CaptureCommands()
export const taskCommands = new TaskCommands()
```

### 3. MCP Tool Registry

**File:** `src/main/mcp/tools/index.ts`

```typescript
import { z } from 'zod'
import { projectCommands, captureCommands, taskCommands } from '../../domain/commands'

// Projects tools
export const projectsListTool = {
  name: 'projects_list',
  description: 'List all projects in Open Loops',
  inputSchema: z.object({})
}

export async function projectsList() {
  const projects = await projectCommands.listProjects()
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(projects, null, 2)
    }]
  }
}

export const projectsGetTool = {
  name: 'projects_get',
  description: 'Get a specific project by ID',
  inputSchema: z.object({
    projectId: z.string().uuid()
  })
}

export async function projectsGet(args: z.infer<typeof projectsGetTool.inputSchema>) {
  const project = await projectCommands.getProject(args.projectId)
  if (!project) {
    throw new Error(`Project ${args.projectId} not found`)
  }
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(project, null, 2)
    }]
  }
}

export const projectsCreateTool = {
  name: 'projects_create',
  description: 'Create a new project',
  inputSchema: z.object({
    name: z.string().min(1, 'Project name is required')
  })
}

export async function projectsCreate(args: z.infer<typeof projectsCreateTool.inputSchema>) {
  const project = await projectCommands.createProject({ name: args.name })
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(project, null, 2)
    }]
  }
}

// Captures tools
export const capturesSearchTool = {
  name: 'captures_search',
  description: 'Search captures in a project, optionally filter by type',
  inputSchema: z.object({
    projectId: z.string().uuid(),
    type: z.enum(['text', 'image', 'audio', 'chat', 'decision']).optional()
  })
}

export async function capturesSearch(args: z.infer<typeof capturesSearchTool.inputSchema>) {
  const captures = await captureCommands.searchCaptures(args.projectId, args.type)
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(captures, null, 2)
    }]
  }
}

export const capturesGetTool = {
  name: 'captures_get',
  description: 'Get a specific capture by ID with full content',
  inputSchema: z.object({
    captureId: z.string().uuid()
  })
}

export async function capturesGet(args: z.infer<typeof capturesGetTool.inputSchema>) {
  const capture = await captureCommands.getCapture(args.captureId)
  if (!capture) {
    throw new Error(`Capture ${args.captureId} not found`)
  }
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(capture, null, 2)
    }]
  }
}

export const capturesCreateTextTool = {
  name: 'captures_create_text',
  description: 'Create a text capture for a project',
  inputSchema: z.object({
    projectId: z.string().uuid(),
    title: z.string().optional(),
    bodyText: z.string().min(1, 'Body text is required')
  })
}

export async function capturesCreateText(args: z.infer<typeof capturesCreateTextTool.inputSchema>) {
  const capture = await captureCommands.createCapture({
    projectId: args.projectId,
    type: 'text',
    title: args.title || null,
    bodyText: args.bodyText
  })
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(capture, null, 2)
    }]
  }
}

// Tasks tools
export const tasksListTool = {
  name: 'tasks_list',
  description: 'List tasks, optionally filter by project and status',
  inputSchema: z.object({
    projectId: z.string().uuid().optional(),
    status: z.enum(['open', 'done']).optional()
  })
}

export async function tasksList(args: z.infer<typeof tasksListTool.inputSchema>) {
  const tasks = await taskCommands.listTasks(args.projectId, args.status)
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(tasks, null, 2)
    }]
  }
}

export const tasksCreateTool = {
  name: 'tasks_create',
  description: 'Create a new task',
  inputSchema: z.object({
    projectId: z.string().uuid().optional(),
    title: z.string().min(1, 'Task title is required'),
    notes: z.string().optional(),
    priority: z.number().int().min(1).max(5).optional(),
    estimateMinutes: z.number().int().positive().optional()
  })
}

export async function tasksCreate(args: z.infer<typeof tasksCreateTool.inputSchema>) {
  const task = await taskCommands.createTask({
    projectId: args.projectId,
    title: args.title,
    notes: args.notes,
    priority: args.priority,
    estimateMinutes: args.estimateMinutes
  })
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(task, null, 2)
    }]
  }
}

export const tasksUpdateTool = {
  name: 'tasks_update',
  description: 'Update a task',
  inputSchema: z.object({
    taskId: z.string().uuid(),
    title: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(['open', 'done']).optional(),
    priority: z.number().int().min(1).max(5).optional(),
    estimateMinutes: z.number().int().positive().optional()
  })
}

export async function tasksUpdate(args: z.infer<typeof tasksUpdateTool.inputSchema>) {
  const { taskId, ...updates } = args
  const task = await taskCommands.updateTask(taskId, updates)
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(task, null, 2)
    }]
  }
}

// Tool registry for MCP server
export const allTools = [
  // Projects
  { definition: projectsListTool, handler: projectsList },
  { definition: projectsGetTool, handler: projectsGet },
  { definition: projectsCreateTool, handler: projectsCreate },

  // Captures
  { definition: capturesSearchTool, handler: capturesSearch },
  { definition: capturesGetTool, handler: capturesGet },
  { definition: capturesCreateTextTool, handler: capturesCreateText },

  // Tasks
  { definition: tasksListTool, handler: tasksList },
  { definition: tasksCreateTool, handler: tasksCreate },
  { definition: tasksUpdateTool, handler: tasksUpdate }
]
```

### 4. MCP Server

**File:** `src/main/mcp/server.ts`

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { allTools } from './tools/index.js'

export function createMCPServer() {
  const server = new Server(
    {
      name: 'open-loops',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  )

  // Register all tools
  for (const { definition, handler } of allTools) {
    server.setRequestHandler('tools/call', async (request) => {
      if (request.params.name === definition.name) {
        try {
          // Validate input with Zod
          const args = definition.inputSchema.parse(request.params.arguments || {})

          // Execute tool handler
          const result = await handler(args)

          return result
        } catch (error) {
          console.error(`[MCP] Tool ${definition.name} error:`, error)
          throw error
        }
      }
    })
  }

  // List available tools
  server.setRequestHandler('tools/list', async () => {
    return {
      tools: allTools.map(({ definition }) => ({
        name: definition.name,
        description: definition.description,
        inputSchema: definition.inputSchema
      }))
    }
  })

  return server
}

export async function startStdioServer() {
  const server = createMCPServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.log('[MCP] Stdio server started')
  return server
}
```

### 5. Renderer Event Subscription

**File:** `src/renderer/hooks/useDomainEvents.ts`

```typescript
import { useEffect } from 'react'

export type DomainEvent =
  | { type: 'project.created'; projectId: string; name: string }
  | { type: 'project.updated'; projectId: string; name: string }
  | { type: 'project.deleted'; projectId: string }
  | { type: 'capture.created'; captureId: string; projectId: string; type: string }
  | { type: 'capture.updated'; captureId: string }
  | { type: 'capture.deleted'; captureId: string }
  | { type: 'task.created'; taskId: string; projectId?: string }
  | { type: 'task.updated'; taskId: string; status?: string }
  | { type: 'task.deleted'; taskId: string }

export function useDomainEvents(handler: (event: DomainEvent) => void) {
  useEffect(() => {
    const listener = (_event: any, domainEvent: DomainEvent) => {
      handler(domainEvent)
    }

    // Subscribe to domain events from main process
    window.electron.events.subscribe(listener)

    return () => {
      window.electron.events.unsubscribe(listener)
    }
  }, [handler])
}
```

---

## Migration Strategy

### Step 1: Add Event System (Non-Breaking)

1. Create `events/emitter.ts`
2. Create `domain/commands.ts`
3. Update existing IPC handlers to use commands (they still work the same)
4. Add preload API for event subscription
5. Update views to subscribe to events (they still fetch data normally)

**Goal:** Existing functionality unchanged, but foundation is in place

### Step 2: Build MCP Server (Parallel Track)

1. Install MCP SDK dependencies
2. Create MCP server with tool registry
3. Start stdio transport on app launch
4. Test with MCP inspector CLI tool

**Goal:** MCP server works alongside existing APIs

### Step 3: Migrate Chat to MCP (Careful Cutover)

1. Create MCP client wrapper for renderer
2. Update chat IPC handler to spawn MCP client
3. Replace direct repository calls with MCP tool calls
4. Test extensively

**Goal:** Chat uses MCP internally, works identically

### Step 4: Add HTTP Transport (Additive)

1. Create HTTP transport (disabled by default)
2. Add settings toggle to enable HTTP server
3. Document Claude Desktop integration

**Goal:** External agents can opt-in to using Open Loops

### Step 5: Deprecate Old APIs (Cleanup)

1. Remove unused IPC handlers
2. Consolidate all mutations through domain commands
3. Clean up direct repository imports in main process

**Goal:** Single mutation pipeline, fully event-driven

---

## Success Metrics

### Phase 1 (Foundation)
- [ ] All UI operations trigger domain events
- [ ] No regression in app performance or UX
- [ ] Event log shows all mutations

### Phase 2 (MCP Server)
- [ ] MCP server starts without errors
- [ ] All tools callable via stdio transport
- [ ] Tool execution creates proper domain events
- [ ] Audit log captures tool invocations

### Phase 3 (Chat Migration)
- [ ] In-app chat works identically to before
- [ ] Chat-initiated task creation shows up in task list immediately
- [ ] Tool execution visible in chat UI
- [ ] No "stale UI" bugs

### Phase 4 (External Transport)
- [ ] Claude Desktop can connect and list projects
- [ ] External agent can create task, task appears in UI
- [ ] Permission system blocks unauthorized operations
- [ ] Audit log shows source (internal vs external)

### Phase 5 (Production Ready)
- [ ] Comprehensive documentation
- [ ] Example MCP prompts for common workflows
- [ ] Token authentication for HTTP transport
- [ ] Performance benchmarks (tool latency < 100ms)

---

## Open Questions

1. **Agent Framework**: Once MCP is in place, which agent framework should we use for the internal chat? (Needs to support custom MCP servers)

2. **Streaming**: How should we handle streaming tool progress for long-running operations like summary generation?

3. **Permissions**: Should we have different permission profiles (e.g., "external-readonly", "internal-full-access")?

4. **State Sync**: Should we add MCP resources to expose live app state (current project, selections, etc.) for external agents?

5. **Rate Limiting**: Do we need rate limiting for the HTTP transport to prevent abuse?

---

## References

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Specification](https://modelcontextprotocol.io/docs/specification)
- [MCP Server Development Guide](https://github.com/cyanheads/model-context-protocol-resources/blob/main/guides/mcp-server-development-guide.md)

---

**Next Steps:** Review this spec, discuss open questions, then begin Phase 1 implementation.

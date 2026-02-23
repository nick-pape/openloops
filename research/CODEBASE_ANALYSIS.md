## File Locations for Projects, Captures, and Summaries

### Implementation Files

#### Domain Commands
- `src/main/domain/commands.ts` - Domain commands with event emission after mutations
  - `ProjectCommands.createProject()` - Creates projects, emits `project.created` event
  - `CaptureCommands.createCapture()` - Creates captures, emits `capture.created` event with `projectId`
  - `CaptureCommands.updateCapture()` - Updates captures, emits `capture.updated` event
  - `SummaryCommands.createSummary()` - Creates summaries, emits `summary.generated` event

#### Event System
- `src/main/events/emitter.ts` - Domain event emitter
  - Emits events to internal listeners and renderer
  - Event types: `project.created`, `project.updated`, `project.deleted`, `capture.created`, `capture.updated`, `capture.deleted`, `summary.generated`, `task.* events

#### Database Repository
- `src/main/db/repository.ts` - Database operations
  - `createCapture()` - Stores captures with `projectId` or `linkedTaskId`
  - `getCapturesByProject()` - Retrieves all captures for a project
  - `getCapturesWithFlags()` - Gets captures including task-linked ones for a project
  - `createProjectSummary()` - Stores project summaries
  - `getLatestProjectSummary()` - Retrieves most recent summary for a project

#### Main Process (IPC Handlers)
- `src/main/main.ts` - IPC handlers and event subscriptions
  - `setupIPC()` - Registers IPC handlers for CRUD operations
  - Domain event listener on line 169 handles `capture.created` events
  - Currently only triggers tag generation for text/decision captures

#### Job System
- `src/main/workers/job-manager.ts` - Background job processing
  - `enqueueSummary()` - Queues summary generation jobs
  - Domain event emission after job completion (lines 184-232)
  - Automatically enqueues tag generation after image description completes (lines 208-219)
- `src/main/workers/job-worker.ts` - Job worker implementation
  - `handleSummary()` - Generates summary using LLM
  - Stores summary in database via `project_summaries` table

#### Database Schema
- `src/main/db/schema.ts` - Database schema definitions
  - `captures` table: has `projectId` (optional) and `linkedTaskId` (optional)
  - `projectSummaries` table: stores summary markdown, provider, and time window
  - Relationship: captures are linked to projects directly OR via tasks

### Test Files
- `src/main/planning/day-planner.test.ts` - Tests for day planner

### Related Directories
- `src/main/` - Contains 50+ files including domain, events, db, workers

### Entry Points
- `src/main/main.ts` - Main Electron entry point
  - Sets up domain event listeners
  - Subscribes to `capture.created` events for tag generation
  - No current subscription for triggering summary updates

## Current Automation Patterns

### Existing Automation
1. **Tag Generation** (lines 170-183 in main.ts)
   - Listens to `capture.created` events
   - Only for text/decision captures
   - Enqueues tag generation job

2. **Tag Regeneration** (lines 413-421 in main.ts)
   - On capture update via IPC
   - Enqueues tag generation job

3. **Auto-tag after Image Description** (lines 208-219 in job-manager.ts)
   - After image description job completes
   - Enqueues tag generation using the description text

### No Current Summary Automation
- No domain event listener triggers summary regeneration when captures are added/updated
- Summaries are currently only generated via manual IPC calls:
  - `summaries:generate` handler (line 629 in main.ts)
  - `chat:updateSummary` handler (line 1063 in main.ts)

## Where to Add Summary Automation

Based on the existing patterns, the best place to add automatic summary updates would be:

1. **In `src/main/main.ts`** - Add a domain event listener for:
   - `capture.created` events where `event.projectId` exists
   - `capture.updated` events where the capture belongs to a project

2. **Use the `jobManager.enqueueSummary()` method** to queue summary jobs

3. **Coordinate with job-manager.ts** to emit `summary.generated` events after completion

The codebase already has:
- Events emitting after mutations
- Job queue system for background processing
- LLM integration for summary generation
- Pattern for triggering related jobs (tag generation after image description)

## Key Relationships

1. **Projects ← Captures** (one-to-many via `projectId`)
2. **Projects ← Tasks** (one-to-many via `projectId`)
3. **Tasks ← Captures** (one-to-many via `linkedTaskId`)
4. **Projects ← Summaries** (one-to-many via `projectId`)

When a capture is created/updated:
- Find its `projectId` (either directly or via linked task)
- Trigger summary regeneration for that project
- Use existing `enqueueSummary()` method


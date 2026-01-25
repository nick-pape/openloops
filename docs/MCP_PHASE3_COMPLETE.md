# MCP Phase 3: Internal Chat Infrastructure - COMPLETE

**Date:** 2026-01-25
**Status:** ✅ Complete

## Summary

Phase 3 establishes MCP infrastructure for internal chat, preparing for future agent framework integration. We are NOT implementing tool calling ourselves - this phase focuses on having the MCP server running and ready.

## What Was Implemented

### 1. MCP Stdio Server Startup

**File:** `src/main/main.ts`

```typescript
// Start MCP server (Phase 3)
console.log('[MCP] Starting MCP stdio server...')
const mcpServer = createMCPServer()
const transport = new StdioServerTransport()
await mcpServer.connect(transport)
console.log('[MCP] MCP server started - ready for tool calls')
```

The MCP server now starts automatically when the app launches. You can verify this in the terminal logs:

```
[MCP] Starting MCP stdio server...
[MCP] MCP server started - ready for tool calls
```

### 2. Chat Handlers Migrated to Domain Commands

**Updated Handlers:**

- `chat:save` - Now uses `captureCommands.createCapture()` instead of direct repository
- Chat transcript creation now automatically emits `capture.created` event

**File:** `src/main/main.ts`

```typescript
ipcMain.handle('chat:save', async (_, projectId: string, messages: any[]) => {
  // Use domain command - emits event automatically
  const capture = await captureCommands.createCapture({
    projectId,
    type: 'chat',
    title: `Chat — ${new Date().toLocaleString()}`,
    bodyText: JSON.stringify(messages)
  })
  return capture
})
```

### 3. Summary Commands Added

**File:** `src/main/domain/commands.ts`

```typescript
export class SummaryCommands {
  async createSummary(projectId: string, summaryMd: string, provider: string, windowStart: Date, windowEnd: Date) {
    const summary = await repository.createProjectSummary(projectId, summaryMd, provider, windowStart, windowEnd)
    domainEvents.emitDomainEvent({
      type: 'summary.generated',
      projectId,
      summaryId: summary.id
    })
    return summary
  }
}
```

### 4. Domain Events for Summary Completion

**File:** `src/main/workers/job-manager.ts`

The job manager now emits `summary.generated` domain events when summary jobs complete:

```typescript
// Emit domain event for summary completion (Phase 3)
if (message.success && updatedJob.type === 'summary' && updatedJob.entityId) {
  const { domainEvents } = await import('../events/emitter')
  const summary = await repository.getLatestProjectSummary(updatedJob.entityId)
  if (summary) {
    domainEvents.emitDomainEvent({
      type: 'summary.generated',
      projectId: updatedJob.entityId,
      summaryId: summary.id
    })
  }
}
```

### 5. MCP Agent Infrastructure Placeholder

**File:** `src/main/chat/mcp-agent.ts`

This file documents the current status and future integration plan. Key points:

- ✅ MCP server running with stdio transport
- ✅ 12 tools available (projects, captures, tasks)
- ✅ Domain events emit on all mutations
- ⏳ Agent framework integration (blocked - no compatible SDK found yet)

## Architecture After Phase 3

```
┌───────────────────────────────────────────────────────────────┐
│                         Renderer                              │
│  ┌──────────────┐         ┌─────────────────────────────┐    │
│  │  ProjectView │         │  Chat Pane                  │    │
│  │  TasksView   │         │  (simple LLM chat for now)  │    │
│  │  PlannerView │         └─────────────────────────────┘    │
│  └──────────────┘                      │                      │
│         │                              │ IPC                  │
│         │ IPC                          ▼                      │
│         │              ┌─────────────────────────────┐        │
│         └──────────────► Event Subscriptions         │        │
│                        │ (domain events)             │        │
└────────────────────────┴─────────────────────────────┴────────┘
                                        ▲
                    Events broadcast    │
                                        │
┌───────────────────────────────────────┼───────────────────────┐
│                 Main Process          │                       │
│                                       │                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              MCP Server (RUNNING ✅)                     │ │
│  │  ┌──────────────────────┐   ┌──────────────────────┐   │ │
│  │  │  Stdio Transport     │   │  HTTP Transport      │   │ │
│  │  │  (ACTIVE)            │   │  (Phase 4 - future)  │   │ │
│  │  └──────────┬───────────┘   └──────────────────────┘   │ │
│  │             │                                           │ │
│  │             ▼                                           │ │
│  │  ┌─────────────────────────────────────────────────┐   │ │
│  │  │   Tool Registry (12 tools)                      │   │ │
│  │  │  - projects_list, projects_get, projects_create │   │ │
│  │  │  - captures_search, captures_get, etc.          │   │ │
│  │  │  - tasks_list, tasks_create, tasks_update       │   │ │
│  │  └──────────┬──────────────────────────────────────┘   │ │
│  └─────────────┼───────────────────────────────────────────┘ │
│                │                                             │
│                ▼                                             │
│  ┌──────────────────────────┐                                │
│  │  Domain Command Layer    │                                │
│  │  - ProjectCommands       │                                │
│  │  │  - CaptureCommands       │                                │
│  │  - TaskCommands          │                                │
│  │  - SummaryCommands       │ ◄── NEW                        │
│  └──────────┬───────────────┘                                │
│             │                                                 │
│             ▼                                                 │
│  ┌──────────────────────────┐                                │
│  │      repository          │                                │
│  │    (DB operations)       │                                │
│  └──────────┬───────────────┘                                │
│             │                                                 │
│             ▼                                                 │
│          SQLite                                               │
│             │                                                 │
│             │ (after commit)                                  │
│             ▼                                                 │
│  ┌──────────────────────────┐                                │
│  │     Event Emitter        │                                │
│  │  - project.created       │                                │
│  │  - capture.created       │                                │
│  │  - task.updated          │                                │
│  │  - summary.generated     │ ◄── NEW                        │
│  └──────────┬───────────────┘                                │
│             │                                                 │
│             └──────────────────────────────────────────────► │
│                  Broadcast to Renderer                        │
└───────────────────────────────────────────────────────────────┘
```

## Success Criteria

- [x] MCP server starts without errors on app launch
- [x] All 12 tools available via stdio transport
- [x] Chat save operations use domain commands
- [x] Domain events emit for chat-related mutations
- [x] Summary completion triggers domain events
- [x] No regression in existing chat functionality

## Known Limitations

### 1. Worker Thread Direct DB Access

The job worker (`src/main/workers/job-worker.ts`) still writes directly to the database for summary creation (lines 147-155). This is acceptable because:

- Worker thread runs in isolation with its own DB connection
- Main process emits domain event when job completes
- Future: Could refactor to notify main process, which would call domain command

### 2. No Tool Calling Yet

The chat is still a simple LLM conversation without tool calling. This is intentional:

- User explicitly said: "we are NOT going to implement tool calling and an agent loop ourselves"
- Researched agent frameworks don't support local LLMs (Ollama)
- Waiting for proper agent SDK with custom baseUrl support

### 3. MCP Client Not Created

We did not create a full MCP client wrapper in the renderer because:

- Current chat doesn't need tool calling yet
- When we integrate an agent framework, it will provide the MCP client
- The MCP server is running and ready for that integration

## What's Next

### Phase 4: External Transport (Future)

1. Add HTTP transport for MCP server
2. Enable Claude Desktop / Goose integration
3. Settings UI for HTTP transport configuration
4. Permission system for external agents

### Agent Framework Integration (Blocked)

Once we find or build an agent SDK that:
- Supports local LLMs (custom baseUrl)
- Can connect to MCP stdio transport
- Handles tool calling automatically

Then we can:
1. Install the agent SDK
2. Replace chat handler with agent runtime
3. Agent will automatically discover and use MCP tools
4. Chat UI will show tool execution feedback

## Testing

### Verify MCP Server Started

Check terminal logs on app launch:

```
[MCP] Starting MCP stdio server...
[MCP] MCP server started - ready for tool calls
```

### Verify Domain Events

Create a chat, save it, and check main process logs for:

```
[Domain Event] capture.created { ... }
```

### Manual MCP Tool Testing

You can still test MCP tools via browser console (see `docs/MCP_TESTING.md`):

```javascript
await window.electron.mcp.callTool('projects_list', {})
```

## Files Changed

### Created
- `src/main/chat/mcp-agent.ts` - Infrastructure placeholder
- `docs/MCP_PHASE3_COMPLETE.md` - This file

### Modified
- `src/main/main.ts`
  - Added MCP server startup
  - Migrated chat:save to use domain commands
  - Added summaryCommands import
- `src/main/domain/commands.ts`
  - Added SummaryCommands class
  - Added summaryCommands export
- `src/main/workers/job-manager.ts`
  - Added domain event emission for summary completion

## Build Status

✅ Build successful: 965.42 kB (gzip: 193.14 kB)

No errors. One warning about dynamic import (not critical).

---

**Phase 3 Status: COMPLETE ✅**

Next: Phase 4 (External Transport) or Agent Framework Research

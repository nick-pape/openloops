# Project Chat Pane - Phase 1 Specification

## Overview
Add a collapsible chat pane to the right side of the Project page using **assistant-ui**. Chat messages are sent to the LLM provider as single-shot requests (no streaming), then displayed all at once. Chat history is stored as JSON and can be explicitly committed to durable project artifacts.

---

## Goals
- Fast, useful project-scoped chat without leaving the app
- Modern UX via assistant-ui library
- Explicit commit actions to create durable artifacts
- Simple architecture (no RAG, no real streaming, no embeddings)

---

## Non-Goals (P1)
- No RAG/semantic retrieval/embeddings
- No context controls (Recent captures, Open Loops, etc.)
- No real token-by-token streaming
- No agent tool calling
- No resizable pane (fixed width)

---

## Architecture Decisions

### 1. UI Library: assistant-ui
- Use `@assistant-ui/react` for chat UI components
- Provides: thread management, message list, composer, markdown rendering
- We'll provide a custom runtime adapter for Electron IPC

### 2. Layout: Fixed Right Pane
- ProjectView gets CSS Grid layout: `[tabs-content | chat-pane]`
- Chat pane: fixed width ~33% (or ~400-480px)
- Collapsible via toggle button in header

### 3. Fake Streaming
- Send message via IPC → main process calls LLM provider
- Wait for complete response
- Return full response to renderer
- assistant-ui displays it instantly (looks like streaming with fast append)

### 4. Storage Format
**Chat Transcripts:**
- `captures.type = 'chat'`
- `captures.bodyText = JSON.stringify(messages)` where messages is:
  ```json
  [
    { "role": "user", "content": "...", "timestamp": "2026-01-24T..." },
    { "role": "assistant", "content": "...", "timestamp": "2026-01-24T..." }
  ]
  ```
- `captures.title` = auto-generated or user-editable (e.g., "Chat — Jan 24, 3:42 PM")

**Decisions:**
- `captures.type = 'decision'`
- `captures.bodyText = markdown` (bullet list)
- `captures.title` = short summary

**Tasks:**
- Reuse existing `tasks` table
- `tasks.notes` can reference source chat capture ID

### 5. Job Queue Strategy
- **Chat responses:** Direct IPC (no job queue) for speed
- **Commit actions:** Use job queue for audit trail
  - Extract tasks → `'task-extraction'` job
  - Extract decisions → `'decision-extraction'` job
  - Update summary → existing `'summary'` job type

---

## Database Schema Changes

### Migration v5: Add Chat and Decision Types

```sql
-- Modify captures table to add 'chat' and 'decision' to type enum
-- (SQLite requires table recreation)

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

-- Copy data, recreate dependent tables, etc.
```

### Migration v6: Add Job Types for Commit Actions

```sql
-- Update job_queue to add 'task-extraction' and 'decision-extraction'
-- (Add to type enum)
```

---

## Implementation Plan

### Step 1: Database Schema (20 mins)
- [ ] Create migration v5: Add `'chat'` and `'decision'` to captures.type enum
- [ ] Create migration v6: Add `'task-extraction'` and `'decision-extraction'` to job_queue.type enum
- [ ] Update `src/main/db/schema.ts` with new types
- [ ] Update TypeScript types in `src/types/index.ts`

### Step 2: Install assistant-ui (5 mins)
```bash
npm install @assistant-ui/react
```

### Step 3: LLM Provider - Add Chat Method (15 mins)
- [ ] Add `chat(messages: ChatMessage[]): Promise<string>` to `LLMProvider` interface
- [ ] Implement in `RemoteLLMProvider` (calls `/chat/completions` with full message history)
- [ ] Implement in `DisabledLLMProvider` (returns error message)

### Step 4: IPC Handlers for Chat (30 mins)
**File: `src/main/main.ts`**

```typescript
// Chat IPC handlers
ipcMain.handle('chat:send', async (_, projectId: string, messages: ChatMessage[]) => {
  const factory = new ProviderFactory()
  const config = await loadLLMConfig() // from settings
  const provider = factory.createLLMProvider(config)

  const response = await provider.chat(messages)

  return {
    role: 'assistant',
    content: response,
    timestamp: new Date().toISOString()
  }
})

ipcMain.handle('chat:save', async (_, projectId: string, messages: ChatMessage[]) => {
  // Create capture with type='chat'
  const capture = await repository.createCapture({
    projectId,
    type: 'chat',
    title: `Chat — ${new Date().toLocaleString()}`,
    bodyText: JSON.stringify(messages)
  })

  broadcastEvent(AppEvents.captureCreated(projectId), capture)
  return capture
})

ipcMain.handle('chat:extractTasks', async (_, projectId: string, messages: ChatMessage[]) => {
  // Enqueue task-extraction job
  const jobId = await jobManager.enqueueTaskExtraction(projectId, messages)
  return jobId
})

ipcMain.handle('chat:extractDecisions', async (_, projectId: string, messages: ChatMessage[]) => {
  // Enqueue decision-extraction job
  const jobId = await jobManager.enqueueDecisionExtraction(projectId, messages)
  return jobId
})

ipcMain.handle('chat:updateSummary', async (_, projectId: string) => {
  // Reuse existing summary generation
  return await summaryService.generateSummary(projectId)
})
```

### Step 5: Preload Bridge (10 mins)
**File: `src/main/preload.ts`**

```typescript
chat: {
  send: (projectId: string, messages: any[]) =>
    ipcRenderer.invoke('chat:send', projectId, messages),
  save: (projectId: string, messages: any[]) =>
    ipcRenderer.invoke('chat:save', projectId, messages),
  extractTasks: (projectId: string, messages: any[]) =>
    ipcRenderer.invoke('chat:extractTasks', projectId, messages),
  extractDecisions: (projectId: string, messages: any[]) =>
    ipcRenderer.invoke('chat:extractDecisions', projectId, messages),
  updateSummary: (projectId: string) =>
    ipcRenderer.invoke('chat:updateSummary', projectId)
}
```

### Step 6: Chat Runtime Adapter (45 mins)
**File: `src/renderer/chat/ElectronChatRuntime.ts`**

Create custom assistant-ui runtime adapter that:
- Wraps Electron IPC calls
- Manages message state
- Handles "fake streaming" (appends full response instantly)
- Provides assistant-ui compatible interface

```typescript
import { AssistantRuntimeCore } from '@assistant-ui/react'

export class ElectronChatRuntime implements AssistantRuntimeCore {
  private projectId: string
  private messages: ChatMessage[] = []

  constructor(projectId: string) {
    this.projectId = projectId
  }

  async append(message: { role: 'user', content: string }) {
    // Add user message
    this.messages.push({
      role: 'user',
      content: message.content,
      timestamp: new Date().toISOString()
    })

    // Send to backend
    const response = await window.electron.chat.send(this.projectId, this.messages)

    // Add assistant response
    this.messages.push(response)

    // Notify subscribers (assistant-ui will re-render)
    this.notifySubscribers()
  }

  // ... implement other AssistantRuntimeCore methods
}
```

### Step 7: Chat Pane Component (60 mins)
**File: `src/renderer/components/ChatPane.tsx`**

```typescript
import { Thread } from '@assistant-ui/react'
import { ElectronChatRuntime } from '../chat/ElectronChatRuntime'

export function ChatPane({ projectId, isCollapsed, onToggle }) {
  const runtime = useMemo(() => new ElectronChatRuntime(projectId), [projectId])

  const handleSave = async () => {
    await window.electron.chat.save(projectId, runtime.messages)
    alert('Chat saved to captures')
  }

  const handleExtractTasks = async () => {
    await window.electron.chat.extractTasks(projectId, runtime.messages)
    alert('Task extraction job enqueued')
  }

  const handleExtractDecisions = async () => {
    await window.electron.chat.extractDecisions(projectId, runtime.messages)
    alert('Decision extraction job enqueued')
  }

  const handleUpdateSummary = async () => {
    await window.electron.chat.updateSummary(projectId)
    alert('Summary regeneration enqueued')
  }

  if (isCollapsed) {
    return (
      <div className="chat-pane collapsed">
        <button onClick={onToggle}>💬</button>
      </div>
    )
  }

  return (
    <div className="chat-pane expanded">
      <div className="chat-header">
        <h2>Chat</h2>
        <div className="chat-actions">
          <select onChange={(e) => handleCommitAction(e.target.value)}>
            <option value="">Commit...</option>
            <option value="save">Save Chat</option>
            <option value="tasks">Extract Tasks</option>
            <option value="decisions">Extract Decisions</option>
            <option value="summary">Update Summary</option>
          </select>
          <button onClick={onToggle}>✕</button>
        </div>
      </div>

      <div className="chat-content">
        <Thread runtime={runtime} />
      </div>
    </div>
  )
}
```

### Step 8: ProjectView Layout Refactor (45 mins)
**File: `src/renderer/views/ProjectView.tsx`**

```typescript
export function ProjectView({ projectId, onDeleteProject }: ProjectViewProps) {
  const [chatCollapsed, setChatCollapsed] = useState(false)

  return (
    <div className="project-view-container">
      <div className="project-main">
        {/* Existing tabs + content */}
      </div>

      <ChatPane
        projectId={projectId}
        isCollapsed={chatCollapsed}
        onToggle={() => setChatCollapsed(!chatCollapsed)}
      />
    </div>
  )
}
```

**File: `src/renderer/views/ProjectView.css`**

```css
.project-view-container {
  display: grid;
  grid-template-columns: 1fr 400px; /* Main content | Chat pane */
  height: 100%;
  gap: 0;
}

.project-view-container.chat-collapsed {
  grid-template-columns: 1fr 50px;
}

.chat-pane {
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

.chat-pane.collapsed {
  width: 50px;
  /* ... */
}

.chat-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}
```

### Step 9: Job Workers for Commit Actions (60 mins)
**File: `src/main/workers/job-worker.ts`**

Add handlers for:
- `'task-extraction'`: Parse chat messages, extract task-like items, create tasks
- `'decision-extraction'`: Parse chat messages, extract decisions, create decision capture

**File: `src/main/workers/job-manager.ts`**

Add methods:
- `enqueueTaskExtraction(projectId, messages)`
- `enqueueDecisionExtraction(projectId, messages)`

### Step 10: Testing & Polish (30 mins)
- [ ] Test chat send/receive flow
- [ ] Test commit actions (save, extract tasks, extract decisions, update summary)
- [ ] Test collapsed/expanded states
- [ ] Test with DisabledLLMProvider (error handling)
- [ ] Test job queue for commit actions
- [ ] Verify chat captures appear in Captures tab

---

## Acceptance Criteria

1. **Chat UI visible**: Right pane with assistant-ui Thread component
2. **Send message**: User types message, gets response from LLM
3. **Message history**: Conversation persists within session (not across app restarts unless saved)
4. **Commit - Save Chat**: Creates `capture(type='chat')` with JSON messages
5. **Commit - Extract Tasks**: Enqueues job, creates tasks linked to project
6. **Commit - Extract Decisions**: Enqueues job, creates `capture(type='decision')`
7. **Commit - Update Summary**: Regenerates project summary
8. **Collapsed state**: Chat pane collapses to icon button, main content expands
9. **No crashes**: DisabledLLMProvider shows friendly error

---

## File Checklist

### New Files
- `src/renderer/chat/ElectronChatRuntime.ts` - Runtime adapter
- `src/renderer/components/ChatPane.tsx` - Chat UI component
- `src/renderer/components/ChatPane.css` - Chat pane styles
- `docs/PROJECT_CHAT_SPEC.md` - This spec

### Modified Files
- `src/main/db/schema.ts` - Add chat/decision types
- `src/main/db/migrations.ts` - Add migrations v5, v6
- `src/main/db/database.ts` - Update CREATE TABLE statements
- `src/main/ai/providers.ts` - Add `chat()` method to interface + implementations
- `src/main/workers/job-worker.ts` - Add task-extraction and decision-extraction handlers
- `src/main/workers/job-manager.ts` - Add enqueue methods
- `src/main/main.ts` - Add chat IPC handlers
- `src/main/preload.ts` - Add chat API bridge
- `src/renderer/views/ProjectView.tsx` - Add ChatPane component, refactor layout
- `src/renderer/views/ProjectView.css` - Add grid layout styles
- `src/types/index.ts` - Add ChatMessage type, update Capture type enum
- `package.json` - Add @assistant-ui/react dependency

---

## Dependencies

```json
{
  "dependencies": {
    "@assistant-ui/react": "^0.5.x"
  }
}
```

---

## Estimated Time
- **Database schema**: 20 mins
- **Install deps**: 5 mins
- **LLM provider**: 15 mins
- **IPC handlers**: 30 mins
- **Preload bridge**: 10 mins
- **Runtime adapter**: 45 mins
- **Chat pane component**: 60 mins
- **Layout refactor**: 45 mins
- **Job workers**: 60 mins
- **Testing**: 30 mins

**Total: ~5 hours**

---

## Notes

- assistant-ui docs: https://www.assistant-ui.com/docs
- We're using a custom runtime instead of their built-in adapters
- "Fake streaming" = instant append of full response (feels fast enough)
- Job queue used only for commit actions (audit trail, background processing)
- Chat messages NOT auto-saved (explicit commit required)
- No context window management for P1 (send all messages every time)
- Future: Add RAG context, real streaming, agent tools, etc.

---

**Status:** ✅ Spec Complete - Ready for Implementation

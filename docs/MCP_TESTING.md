# MCP Server Testing Guide

## Phase 2: Manual Testing

The MCP server is implemented but not yet integrated with chat. You can test tools manually using the browser console.

### Testing in Browser Console

Open the app, open DevTools Console, and try these commands:

#### List Projects
```javascript
await window.electron.mcp.callTool('projects_list', {})
```

#### Get Project
```javascript
await window.electron.mcp.callTool('projects_get', {
  projectId: 'YOUR_PROJECT_ID_HERE'
})
```

#### Create Project
```javascript
await window.electron.mcp.callTool('projects_create', {
  name: 'Test Project from MCP'
})
```

#### List Tasks
```javascript
await window.electron.mcp.callTool('tasks_list', {
  status: 'open'
})
```

#### Create Task
```javascript
await window.electron.mcp.callTool('tasks_create', {
  projectId: 'YOUR_PROJECT_ID_HERE',
  title: 'Test task from MCP',
  priority: 3
})
```

#### Search Captures
```javascript
await window.electron.mcp.callTool('captures_search', {
  projectId: 'YOUR_PROJECT_ID_HERE',
  type: 'text'
})
```

#### Create Text Capture
```javascript
await window.electron.mcp.callTool('captures_create_text', {
  projectId: 'YOUR_PROJECT_ID_HERE',
  title: 'MCP Test Capture',
  bodyText: 'This capture was created via MCP tool call!'
})
```

### Expected Behavior

1. **Tool executes successfully**: Returns JSON result
2. **Domain event fires**: Check main process console for `[Domain Event]` log
3. **UI updates**: The UI should refresh to show the new/updated entity

### Validation

After creating a project/task/capture via MCP:

1. ✅ Check main process logs for `[MCP Test] Calling tool: ...`
2. ✅ Check main process logs for `[Domain Event] ...`
3. ✅ Verify the entity appears in the UI immediately
4. ✅ No errors in console

### Available Tools (12 total)

**Projects:**
- `projects_list` - List all projects
- `projects_get` - Get project by ID
- `projects_create` - Create new project
- `projects_get_summary` - Get project summary

**Captures:**
- `captures_search` - Search captures (with optional type filter)
- `captures_get` - Get capture by ID
- `captures_create_text` - Create text capture
- `captures_create_decision` - Create decision capture

**Tasks:**
- `tasks_list` - List tasks (with optional filters)
- `tasks_get` - Get task by ID
- `tasks_create` - Create new task
- `tasks_update` - Update existing task

### Error Handling

If a tool call fails:
```javascript
try {
  await window.electron.mcp.callTool('projects_get', {
    projectId: 'invalid-id'
  })
} catch (error) {
  console.error('Tool error:', error)
}
```

Zod validation errors will show which parameter failed validation.

### Next Steps (Phase 3)

Once Phase 2 testing is complete:
- Integrate MCP client into chat runtime
- Replace direct IPC calls with MCP tool calls
- Add MCP stdio transport for internal chat

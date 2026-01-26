# Connecting External Agents to Open Loops

**Phase 4: MCP HTTP Transport**

This guide shows you how to connect external AI agents (Claude Code, Claude Desktop, Goose, etc.) to your Open Loops MCP server.

## Quick Start

**For Claude Code CLI:**
```bash
claude mcp add --transport http open-loops http://localhost:3000/mcp
```

**For Claude Desktop:** See [manual configuration](#connecting-claude-desktop) section below.

## Overview

Open Loops exposes an MCP (Model Context Protocol) server over HTTP, allowing external agents to:
- List all projects
- Get project summaries
- Search captures (text, images, audio, decisions)
- Create and manage tasks
- Create text and decision captures

All operations use the same domain commands as the internal UI, so changes made by external agents appear instantly in the app.

---

## Setup Instructions

### 1. Enable HTTP Transport in Open Loops

1. Open Open Loops
2. Go to **Settings** (gear icon in sidebar)
3. Scroll to **"MCP HTTP Transport (External Agents)"** section
4. Set **Enable HTTP Transport** to **"Enabled"**
5. Configure settings:
   - **Port**: Default is `3000` (change if needed)
   - **Auth Token**: Optional, but recommended for security
6. Click **"Save Settings"**
7. Click **"Start"** button to start the HTTP transport

You should see: ✅ **Running on port 3000**

---

## Connecting Claude Code (CLI)

### Quick Setup

**Basic connection (no auth):**
```bash
claude mcp add --transport http open-loops http://localhost:3000/mcp
```

**With auth token:**
```bash
claude mcp add --transport http open-loops http://localhost:3000/mcp --header "Authorization: Bearer YOUR_AUTH_TOKEN"
```

### Verify Connection

```bash
# List all MCP servers
claude mcp list

# Get details about the open-loops server
claude mcp get open-loops
```

### Usage

Once connected, Claude Code will automatically discover the 12 Open Loops tools:
- `projects_list`, `projects_get`, `projects_create`, `projects_get_summary`
- `captures_search`, `captures_get`, `captures_create_text`, `captures_create_decision`
- `tasks_list`, `tasks_get`, `tasks_create`, `tasks_update`

**Example prompts:**
```
"Show me all my projects in Open Loops"
"What's the latest summary for project XYZ?"
"Create a new task: 'Review Phase 4 implementation' with priority 4"
"Search for recent text captures in project ABC"
```

### Remove Server

```bash
claude mcp remove open-loops
```

---

## Connecting Claude Desktop

### Configuration

Add this to your Claude Desktop MCP settings file:

**Location:**
- Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Configuration:**

```json
{
  "mcpServers": {
    "open-loops": {
      "transport": {
        "type": "http",
        "url": "http://localhost:3000/mcp"
      }
    }
  }
}
```

**With Auth Token:**

```json
{
  "mcpServers": {
    "open-loops": {
      "transport": {
        "type": "http",
        "url": "http://localhost:3000/mcp",
        "headers": {
          "Authorization": "Bearer YOUR_AUTH_TOKEN_HERE"
        }
      }
    }
  }
}
```

### Usage

1. Restart Claude Desktop
2. Start a new conversation
3. Claude will automatically discover the 12 Open Loops tools:
   - `projects_list`, `projects_get`, `projects_create`, `projects_get_summary`
   - `captures_search`, `captures_get`, `captures_create_text`, `captures_create_decision`
   - `tasks_list`, `tasks_get`, `tasks_create`, `tasks_update`

### Example Prompts

```
"Show me all my projects in Open Loops"

"What's the latest summary for project XYZ?"

"Create a new task: 'Review Phase 4 implementation' with priority 4"

"Search for recent text captures in project ABC"

"Create a decision capture documenting why we chose HTTP transport"
```

---

## Connecting Goose

### Installation

```bash
npm install -g @block/goose
```

### Configuration

Create `~/.config/goose/mcp-config.json`:

```json
{
  "mcpServers": {
    "open-loops": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_AUTH_TOKEN_HERE"
      }
    }
  }
}
```

### Usage

```bash
# Start Goose with Open Loops MCP server
goose

# Example commands:
> List all my Open Loops projects
> Create a task to fix the bug in the login flow
> Show me recent captures for project "Website Redesign"
```

---

## Testing with cURL

You can test the MCP server directly with cURL:

### List Projects

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

### Call a Tool

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "projects_list",
      "arguments": {}
    },
    "id": 2
  }'
```

### Create a Task

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "tasks_create",
      "arguments": {
        "title": "Test task from external agent",
        "priority": 3
      }
    },
    "id": 3
  }'
```

---

## Available Tools

### Projects

#### `projects_list`
Lists all projects.

**Parameters:** None

**Returns:** Array of projects with id, name, createdAt, updatedAt

#### `projects_get`
Get a specific project by ID.

**Parameters:**
- `projectId` (string, required): UUID of the project

**Returns:** Project object

#### `projects_create`
Create a new project.

**Parameters:**
- `name` (string, required): Project name

**Returns:** Created project object

#### `projects_get_summary`
Get the latest AI-generated summary for a project.

**Parameters:**
- `projectId` (string, required): UUID of the project

**Returns:** Summary object with markdown content

### Captures

#### `captures_search`
Search captures in a project.

**Parameters:**
- `projectId` (string, required): UUID of the project
- `type` (enum, optional): Filter by type - `text`, `image`, `audio`, `chat`, `decision`

**Returns:** Array of capture objects

#### `captures_get`
Get a specific capture by ID with full content.

**Parameters:**
- `captureId` (string, required): UUID of the capture

**Returns:** Capture object with full content

#### `captures_create_text`
Create a text capture for a project.

**Parameters:**
- `projectId` (string, required): UUID of the project
- `title` (string, optional): Capture title
- `bodyText` (string, required): Text content

**Returns:** Created capture object

#### `captures_create_decision`
Create a decision capture for a project.

**Parameters:**
- `projectId` (string, required): UUID of the project
- `title` (string, required): Decision title
- `bodyText` (string, required): Decision body text (use markdown bullet list)

**Returns:** Created decision capture object

### Tasks

#### `tasks_list`
List tasks, optionally filter by project and status.

**Parameters:**
- `projectId` (string, optional): UUID of the project
- `status` (enum, optional): Filter by status - `open`, `done`

**Returns:** Array of task objects

#### `tasks_get`
Get a specific task by ID.

**Parameters:**
- `taskId` (string, required): UUID of the task

**Returns:** Task object

#### `tasks_create`
Create a new task.

**Parameters:**
- `projectId` (string, optional): UUID of the project (null for inbox)
- `title` (string, required): Task title
- `notes` (string, optional): Task notes
- `priority` (number, optional): Priority 1-5 (default: 3)
- `estimateMinutes` (number, optional): Time estimate in minutes (default: 30)

**Returns:** Created task object

#### `tasks_update`
Update an existing task.

**Parameters:**
- `taskId` (string, required): UUID of the task
- `title` (string, optional): New title
- `notes` (string, optional): New notes
- `status` (enum, optional): New status - `open`, `done`
- `priority` (number, optional): New priority 1-5
- `estimateMinutes` (number, optional): New time estimate

**Returns:** Updated task object

---

## Security Considerations

### Auth Token Best Practices

1. **Always use an auth token** for HTTP transport
2. **Generate a strong token**: Use a password manager or:
   ```bash
   openssl rand -hex 32
   ```
3. **Keep it secret**: Don't commit tokens to version control
4. **Rotate regularly**: Change the token periodically

### Network Security

- **Localhost only**: The HTTP server binds to `localhost` only
- **No internet exposure**: External agents must run on the same machine
- **Future enhancement**: Could add network binding for remote access with TLS

### Firewall

No firewall configuration needed - the server only listens on `localhost`.

---

## Troubleshooting

### Connection Refused

**Problem:** External agent can't connect to `http://localhost:3000/mcp`

**Solutions:**
1. Check that HTTP transport is **started** in Settings
2. Verify the port number matches (default: 3000)
3. Check Open Loops terminal logs for errors

### Unauthorized Error

**Problem:** `401 Unauthorized: Invalid auth token`

**Solutions:**
1. Check auth token in Settings matches the token in agent config
2. Ensure token is passed in `Authorization: Bearer TOKEN` header
3. Try with no auth token first (disable in Settings)

### Tool Not Found

**Problem:** External agent says tool doesn't exist

**Solutions:**
1. Restart Claude Desktop after updating config
2. Check MCP server logs in Open Loops terminal
3. Test with cURL to verify server is working

### UI Not Updating

**Problem:** Changes made by external agent don't appear in UI

**Solutions:**
1. Check Open Loops terminal for `[Domain Event]` logs
2. Domain events should emit automatically
3. Try refreshing the project view
4. Report bug if events aren't emitting

---

## Monitoring

### Server Logs

Open Loops terminal shows all HTTP requests:

```
[MCP HTTP] Received request: tools/list
[MCP HTTP] Request completed: tools/list
[MCP] Executing tool: tasks_create
[Domain Event] task.created { taskId: "...", projectId: "...", title: "..." }
[MCP] Tool tasks_create completed successfully
[MCP HTTP] Request completed: tools/call
```

### Health Check

Check if the server is running:

```bash
curl http://localhost:3000/health
```

Response:
```json
{"status":"ok","transport":"http"}
```

---

## Example Workflows

### Daily Planning with Claude Desktop

```
User: "Show me all my open tasks in Open Loops"
Claude: [Calls tools/call with tasks_list { status: 'open' }]
Claude: "You have 12 open tasks. Here are the highest priority ones..."

User: "Create tasks for today's priorities: review PR, fix bug, write docs"
Claude: [Calls tasks_create three times]
Claude: "I've created 3 tasks for you..."

User: "What's the latest on the Website Redesign project?"
Claude: [Calls projects_get_summary with projectId]
Claude: "Here's the latest summary: ..."
```

### Knowledge Capture with Goose

```
User: "Document our decision to use MCP for agent integration"
Goose: [Calls captures_create_decision]
Goose: "Decision documented in Open Loops"

User: "Search all captures mentioning 'architecture'"
Goose: [Calls captures_search multiple times]
Goose: "Found 5 captures mentioning architecture..."
```

---

## Advanced Configuration

### Custom Port

If port 3000 is in use:

1. In Open Loops Settings, change Port to `3001` (or any available port)
2. Update agent config URL: `http://localhost:3001/mcp`
3. Restart HTTP transport

### Multiple Agents

You can connect multiple agents simultaneously:
- Claude Desktop
- Goose
- Custom scripts
- Browser extensions

All agents will see live updates through domain events.

---

## Future Enhancements (Not Yet Implemented)

- **MCP Resources**: Expose current app state (active project, filters, etc.)
- **MCP Prompts**: Pre-defined workflows for common tasks
- **Streaming**: Real-time progress updates for long operations
- **Network Binding**: Allow remote connections with TLS
- **Token-based Permissions**: Fine-grained access control per agent

---

## Support

If you encounter issues:

1. Check Open Loops terminal logs
2. Test with cURL to isolate the problem
3. Verify Settings configuration
4. File an issue with logs attached

---

**Phase 4 Status: COMPLETE ✅**

MCP HTTP Transport is now fully functional for external agent integration!

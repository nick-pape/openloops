# 🤹‍♂️ Open Loops

A local-first desktop app for project notes and day planning. Built with Electron, React, TypeScript, and SQLite.

**Juggle less, accomplish more.** Capture notes, plan your day, and keep track of what matters.

## Features

### 1. Project Quick Notes

Capture and organize project-related information:

- **Text Captures**: Quick text snippets with optional details
- **Image Captures**: Drag & drop or paste images from clipboard
- **Audio Captures**: Record audio directly in the app with automatic transcription
- **Open Loop Tracking**: Flag captures as "open loops" to track unfinished work
- **AI-Powered Summaries**: Generate project summaries based on recent captures and tasks

### 2. Day Planning

Plan your day with smart time blocking:

- **Calendar Integration**: Import `.ics` files or paste ICS content
- **Task Management**: Create and manage tasks with priorities and time estimates
- **Automatic Planning**: Generate time blocks based on calendar events and open tasks
- **Manual Editing**: Adjust generated plans to fit your needs
- **Persistent Plans**: Save and retrieve plans for any date

## Tech Stack

- **Electron**: Desktop app framework
- **Vite**: Fast build tool and dev server
- **React + TypeScript**: UI framework with type safety
- **SQLite + Drizzle ORM**: Local database with typed queries
- **Worker Threads**: Background processing for transcription and AI tasks
- **ical.js**: Calendar parsing

## Installation

### Prerequisites

- Node.js 18+ and npm
- For local transcription: whisper.cpp binary and model file

### Install Dependencies

```bash
npm install
```

## Development

### Run in Development Mode

```bash
npm run dev
```

This starts:
- Vite dev server on `http://localhost:5173`
- Electron app with hot reload

### Build for Production

```bash
npm run build
```

Creates distributable packages in `dist/` directory.

### Run Tests

```bash
npm test
```

### Lint Code

```bash
npm run lint
```

## Configuration

### AI Providers

Loops supports pluggable AI providers for transcription and summaries. Configure in Settings:

#### Transcription Providers

**Remote (OpenAI Whisper API)**
- Requires API key
- Supports OpenAI-compatible endpoints
- Configuration:
  - API Key (stored securely)
  - Base URL (default: `https://api.openai.com/v1`)

**Local (whisper.cpp)**
- Runs transcription locally
- No API costs
- Configuration:
  - Path to whisper.cpp binary
  - Path to model file (e.g., `ggml-base.en.bin`)

#### Summary Providers

**Remote (OpenAI-compatible)**
- Uses chat completion API for AI-generated summaries
- Works with OpenAI, Ollama, and other OpenAI-compatible endpoints
- Configuration:
  - API Key (stored securely) - use any string for Ollama
  - Base URL (default: `https://api.openai.com/v1`)
    - For Ollama: `http://localhost:11434/v1`
  - Model (default: `gpt-4o-mini`)
    - For Ollama: your model name (e.g., `llama2`, `mistral`)

**Disabled (Local Fallback)**
- Generates simple local summaries without AI
- No API required
- Shows basic counts and recent items

**Using Ollama (Local LLM)**
See [OLLAMA_SETUP.md](OLLAMA_SETUP.md) for complete setup guide with local transcription and summaries.

### Planning Settings

Configure day planning behavior:

- **Working Hours**: Start and end times (default: 9:00 - 17:00)
- **Minimum Block Size**: Smallest time block in minutes (default: 30)
- **Summary Lookback**: Days of history to include in summaries (default: 14)

## Data Storage

All data is stored locally in your user data directory:

- **Windows**: `%APPDATA%\open-loops\app-data`
- **macOS**: `~/Library/Application Support/open-loops/app-data`
- **Linux**: `~/.config/open-loops/app-data`

### Directory Structure

```
app-data/
├── loops.db          # SQLite database
├── images/           # Captured images by project
│   └── {projectId}/
└── audio/            # Audio recordings by project
    └── {projectId}/
```

### Database Schema

- `projects`: Project metadata
- `captures`: Text, image, and audio captures
- `capture_flags`: Open loop flags for captures
- `transcriptions`: Audio transcription results
- `tasks`: Task list with priorities and estimates
- `project_summaries`: Cached AI summaries
- `calendar_events`: Imported calendar events
- `day_plans`: Saved day plans
- `day_plan_blocks`: Time blocks within plans
- `job_queue`: Background job processing
- `settings`: App configuration

## Usage Guide

### Creating a Project

1. Click the "+" button in the sidebar
2. Enter a project name
3. Click "Create"

### Adding Captures

**Text Capture:**
1. Open a project
2. Click "+ Text"
3. Enter title and optional details
4. Click "Create"

**Image Capture:**
- Drag and drop image files onto the project view
- Or copy an image and paste (Ctrl/Cmd + V) in the project view

**Audio Capture:**
1. Click "🎤 Record"
2. Speak into your microphone
3. Click "⏹ Stop" when finished
4. Transcription will start automatically (if configured)

### Generating Project Summaries

1. Open a project
2. Click "Regenerate" in the Project Summary panel
3. Wait for the summary to generate (appears in 3-5 seconds)

Note: Summaries require an LLM provider to be configured. In "Disabled" mode, you'll get a basic local summary.

### Day Planning

**Import Calendar:**
1. Go to "Today Planner" in sidebar
2. Click "Import .ics File" to select a file
3. Or click "Paste ICS Text" to paste calendar data

**Create Tasks:**
1. Click "+ Task"
2. Enter title, estimate (minutes), and priority (1-5)
3. Click "Create"

**Generate Plan:**
1. Select a date
2. Click "Generate Plan"
3. Review the generated time blocks
4. Edit blocks as needed (click "Edit" on any block)
5. Click "Commit Plan" to save

### Settings

Access Settings from the sidebar to configure:
- Transcription provider (remote or local)
- LLM provider for summaries
- API keys (stored securely)
- Working hours and planning preferences

## Architecture

### Electron Process Model

- **Main Process** (`src/main/main.ts`): Core app logic, IPC handlers, database access
- **Renderer Process** (`src/renderer/`): React UI, no direct Node.js access
- **Preload Script** (`src/main/preload.ts`): Secure IPC bridge with contextIsolation

### Security

- Context isolation enabled
- Sandbox mode enabled
- No Node.js in renderer
- Strict IPC boundaries
- Secrets stored separately from database (note: MVP stores in settings table; production should use keytar)

### Background Processing

- Worker threads handle transcription and summary jobs
- Job queue in SQLite coordinates work
- Main thread polls for pending jobs
- Results written back to database

### Day Planning Algorithm

The planner uses a greedy allocation algorithm:

1. Parse calendar events for the selected date
2. Find free windows between events within working hours
3. Filter windows smaller than minimum block size
4. Sort tasks by priority (desc), due date (asc), estimate (desc)
5. Allocate tasks to windows:
   - Fit entire task if possible
   - Split task across windows if needed
   - Fill remaining time with buffer blocks

## Known Limitations

### MVP Scope

- **No Calendar OAuth**: Must import .ics files manually. Future: OAuth for Google/Microsoft.
- **No Multi-Device Sync**: Data is local only. Future: Optional cloud sync.
- **No Keytar Integration**: Secrets stored in settings table. Future: OS keychain via keytar.
- **Basic Planning**: Heuristic algorithm, not optimization. Future: User feedback and learning.
- **No Export**: Can't export plans back to .ics. Future: Export functionality.
- **No Drag-Drop Editing**: Blocks must be edited via modal. Future: Timeline UI with drag/drop.

### Technical Limitations

- Audio transcription requires either API key or local whisper.cpp setup
- Local whisper.cpp path must be configured manually
- Image preview not implemented (shows full size)
- No undo/redo functionality
- No search across captures
- Summary generation is fire-and-forget (no progress indication beyond initial message)

## Troubleshooting

### Transcription Not Working

**Remote provider:**
- Check API key is set correctly in Settings
- Verify base URL is correct (include `/v1` for OpenAI)
- Check network connectivity

**Local provider:**
- Ensure whisper.cpp binary path is correct
- Verify model file exists at specified path
- Test whisper.cpp from command line first

### Summary Generation Fails

- Check that LLM provider is configured (or use "Disabled" mode)
- Verify API key and base URL
- Try "Disabled" mode for basic local summary

### Calendar Import Fails

- Ensure .ics file is valid (test with another calendar app)
- Check file uses UTF-8 encoding
- Try pasting ICS content directly instead of file import

### Database Issues

- Database file is at `{userData}/app-data/loops.db`
- Backup database before manual edits
- Delete database file to reset (loses all data)

## Development Notes

### File Structure

```
loops/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.ts        # Entry point, IPC setup
│   │   ├── preload.ts     # IPC bridge
│   │   ├── db/            # Database layer
│   │   ├── ai/            # AI provider interfaces
│   │   ├── workers/       # Background job system
│   │   └── planning/      # Calendar and planning logic
│   ├── renderer/          # React UI
│   │   ├── App.tsx        # Main app component
│   │   ├── components/    # Reusable components
│   │   └── views/         # Page views
│   └── types/             # Shared TypeScript types
├── drizzle/               # Database migrations
├── dist/                  # Built renderer
├── dist-electron/         # Built electron processes
└── package.json
```

### Adding New IPC Handlers

1. Add handler in `src/main/main.ts`:
   ```typescript
   ipcMain.handle('namespace:action', async (_, arg) => {
     // implementation
   })
   ```

2. Add to preload API in `src/main/preload.ts`:
   ```typescript
   namespace: {
     action: (arg: Type) => ipcRenderer.invoke('namespace:action', arg)
   }
   ```

3. Use in renderer:
   ```typescript
   const result = await window.electron.namespace.action(arg)
   ```

### Testing

Tests use Vitest with in-memory SQLite databases. Run tests with:

```bash
npm test
```

Add tests in `*.test.ts` files alongside the code they test.

## License

MIT

## Contributing

This is an MVP. Contributions welcome for:
- OAuth calendar integration
- Keytar secret storage
- Better planning algorithms
- Timeline UI for plan editing
- Search functionality
- Export features

## Future Roadmap

- [ ] OAuth integration (Google Calendar, Microsoft Outlook)
- [ ] Cloud sync with end-to-end encryption
- [ ] Mobile companion app (view-only)
- [ ] Advanced planning with ML-based time estimates
- [ ] Team collaboration features
- [ ] Integration with task management tools (Todoist, etc.)
- [ ] Voice-to-text for text captures
- [ ] OCR for image captures
- [ ] Markdown support in captures
- [ ] Tags and advanced filtering
- [ ] Weekly/monthly planning views
- [ ] Time tracking integration

---

Built with ❤️ for focused work and closed loops.

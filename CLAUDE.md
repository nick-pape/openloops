# 🤹‍♂️ Open Loops - Context for Claude

This file provides essential context for working on the Open Loops project.

## Project Overview

**Open Loops** is a local-first desktop app for project notes and day planning. Built with Electron, React, TypeScript, and SQLite.

**Tagline:** "Juggle less, accomplish more."

## Quick Links

- **[README.md](README.md)** - Full project documentation, setup, and architecture
- **[docs/QUICK_START.md](docs/QUICK_START.md)** - 5-minute getting started guide
- **[docs/PROJECT_SUMMARY.md](docs/PROJECT_SUMMARY.md)** - What was built and current status
- **[docs/BRANDING.md](docs/BRANDING.md)** - Brand identity, logo rationale, and voice
- **[docs/OLLAMA_SETUP.md](docs/OLLAMA_SETUP.md)** - Local LLM setup with Ollama
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Development guidelines

## Tech Stack

- **Frontend**: React 18 + TypeScript 5 + Vite
- **Backend**: Electron 28 main process + worker threads
- **Database**: SQLite with Drizzle ORM
- **AI**: Pluggable providers (OpenAI API, Ollama)
- **Styling**: CSS (no framework)

## Key Architecture Decisions

1. **Local-First**: All data stored in SQLite, no cloud dependencies
2. **Secure IPC**: contextIsolation + sandbox + preload bridge
3. **Background Jobs**: Worker threads for transcription and summaries
4. **Pluggable AI**: Provider pattern supports multiple backends
5. **Markdown Rendering**: react-markdown for text captures and summaries

## Project Structure

```
src/
├── main/               # Electron main process
│   ├── main.ts        # Entry point, IPC handlers, menu setup
│   ├── preload.ts     # Secure IPC bridge
│   ├── db/            # Database layer (schema, repository, migrations)
│   ├── ai/            # AI provider interfaces and implementations
│   ├── workers/       # Background job system (transcription, summaries)
│   └── planning/      # Day planner algorithm and ICS parsing
├── renderer/          # React UI
│   ├── App.tsx        # Main app shell with routing
│   ├── components/    # Reusable components (Sidebar)
│   └── views/         # Page views (ProjectView, PlannerView, SettingsView)
└── types/             # Shared TypeScript definitions
```

## Current Features

### Project Captures
- **Text captures**: Markdown-rendered notes
- **Image captures**: Drag/drop or clipboard paste
- **Audio captures**: Record with automatic transcription
- **Edit/Delete**: Full CRUD for captures
- **Tab-based UI**: Summary tab + Captures tab
- **Accordion UI**: Full-width expandable capture cards

### Day Planning
- **Calendar import**: Parse .ics files
- **Task management**: Create, edit, delete with priorities
- **Time blocking**: Greedy allocation algorithm
- **Manual editing**: Adjust generated plans

### AI Features
- **Project summaries**: LLM-generated from captures and tasks
- **Audio transcription**: Via OpenAI Whisper API or local whisper.cpp
- **Ollama support**: Works with local LLMs (tested with qwen3-vl:2b-instruct)

## Common Tasks

### Running the App
```bash
npm run dev          # Development mode with hot reload
npm run build        # Production build
npm test            # Run tests
```

### Database
- Location: `%APPDATA%/open-loops/app-data/loops.db` (Windows)
- ORM: Drizzle with typed queries
- Migrations: Automatic on startup

### IPC Pattern
1. Define handler in `src/main/main.ts`: `ipcMain.handle('namespace:action', ...)`
2. Expose in `src/main/preload.ts`: Add to API object
3. Call from renderer: `window.electron.namespace.action(...)`

## Known Limitations (MVP)

- No OAuth calendar integration (manual .ics import only)
- Secrets stored in database (should use OS keychain via keytar)
- No multi-device sync
- Basic planning heuristic (not ML-optimized)
- No drag-drop timeline editing
- No .ics export

## Development Guidelines

- **No premature abstractions**: Keep it simple
- **Security first**: No Node.js in renderer, strict IPC
- **TypeScript strict mode**: Type safety throughout
- **Markdown support**: Use react-markdown for all user content
- **Local-first**: User owns their data

## Git Workflow

- Main branch: `main`
- Commit style: Descriptive messages with context
- Co-author Claude: `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`

---

**Last Updated:** 2026-01-22
**Version:** 1.0.0 (Initial MVP)

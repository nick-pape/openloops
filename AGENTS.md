# AGENTS.md

This file provides essential context for coding agents working on the Open Loops project.

## Quick Reference

- **Language**: TypeScript (strict mode)
- **Framework**: Electron (main + renderer), React, Vite
- **Testing**: Vitest
- **Linting**: ESLint
- **Formatting**: Built-in TypeScript formatting
- **Database**: SQLite + Drizzle ORM

## Build, Lint, and Test Commands

### Essential Commands

```bash
# Start development server
npm run dev

# Build production app
npm run build

# Lint all TypeScript files
npm run lint

# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Type checking
npm run typecheck
```

### Running a Single Test

To run a specific test file:

```bash
npm test -- src/path/to/file.test.ts

# Example: Run database repository tests
npm test -- src/main/db/repository.test.ts
```

### Build for Specific Platform

```bash
# Windows build
npm run build:win
```

## Code Style Guidelines

### Imports

- **Absolute imports**: Use `@` alias for `src/`
  ```typescript
  import { Component } from '@/renderer/components'
  import { db } from '@/main/db'
  ```

- **Default imports**: Use default imports for React and common components
- **Named imports**: Use named imports for utilities and types

### Formatting

- **TypeScript**: ESLint + TypeScript strict mode
- **React**: React Refresh plugin enabled
- **Auto-formatting**: VS Code format-on-save enabled
- **ESLint auto-fix**: Runs on save (`eslint --fix`)

### TypeScript

**Compiler Options (strict mode)**:
- `strict: true` - All strict checks enabled
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`

**Type Safety**:
- Never use `@ts-ignore` or `@ts-expect-error` without a comment explaining why
- Prefer `unknown` over `any` for dynamic types
- Use type guards for union types

### Naming Conventions

**Files**:
- `.ts` for TypeScript files
- `.tsx` for React components
- `.test.ts` for tests

**Components**:
- PascalCase: `ProjectView.tsx`, `Sidebar.tsx`
- Named exports: Prefer named exports for components

**Variables and Functions**:
- camelCase for variables and functions
- UPPER_CASE for constants and enums
- PascalCase for types, interfaces, and classes

**DB/SQL**:
- snake_case for database tables and columns
- Type-safe queries using Drizzle ORM

### Error Handling

- Use try/catch blocks for async operations
- Return meaningful error messages
- Log errors to console for debugging
- Never expose internal errors to users directly

### React Patterns

- Functional components with hooks
- Custom hooks names: `use[Feature].ts`
- State management: React context and useReducer
- No class components

## Testing

### Test File Structure

Tests are colocated with source files:

```
src/
├── main/
│   ├── db/
│   │   ├── repository.ts
│   │   └── repository.test.ts
```

### Test Naming

- `*.test.ts` - Unit tests
- Use Vitest's `describe` and `it`
- Mock external dependencies (database, file system)

### Test Commands

**Run all tests**:
```bash
npm test
```

**Run specific test**:
```bash
npm test -- src/main/db/repository.test.ts
```

**Watch mode**:
```bash
npm test -- --watch
```

**Coverage**:
```bash
npm test -- --coverage
```

## Project Architecture

### Directory Structure

```
src/
├── main/              # Electron main process
│   ├── main.ts        # App entry, IPC handlers
│   ├── preload.ts     # Secure IPC bridge
│   ├── db/            # Database layer
│   │   ├── schema.ts  # Drizzle schema
│   │   ├── repository.ts # DB operations
│   │   └── migrate.ts # Migrations
│   ├── ai/            # AI providers
│   │   ├── types.ts   # Provider types
│   │   └── providers/ # Specific implementations
│   ├── workers/       # Background jobs
│   │   └── job-worker.ts # Job processing
│   └── planning/      # Day planning
│       └── day-planner.ts # Planning logic
├── renderer/          # React UI
│   ├── components/    # Reusable components
│   │   ├── Sidebar.tsx
│   │   └── ProjectView.tsx
│   └── views/         # Page views
│       ├── WelcomeView.tsx
│       └── PlannerView.tsx
└── types/             # Shared TypeScript types
```

### Key Patterns

- **Domain-Driven Design**: Focus on business logic
- **CQRS Pattern**: Command Query Responsibility Segregation
- **Event-Driven**: DomainEvents for app-wide sync
- **Modular**: Clear separation of concerns

## Specific Implementation Notes

### Database

- SQLite with Drizzle ORM
- All queries are type-safe
- Migrations run automatically on startup

### Electron

- Context isolation enabled
- Sandbox mode enabled
- Secure IPC bridge with preload script

### AI Integration

- Multiple provider support (OpenAI, Ollama)
- Pluggable architecture
- Background job processing for transcription/summaries

### State Management

- React context for global state
- useReducer for component state
- No external state libraries (Redux, Zustand)

## Common Tasks

### Adding a New IPC Handler

1. Add handler in `src/main/main.ts`
2. Add to preload API in `src/main/preload.ts`
3. Update types in `src/types/index.ts`
4. Use in renderer components

### Adding a New Database Table

1. Add schema in `src/main/db/schema.ts`
2. Add methods in `src/main/db/repository.ts`
3. Add migration SQL in `src/main/db/migrate.ts`
4. Update types in `src/types/index.ts`

### Adding a New UI Component

1. Create component in `src/renderer/components/` or `src/renderer/views/`
2. Add styles in corresponding `.css` file
3. Import and use in parent component

## Development Tips

1. **Hot Reload**: Vite provides HMR for React components
2. **Electron Updates**: Restart required for main process changes
3. **Type Checking**: Run `npm run typecheck` before committing
4. **Linting**: Run `npm run lint` before pushing
5. **Testing**: Write tests for new features

## ESLint Configuration

Extended rules:
- `@typescript-eslint/recommended`
- `react-hooks/recommended`
- `eslint:recommended`

Specific rules:
- `react-refresh/only-export-components` - warn on invalid exports
- `@typescript-eslint/no-explicit-any` - warn (not error)

## Git Workflow

- Main branch protection
- Feature branches for all changes
- Clear commit messages
- Linked to issues where applicable

## Environment Variables

- Configure in `.env` file
- Prefix with `VITE_` for renderer access
- Use `electron-store` for runtime configuration

## Security

- Context isolation enabled
- No Node.js in renderer
- Strict IPC boundaries
- Secrets stored separately (MVP)

## VS Code Setup

Recommended extensions:
- ESLint
- Prettier
- TypeScript
- Vite
- Electron Language

VS Code settings:
- Format on save enabled
- ESLint fix on save enabled
- TypeScript type checking enabled

## Documentation Generation

Agentic coding agents should:
1. Update AGENTS.md when significant changes occur
2. Document new features in README.md
3. Add TypeScript comments for complex logic
4. Write comprehensive test files

## Contribution Guidelines

- Keep commits focused
- Reference issues: "Fix #123: Feature description"
- Add tests for new features
- Run linter before committing
- Update documentation

## Known Limitations

- No OAuth calendar integration (manual .ics import)
- Secrets stored in database (should use keytar)
- No multi-device sync
- Basic planning heuristic
- No drag-drop timeline editing
- No .ics export

## Priority Areas

- OAuth calendar integration
- Keytar integration for secrets
- Timeline UI with drag-drop
- Search functionality
- Export capabilities
- Markdown support

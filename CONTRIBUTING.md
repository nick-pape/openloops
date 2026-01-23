# Contributing to Loops

Thank you for your interest in contributing to Loops!

## Development Setup

1. **Fork and clone the repository**

```bash
git clone https://github.com/yourusername/loops.git
cd loops
```

2. **Install dependencies**

```bash
npm install
```

3. **Run in development mode**

```bash
npm run dev
```

## Code Style

- Use TypeScript for all new code
- Follow existing code formatting (ESLint configuration provided)
- Run linter before committing: `npm run lint`
- Add tests for new features

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch
```

## Project Structure

```
src/
├── main/              # Electron main process
│   ├── main.ts        # App entry, IPC handlers
│   ├── preload.ts     # Secure IPC bridge
│   ├── db/            # Database layer
│   ├── ai/            # AI providers
│   ├── workers/       # Background jobs
│   └── planning/      # Planning algorithms
└── renderer/          # React UI
    ├── components/    # Reusable components
    └── views/         # Page views
```

## Adding Features

### New IPC Endpoint

1. Add handler in `src/main/main.ts`
2. Add to preload API in `src/main/preload.ts`
3. Update types in `src/types/index.ts`
4. Use in renderer components

### New Database Table

1. Add schema in `src/main/db/schema.ts`
2. Add methods in `src/main/db/repository.ts`
3. Add migration SQL in `src/main/db/database.ts`
4. Update types in `src/types/index.ts`

### New UI Component

1. Create component in `src/renderer/components/` or `src/renderer/views/`
2. Add styles in corresponding `.css` file
3. Import and use in parent component

## Commit Guidelines

- Use clear, descriptive commit messages
- Reference issues if applicable: "Fix #123: Audio recording on Windows"
- Keep commits focused on a single change

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Add tests if applicable
4. Run linter: `npm run lint`
5. Run tests: `npm test`
6. Commit and push
7. Open a pull request with a clear description

## Priority Areas for Contribution

- [ ] OAuth calendar integration (Google, Microsoft)
- [ ] Proper keytar integration for secrets
- [ ] Timeline UI for drag-drop plan editing
- [ ] Search functionality across captures
- [ ] Export plans to .ics format
- [ ] Markdown support in text captures
- [ ] Tags and advanced filtering
- [ ] Weekly/monthly planning views
- [ ] Performance optimizations
- [ ] Better error handling and user feedback
- [ ] Accessibility improvements
- [ ] Documentation improvements

## Questions?

Open an issue for discussion before starting work on major features.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

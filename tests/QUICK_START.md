# Quick Start - Running Tests

## Prerequisites

**IMPORTANT**: The Vite dev server must be running before tests can launch the app.

### Step 1: Start the Dev Server

In one terminal, run:
```bash
npm run dev
```

Wait for the output:
```
VITE v5.x.x  ready in Xms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

**Keep this terminal running!**

### Step 2: Run Tests

In a **separate terminal**, run:
```bash
npm run test:e2e:headed
```

## Why Two Terminals?

The Electron app loads its UI from the Vite dev server (http://localhost:5173). Without the dev server running:
- Electron launches ✅
- But the window never appears ❌ (because it can't load the UI)

## Quick Commands

### See tests run visually
```bash
npm run test:e2e:headed
```

### Run specific test
```bash
npx playwright test tests/calendar-sync.spec.ts -g "should sync calendar" --headed
```

### Debug a test
```bash
npm run test:e2e:debug
```

## Troubleshooting

### "Timeout waiting for window"
**Cause**: Dev server not running
**Fix**: Run `npm run dev` in another terminal first

### "Page closed" or crashes
**Cause**: App error in main or renderer process
**Fix**: Check the console output for error stack traces

### Port 5173 already in use
**Cause**: Another Vite server or app is running
**Fix**: Stop other instances or change the port in vite.config.ts

## What the Tests Do

### Calendar Sync Tests
- Show Microsoft Graph connection status
- Trigger calendar sync
- **Capture timezone debug logs**
- Inspect database vs UI times
- Save screenshots of the sync process

### Agent Tests
- Verify agent doesn't loop calling tools
- Count tool invocations
- Check plan creation workflow

## Next Steps

After starting dev server and running tests:

1. **Check console output** for timezone debug info
2. **View screenshots** at `test-results/screenshots/`
3. **Open HTML report**: `npx playwright show-report`

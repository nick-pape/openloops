# Playwright Integration Tests

End-to-end tests for the Open Loops Electron app using Playwright.

## Prerequisites

1. **Build the app** before running tests:
   ```bash
   npm run dev  # Start dev server
   # In another terminal, let vite compile the main process
   ```

2. **Ensure the app is not already running** when tests start (tests will launch their own instance)

## Running Tests

### Run all tests
```bash
npm run test:e2e
```

### Run tests with UI mode (visual test runner)
```bash
npm run test:e2e:ui
```

### Run tests in headed mode (see the browser window)
```bash
npm run test:e2e:headed
```

### Run tests in debug mode (step through with debugger)
```bash
npm run test:e2e:debug
```

### Run a specific test file
```bash
npx playwright test tests/smoke.spec.ts
```

### Run a specific test
```bash
npx playwright test -g "should launch and show main window"
```

## Test Structure

### `smoke.spec.ts`
Basic smoke tests that verify:
- App launches successfully
- Main window appears
- Sidebar navigation works
- Views can be switched

### `calendar-sync.spec.ts`
Tests for Microsoft Graph calendar integration:
- Connection status
- Calendar selection UI
- Sync behavior and event counts
- **Timezone debugging** - captures and logs event times to verify UTC/local handling
- Database inspection

### `agent-planner.spec.ts`
Tests for the AI agent in planner context:
- Agent chat interface
- Tool calling behavior
- **Loop detection** - verifies agent doesn't repeatedly call the same tools
- Plan creation workflow

## Debugging Tests

### View test results
After running tests, open the HTML report:
```bash
npx playwright show-report
```

### Check screenshots
Failed tests automatically capture screenshots saved to:
```
test-results/screenshots/
```

### Check console logs
Tests capture both:
- **Renderer process logs**: Prefixed with `[Renderer Console]`
- **Main process logs**: Prefixed with `[Main Process Console]` (when using `captureMainProcessLogs()`)

### Inspect video recordings
Failed tests save videos to:
```
test-results/
```

## Common Issues

### "Timed out waiting for page"
- Ensure `npm run dev` is running and vite has compiled the main process
- Check that `dist-electron/main.js` exists

### "Cannot find module"
- Run `npm install` to ensure all dependencies are installed
- Make sure Playwright browsers are installed: `npx playwright install chromium`

### Tests fail with "App not responding"
- Close any running instances of the app
- Delete `test-data/` directory to start with a clean test database

### Microsoft Graph tests skip
- Tests check if Microsoft Graph is connected before running
- Connect Microsoft Graph in Settings if you want to test that functionality

## Test Data

Tests use a separate database at `test-data/` to avoid interfering with your real data.

To reset test data:
```bash
rm -rf test-data/
```

## CI/CD

Tests are configured to:
- Run in serial (one at a time)
- Retry twice on CI
- Capture traces on first retry
- Skip tests that require user setup (like Microsoft Graph connection)

## Writing New Tests

See the existing test files for examples. Key patterns:

```typescript
import { test, expect } from './helpers/electron'

test('my test', async ({ electronApp, mainWindow }) => {
  // electronApp: ElectronApplication instance
  // mainWindow: Page object for the main window

  // Interact with the UI
  await mainWindow.click('text=Settings')

  // Assert expectations
  await expect(mainWindow.locator('text=AI Configuration')).toBeVisible()

  // Take a screenshot
  await mainWindow.screenshot({ path: 'test-results/screenshots/my-test.png' })
})
```

## Useful Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Electron API](https://playwright.dev/docs/api/class-electron)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)

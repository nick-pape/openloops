# Debugging Guide for Open Loops Tests

This guide shows how to use Playwright tests to debug the current issues with calendar sync and timezone handling.

## Quick Start

1. **Ensure the dev server is running:**
   ```bash
   npm run dev
   ```

2. **In another terminal, run tests:**
   ```bash
   npm run test:e2e:headed
   ```

This will run tests with visible browser windows so you can see what's happening.

## Debugging Specific Issues

### Issue 1: Calendar Sync Returns 0 Events

**Test:** `calendar-sync.spec.ts` → "should sync calendar and log event data"

This test will:
1. Navigate to Planner view
2. Click "Sync Microsoft Calendar"
3. Capture all main process logs showing:
   - How many events were imported vs updated
   - The timezone debug info for the first event
   - Any error messages

**How to run:**
```bash
npx playwright test tests/calendar-sync.spec.ts -g "should sync calendar and log event data" --headed
```

**What to look for in console output:**
- `[MS Graph] First event timezone debug:` - Shows what Graph API is returning
- Look for `imported` vs `updated` counts
- Check if `startTimeZone` and `endTimeZone` are set to "UTC"

### Issue 2: Timezone Display Wrong (6+ Hours Off)

**Test:** `calendar-sync.spec.ts` → "should display calendar events with correct times"

This test will:
1. Display calendar events in the UI
2. Extract the displayed times
3. Compare with what's stored in the database

**How to run:**
```bash
npx playwright test tests/calendar-sync.spec.ts -g "should display calendar events with correct times" --headed
```

**What to check:**
- Compare the time shown in UI vs the event's actual calendar time
- Check the screenshot at `test-results/screenshots/calendar-events.png`

**Follow-up test:**
```bash
npx playwright test tests/calendar-sync.spec.ts -g "should inspect stored calendar events in database" --headed
```

This will print:
- Raw database timestamps
- `startLocal` (in your timezone)
- `startUTC` (in UTC)

Compare these to determine where the conversion is going wrong.

### Issue 3: Agent Loop (Calling Tools Repeatedly)

**Test:** `agent-planner.spec.ts` → "should not loop when creating a plan"

This test will:
1. Send "Can you create a plan for today?" to the agent
2. Count how many times `calendar_day_events_get` and `tasks_list_candidates_for_day` are called
3. Fail if either tool is called more than 3 times

**How to run:**
```bash
npx playwright test tests/agent-planner.spec.ts -g "should not loop" --headed
```

**Expected output:**
```
Tool Call Summary:
  calendar_day_events_get: 1 calls
  tasks_list_candidates_for_day: 1 calls
✅ No excessive looping detected
```

**If it loops:**
The test will fail and show:
```
❌ LOOP DETECTED: Tools called too many times!
Expected: 1-2 calls each
Actual: calendar=12, tasks=12
```

## Advanced Debugging

### Capture Full Console Logs

Run tests with Playwright's debug mode:
```bash
npm run test:e2e:debug
```

This opens the Playwright Inspector where you can:
- Step through each action
- See console logs in real-time
- Inspect the DOM
- Pause on errors

### Get Screenshots of Every Step

Modify a test to take screenshots at each step:

```typescript
// After each action, add:
await mainWindow.screenshot({
  path: `test-results/screenshots/step-${Date.now()}.png`
})
```

### Inspect Network Requests

Add network monitoring to see Microsoft Graph API calls:

```typescript
mainWindow.on('request', request => {
  if (request.url().includes('graph.microsoft.com')) {
    console.log('Graph API Request:', request.method(), request.url())
  }
})

mainWindow.on('response', response => {
  if (response.url().includes('graph.microsoft.com')) {
    console.log('Graph API Response:', response.status(), response.url())
  }
})
```

### Check Database Directly

Run the database inspection test:
```bash
npx playwright test tests/calendar-sync.spec.ts -g "should inspect stored calendar events"
```

This dumps the raw database content to console.

## Common Patterns

### Skip tests that require setup

Tests automatically skip if prerequisites aren't met:
- Microsoft Graph not connected → Calendar tests skip
- LLM not configured → Agent tests skip

### Force a test to run

To force calendar tests even without MS Graph connected, comment out the skip:
```typescript
// test.skip(!isConnected, 'Microsoft Graph not connected')
```

### Add more logging

Inside any test, use:
```typescript
console.log('🔍 My debug info:', someVariable)
```

All console output appears in the test runner.

## Troubleshooting Test Failures

### "Cannot find main.js"
The app hasn't been compiled yet. Run:
```bash
npm run dev
```
Wait for Vite to compile, then run tests.

### "Page closed" or "Browser closed"
The app crashed. Check main process logs for errors.

### Test times out
Increase timeout for specific test:
```typescript
test('my slow test', async ({ mainWindow }) => {
  test.setTimeout(120000) // 2 minutes
  // ... test code
})
```

## Reporting Issues

When reporting an issue, include:
1. **Console output** from the test run
2. **Screenshots** from `test-results/screenshots/`
3. **Videos** from `test-results/` (if test failed)
4. **HTML report** - run `npx playwright show-report` and share the URL

This gives complete context about what happened.

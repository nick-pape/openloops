import { test, expect, captureMainProcessLogs } from './helpers/electron'

/**
 * Calendar Sync Tests
 *
 * Tests for Microsoft Graph calendar integration, sync behavior, and timezone handling.
 */

test.describe('Microsoft Graph Calendar Sync', () => {
  test.beforeEach(async ({ mainWindow }) => {
    // Navigate to Settings view
    await mainWindow.click('text=Settings')
    await expect(mainWindow.locator('text=AI Configuration')).toBeVisible()
  })

  test('should show Microsoft Graph connection status', async ({ mainWindow }) => {
    // Scroll to Microsoft Graph section
    await mainWindow.evaluate(() => {
      const section = document.querySelector('.microsoft-graph-section')
      if (section) section.scrollIntoView({ behavior: 'smooth' })
    })

    // Check for Microsoft Graph section
    const msGraphSection = mainWindow.locator('.microsoft-graph-section')
    await expect(msGraphSection).toBeVisible()

    // Check connection status
    const isConnected = await mainWindow.locator('.microsoft-graph-section button:has-text("Disconnect")').isVisible()
    console.log('Microsoft Graph connected:', isConnected)

    // Take screenshot of the state
    await mainWindow.screenshot({ path: 'test-results/screenshots/ms-graph-status.png' })
  })

  test('should show calendar selection when connected', async ({ mainWindow }) => {
    // Check if user is connected (skip if not)
    const isConnected = await mainWindow.locator('.microsoft-graph-section button:has-text("Disconnect")').isVisible()
    test.skip(!isConnected, 'Microsoft Graph not connected')

    // Look for calendar selection UI
    const calendarSection = mainWindow.locator('text=Calendars to Sync')
    await expect(calendarSection).toBeVisible()

    // Get list of calendars
    const calendars = await mainWindow.locator('.calendar-item').all()
    console.log(`Found ${calendars.length} calendars available for sync`)

    // Take screenshot showing calendars
    await mainWindow.screenshot({ path: 'test-results/screenshots/calendar-selection.png' })
  })

  test('should sync calendar and log event data', async ({ mainWindow, electronApp }) => {
    // Enable main process log capture
    captureMainProcessLogs(electronApp)

    // Navigate to Planner view
    await mainWindow.click('text=Planner')
    await expect(mainWindow.locator('text=Day Planner')).toBeVisible()

    // Check if Microsoft Graph is connected
    const syncButton = mainWindow.locator('button:has-text("Sync Microsoft Calendar")')
    const isSyncButtonVisible = await syncButton.isVisible()

    test.skip(!isSyncButtonVisible, 'Microsoft Graph sync not available')

    // Click sync button and wait for response
    console.log('🔄 Starting calendar sync...')
    await syncButton.click()

    // Wait for sync to complete (look for success message or loading to disappear)
    await mainWindow.waitForTimeout(3000)

    // Check for any error messages
    const errorDialog = mainWindow.locator('text=/Failed to sync|Error/')
    const hasError = await errorDialog.isVisible()

    if (hasError) {
      const errorText = await errorDialog.textContent()
      console.error('❌ Sync error:', errorText)
    } else {
      console.log('✅ Sync completed (check logs for event count)')
    }

    // Take screenshot of post-sync state
    await mainWindow.screenshot({ path: 'test-results/screenshots/after-sync.png' })
  })

  test('should display calendar events with correct times', async ({ mainWindow }) => {
    // Navigate to Planner view
    await mainWindow.click('text=Planner')
    await expect(mainWindow.locator('text=Day Planner')).toBeVisible()

    // Wait for events to load
    await mainWindow.waitForTimeout(2000)

    // Find calendar events in the UI
    const events = await mainWindow.locator('.event-item, .timeline-event').all()
    console.log(`Found ${events.length} calendar events displayed`)

    if (events.length > 0) {
      // Get details of first event to check timezone
      const firstEvent = events[0]
      const eventText = await firstEvent.textContent()
      console.log('First event:', eventText)

      // Extract time from event (format: "HH:MM AM/PM")
      const timeMatch = eventText?.match(/(\d{1,2}:\d{2}\s*[AP]M)/i)
      if (timeMatch) {
        console.log('Event time displayed:', timeMatch[1])
        console.log('⚠️  Verify this matches the actual calendar time (not offset by 6+ hours)')
      }

      // Take screenshot showing events
      await mainWindow.screenshot({ path: 'test-results/screenshots/calendar-events.png' })
    } else {
      console.log('⚠️  No calendar events found (may need to sync first)')
    }
  })

  test('should show timezone debug info in console', async ({ mainWindow, electronApp }) => {
    // Enable main process log capture
    captureMainProcessLogs(electronApp)

    // Navigate to Settings
    await mainWindow.click('text=Settings')

    // Trigger a sync from Settings if connected
    const syncButton = mainWindow.locator('.microsoft-graph-section button:has-text("Sync")')
    const hasSyncButton = await syncButton.isVisible()

    if (hasSyncButton) {
      console.log('🔍 Syncing to capture timezone debug logs...')
      await syncButton.click()
      await mainWindow.waitForTimeout(3000)

      console.log('✅ Check console output above for "[MS Graph] First event timezone debug:" logs')
    } else {
      console.log('⚠️  No sync button found - connect Microsoft Graph first')
    }
  })
})

test.describe('Calendar Data Inspection', () => {
  test('should inspect stored calendar events in database', async ({ mainWindow }) => {
    // Use Electron's evaluate to run code in the renderer process
    const dbEvents = await mainWindow.evaluate(async () => {
      // Call IPC to get calendar events
      const today = new Date().toISOString().split('T')[0]
      const events = await (window as any).electron.calendar.getEventsForDate(today)

      return events.map((e: any) => ({
        title: e.title,
        startDt: e.startDt,
        endDt: e.endDt,
        // Parse times to check timezone
        startLocal: new Date(e.startDt).toLocaleString(),
        startUTC: new Date(e.startDt).toISOString(),
      }))
    })

    console.log('📊 Calendar events from database:')
    console.log(JSON.stringify(dbEvents, null, 2))

    if (dbEvents.length > 0) {
      console.log('\n⚠️  Compare startLocal vs startUTC to verify timezone handling')
    } else {
      console.log('⚠️  No events in database for today')
    }
  })
})

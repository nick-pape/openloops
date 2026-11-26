import { test, expect } from './helpers/electron'

/**
 * Smoke Tests
 *
 * Basic tests to verify the app launches and core functionality works.
 */

test.describe('App Launch', () => {
  test('should launch and show main window', async ({ electronApp, mainWindow }) => {
    // Verify the app launched
    expect(electronApp).toBeDefined()
    expect(mainWindow).toBeDefined()

    // Check window title contains "Open Loops"
    const title = await mainWindow.title()
    expect(title).toContain('Open Loops')

    // Take a screenshot of the initial state
    await mainWindow.screenshot({ path: 'test-results/screenshots/app-launch.png' })

    console.log('✅ App launched successfully')
  })

  test('should show sidebar navigation', async ({ mainWindow }) => {
    // Wait for sidebar to be visible
    const sidebar = mainWindow.locator('.sidebar')
    await expect(sidebar).toBeVisible()

    // Check for main navigation items
    await expect(mainWindow.locator('text=Projects')).toBeVisible()
    await expect(mainWindow.locator('text=Planner')).toBeVisible()
    await expect(mainWindow.locator('text=Settings')).toBeVisible()

    console.log('✅ Sidebar navigation visible')
  })

  test('should navigate between views', async ({ mainWindow }) => {
    // Navigate to Planner
    await mainWindow.click('text=Planner')
    await expect(mainWindow.locator('text=Day Planner')).toBeVisible()

    // Navigate to Settings
    await mainWindow.click('text=Settings')
    await expect(mainWindow.locator('text=AI Configuration')).toBeVisible()

    // Navigate back to Projects
    await mainWindow.click('text=Projects')
    await expect(mainWindow.locator('text=All Projects')).toBeVisible()

    console.log('✅ Navigation works correctly')
  })
})

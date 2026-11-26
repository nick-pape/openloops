/**
 * Interactive test script for Claude Code chat provider.
 * Connects to the running Electron dev app via CDP and drives the UI.
 *
 * Usage: node tests/test-claude-code.mjs
 *
 * Prerequisites: The app must be running (npm run dev)
 */

import { chromium } from 'playwright'

const CDP_URL = 'http://localhost:5173'

async function main() {
  console.log('=== Claude Code Chat Provider Test ===\n')

  // Connect to the running app's renderer via its URL
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  // Load the running dev app
  console.log('1. Connecting to dev app at', CDP_URL)
  await page.goto(CDP_URL, { timeout: 10_000 })
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'test-results/screenshots/01-initial.png' })
  console.log('   Connected! Screenshot: 01-initial.png')

  // --- Navigate to Settings ---
  console.log('\n2. Navigating to Settings...')
  await page.click('text=Settings')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'test-results/screenshots/02-settings.png' })
  console.log('   Screenshot: 02-settings.png')

  // --- Check current provider setting ---
  // We need to use the IPC bridge — the settings are in the Electron main process.
  // Since we're loading the app in a regular browser, IPC won't work.
  // Let's instead just verify the UI is correct.

  console.log('\n3. Checking provider dropdown...')
  const providerSelect = page.locator('select').filter({ has: page.locator('option[value="claude-code"]') })
  const currentProvider = await providerSelect.inputValue().catch(() => 'not found')
  console.log('   Current provider:', currentProvider)

  console.log('\n=== Result ===')
  console.log('The app UI loads correctly in a browser.')
  console.log('However, IPC calls (settings, chat) require Electron context.')
  console.log('Use the Electron-specific approach below instead.\n')

  await browser.close()
}

main().catch(console.error)

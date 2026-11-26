/**
 * Connect directly to the dev server to interact with the UI
 */

const { chromium } = require('playwright')

async function main() {
  console.log('🌐 Connecting to dev server at http://localhost:5173...')

  const browser = await chromium.launch({
    headless: false, // Show the browser
    slowMo: 100 // Slow down actions to see them
  })

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  })

  const page = await context.newPage()

  // Capture console logs
  page.on('console', msg => {
    console.log(`[Browser Console ${msg.type()}]`, msg.text())
  })

  page.on('pageerror', error => {
    console.error('[Page Error]', error)
  })

  // Navigate to the dev server
  console.log('📍 Navigating to app...')
  await page.goto('http://localhost:5173')

  console.log('✅ Connected! App is visible in browser window.')
  console.log('📸 Taking screenshot...')
  await page.screenshot({ path: 'test-results/devserver-view.png', fullPage: true })

  console.log('\n🔍 Inspecting page...')

  // Check what's visible
  const title = await page.title()
  console.log('Page title:', title)

  // Check for main UI elements
  const hasSidebar = await page.locator('.sidebar').isVisible().catch(() => false)
  console.log('Sidebar visible:', hasSidebar)

  if (hasSidebar) {
    const navItems = await page.locator('.sidebar a, .sidebar button').allTextContents()
    console.log('Navigation items:', navItems)
  }

  console.log('\n✨ You can interact with the browser window.')
  console.log('Press Ctrl+C to close when done.')

  // Keep the browser open
  await new Promise(() => {}) // Wait forever until Ctrl+C
}

main().catch(error => {
  console.error('❌ Error:', error)
  process.exit(1)
})

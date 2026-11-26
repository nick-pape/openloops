/**
 * Interactive app inspector
 *
 * Run this with: node tests/inspect-app.js
 *
 * Make sure dev server is running first: npm run dev
 */

const { chromium } = require('playwright')
const http = require('http')

async function checkDevServer() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:5173', (res) => {
      resolve(true)
    })
    req.on('error', () => {
      resolve(false)
    })
    req.setTimeout(2000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function main() {
  console.log('🔍 Checking dev server...')
  const serverRunning = await checkDevServer()

  if (!serverRunning) {
    console.log('\n❌ Dev server is not running!')
    console.log('\nPlease start it first:')
    console.log('  npm run dev')
    console.log('\nThen run this script again.')
    process.exit(1)
  }

  console.log('✅ Dev server is running!\n')
  console.log('🌐 Opening browser to inspect app...\n')

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50
  })

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  })

  const page = await context.newPage()

  // Capture all console output
  page.on('console', msg => {
    const type = msg.type()
    const text = msg.text()
    const prefix = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'
    console.log(`${prefix} [Console ${type}]`, text)
  })

  page.on('pageerror', error => {
    console.error('❌ [Page Error]', error.message)
  })

  // Navigate to app
  await page.goto('http://localhost:5173')

  console.log('✅ Connected to app!\n')

  // Take initial screenshot
  await page.screenshot({
    path: 'test-results/app-screenshot.png',
    fullPage: true
  })
  console.log('📸 Screenshot saved to test-results/app-screenshot.png\n')

  // Inspect the page
  const title = await page.title()
  console.log('📄 Page title:', title)

  // Check for key UI elements
  const hasSidebar = await page.locator('.sidebar').isVisible().catch(() => false)
  console.log('📍 Sidebar visible:', hasSidebar)

  if (hasSidebar) {
    const navItems = await page.locator('.sidebar a, .sidebar button').allTextContents()
    console.log('🧭 Navigation items:', navItems.filter(t => t.trim()))
  }

  // Check which view is active
  const url = page.url()
  console.log('🔗 Current URL:', url)

  console.log('\n' + '='.repeat(60))
  console.log('✨ Browser is open and ready!')
  console.log('='.repeat(60))
  console.log('\nThe browser window will stay open.')
  console.log('You can interact with it manually.')
  console.log('\nPress Ctrl+C here to close everything when done.\n')

  // Keep running until interrupted
  process.on('SIGINT', async () => {
    console.log('\n\n👋 Closing browser...')
    await browser.close()
    console.log('✅ Done!')
    process.exit(0)
  })

  // Wait forever
  await new Promise(() => {})
}

main().catch(error => {
  console.error('\n❌ Error:', error.message)
  process.exit(1)
})

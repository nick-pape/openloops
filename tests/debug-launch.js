/**
 * Debug script to test Electron launching
 * Run with: node tests/debug-launch.js
 */

const { _electron: electron } = require('playwright')
const path = require('path')

async function main() {
  console.log('🚀 Attempting to launch Electron...')
  console.log('Main file:', path.join(__dirname, '../dist-electron/main.js'))

  try {
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist-electron/main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
      timeout: 60000, // 60 second timeout
    })

    console.log('✅ Electron launched successfully!')

    // Wait for first window
    console.log('⏳ Waiting for window...')
    const window = await electronApp.firstWindow({ timeout: 30000 })

    console.log('✅ Window opened!')
    console.log('Window title:', await window.title())
    console.log('Window URL:', window.url())

    // Take a screenshot
    await window.screenshot({ path: 'test-results/debug-launch.png' })
    console.log('📸 Screenshot saved to test-results/debug-launch.png')

    // Close the app
    await electronApp.close()
    console.log('✅ Test complete!')

  } catch (error) {
    console.error('❌ Error launching Electron:', error.message)
    console.error(error)
    process.exit(1)
  }
}

main()

/**
 * Debug script - launch without NODE_ENV=test
 */

const { _electron: electron } = require('playwright')
const path = require('path')

async function main() {
  console.log('🚀 Launching Electron without NODE_ENV=test...')

  try {
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist-electron/main.js')],
      // Don't set NODE_ENV=test
      timeout: 60000,
    })

    console.log('✅ Electron launched!')

    // Try to get windows
    console.log('⏳ Waiting for window...')
    const window = await electronApp.firstWindow({ timeout: 60000 })

    console.log('✅ Window appeared!')
    console.log('Title:', await window.title())
    console.log('URL:', window.url())

    await window.screenshot({ path: 'test-results/success.png' })
    console.log('📸 Screenshot saved!')

    await electronApp.close()
    console.log('✅ Complete!')

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

main()

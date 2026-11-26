/**
 * Debug script - capture all console output
 */

const { _electron: electron } = require('playwright')
const path = require('path')

async function main() {
  console.log('🚀 Launching Electron with console capture...')

  try {
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist-electron/main.js')],
      timeout: 60000,
    })

    console.log('✅ Electron process started!')

    // Capture main process console output
    electronApp.on('console', msg => {
      console.log('[Main Process]', msg.text())
    })

    electronApp.on('close', () => {
      console.log('[Electron] Process closed')
    })

    // Try to get all pages/windows
    console.log('⏳ Getting context pages...')
    const context = electronApp.context()

    // Wait a bit for window to be created
    await new Promise(resolve => setTimeout(resolve, 10000))

    const pages = context.pages()
    console.log(`Found ${pages.length} pages`)

    if (pages.length > 0) {
      console.log('✅ Pages exist!')
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        console.log(`Page ${i}:`, page.url())

        // Capture renderer console
        page.on('console', msg => {
          console.log(`[Renderer ${i}]`, msg.text())
        })

        page.on('pageerror', error => {
          console.error(`[Renderer ${i} Error]`, error)
        })
      }

      // Wait a bit more to see console output
      await new Promise(resolve => setTimeout(resolve, 5000))
    } else {
      console.log('❌ No pages/windows found')
    }

    await electronApp.close()
    console.log('✅ Complete!')

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error)
    process.exit(1)
  }
}

main()

import { _electron as electron, ElectronApplication, Page } from 'playwright'
import { test as base } from '@playwright/test'
import path from 'path'

/**
 * Electron test helper
 *
 * Launches the pre-built Electron app (from dist-electron/).
 * Requires: `npx vite build` before running tests.
 *
 * The app detects `!app.isPackaged` and `NODE_ENV=development` to decide
 * whether to loadURL (dev server) or loadFile (built assets). We set
 * NODE_ENV=production so it uses loadFile from dist/index.html.
 * But since `!app.isPackaged` is always true when launched this way,
 * we override via OPEN_LOOPS_FORCE_FILE_LOAD.
 */

export type ElectronTestFixtures = {
  electronApp: ElectronApplication
  mainWindow: Page
}

export const test = base.extend<ElectronTestFixtures>({
  electronApp: async ({}, use) => {
    // Use the dev app's data directory (has migrations already applied)
    const userDataDir = path.join(process.env.APPDATA || '', 'open-loops')

    const electronApp = await electron.launch({
      args: [
        path.join(__dirname, '../../dist-electron/main.js'),
        `--user-data-dir=${userDataDir}`,
      ],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        // Signal to main.ts to use loadFile instead of loadURL
        OPEN_LOOPS_FORCE_FILE_LOAD: '1',
        // Ensure claude CLI is found
        CLAUDE_CODE_PATH: path.join(process.env.USERPROFILE || '', '.local', 'bin', 'claude.exe'),
        // Allow Claude Code subprocess to run (unset nested session guard)
        CLAUDECODE: '',
      },
      timeout: 90_000,
    })

    await use(electronApp)
    await electronApp.close()
  },

  mainWindow: async ({ electronApp }, use) => {
    // Wait for window with generous timeout (app does DB init, MCP setup, etc.)
    const mainWindow = await electronApp.waitForEvent('window', { timeout: 90_000 })

    // Setup console log capture
    mainWindow.on('console', (msg) => {
      console.log(`[Renderer ${msg.type().toUpperCase()}]`, msg.text())
    })
    mainWindow.on('pageerror', (error) => {
      console.error('[Renderer Error]', error)
    })

    await mainWindow.waitForLoadState('domcontentloaded')
    await use(mainWindow)
  },
})

export { expect } from '@playwright/test'

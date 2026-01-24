import { BrowserWindow } from 'electron'
import path from 'path'
import { repository } from '../db/repository'

/**
 * WorkModeWindow manages the always-on-top Work Mode overlay window
 */
export class WorkModeWindow {
  private window: BrowserWindow | null = null
  private static WINDOW_STATE_KEY = 'work_mode_window_state'
  private static DEFAULT_WIDTH = 408
  private static DEFAULT_HEIGHT = 350

  /**
   * Check if Work Mode window is open
   */
  isOpen(): boolean {
    return this.window !== null && !this.window.isDestroyed()
  }

  /**
   * Create and show the Work Mode window
   */
  async create() {
    if (this.isOpen()) {
      this.window!.focus()
      return
    }

    const state = await this.loadWindowState()

    // Use saved dimensions but ensure minimum height
    const width = state.width || WorkModeWindow.DEFAULT_WIDTH
    const height = Math.max(state.height || WorkModeWindow.DEFAULT_HEIGHT, WorkModeWindow.DEFAULT_HEIGHT)

    this.window = new BrowserWindow({
      width: width,
      height: height,
      x: state.x,
      y: state.y,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,  // Allow resizing so user can adjust
      minimizable: false,
      maximizable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    })

    const isDev = process.env.NODE_ENV === 'development'

    if (isDev) {
      await this.window.loadURL('http://localhost:5173/#/work-mode')
      // Open DevTools for debugging
      this.window.webContents.openDevTools({ mode: 'detach' })
    } else {
      await this.window.loadFile(path.join(__dirname, '../../dist/index.html'), {
        hash: '/work-mode'
      })
    }

    // Save position when moved
    this.window.on('move', () => {
      this.saveWindowState()
    })

    // Cleanup when closed
    this.window.on('closed', () => {
      this.window = null
    })
  }

  /**
   * Close the Work Mode window
   */
  close() {
    if (this.isOpen()) {
      this.window!.close()
      this.window = null
    }
  }

  /**
   * Toggle Work Mode window (open if closed, close if open)
   */
  toggle() {
    if (this.isOpen()) {
      this.close()
    } else {
      this.create()
    }
  }

  /**
   * Focus the Work Mode window if it's open
   */
  focus() {
    if (this.isOpen()) {
      this.window!.focus()
    }
  }

  /**
   * Load saved window state from settings
   */
  private async loadWindowState(): Promise<{ x?: number; y?: number; width?: number; height?: number }> {
    try {
      const stateJson = await repository.getSetting(WorkModeWindow.WINDOW_STATE_KEY)
      if (stateJson) {
        return JSON.parse(stateJson)
      }
    } catch (error) {
      console.error('Failed to load work mode window state:', error)
    }
    return {}
  }

  /**
   * Save current window state to settings
   */
  private async saveWindowState() {
    if (!this.isOpen()) return

    try {
      const bounds = this.window!.getBounds()
      const state = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      }
      await repository.setSetting(WorkModeWindow.WINDOW_STATE_KEY, JSON.stringify(state))
    } catch (error) {
      console.error('Failed to save work mode window state:', error)
    }
  }
}

export const workModeWindow = new WorkModeWindow()

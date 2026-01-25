import { BrowserWindow } from 'electron'
import path from 'path'

/**
 * TextCaptureWindow manages the ephemeral text capture window
 */
export class TextCaptureWindow {
  private window: BrowserWindow | null = null
  private currentProjectId: string | null = null
  private static DEFAULT_WIDTH = 500
  private static DEFAULT_HEIGHT = 400

  /**
   * Check if text capture window is open
   */
  isOpen(): boolean {
    return this.window !== null && !this.window.isDestroyed()
  }

  /**
   * Get the current project ID (if set)
   */
  getProjectId(): string | null {
    return this.currentProjectId
  }

  /**
   * Create and show the text capture window
   */
  async create(projectId?: string) {
    this.currentProjectId = projectId || null
    if (this.isOpen()) {
      this.window!.focus()
      return
    }

    // Position slightly offset from center for better UX
    const { screen } = require('electron')
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize

    const x = Math.floor((width - TextCaptureWindow.DEFAULT_WIDTH) / 2)
    const y = Math.floor((height - TextCaptureWindow.DEFAULT_HEIGHT) / 2) - 50

    this.window = new BrowserWindow({
      width: TextCaptureWindow.DEFAULT_WIDTH,
      height: TextCaptureWindow.DEFAULT_HEIGHT,
      x,
      y,
      frame: false,
      alwaysOnTop: true,
      resizable: false,
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
      await this.window.loadURL('http://localhost:5173/#/text-capture')
    } else {
      await this.window.loadFile(path.join(__dirname, '../../dist/index.html'), {
        hash: '/text-capture'
      })
    }

    // Cleanup when closed
    this.window.on('closed', () => {
      this.window = null
    })
  }

  /**
   * Close the text capture window
   */
  close() {
    if (this.isOpen()) {
      this.window!.close()
      this.window = null
    }
    this.currentProjectId = null
  }

  /**
   * Focus the text capture window if it's open
   */
  focus() {
    if (this.isOpen()) {
      this.window!.focus()
    }
  }
}

export const textCaptureWindow = new TextCaptureWindow()

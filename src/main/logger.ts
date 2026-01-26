import fs from 'fs'
import path from 'path'
import { app } from 'electron'

/**
 * File-based logger to avoid EPIPE errors from console.log when stdio is redirected
 * by MCP StdioServerTransport
 */

let logFilePath: string | null = null
let logStream: fs.WriteStream | null = null

export function initLogger() {
  try {
    const userDataPath = app.getPath('userData')
    const logsDir = path.join(userDataPath, 'logs')

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]
    logFilePath = path.join(logsDir, `app-${timestamp}.log`)

    logStream = fs.createWriteStream(logFilePath, { flags: 'a' })

    log('info', '[Logger] File logger initialized:', logFilePath)
  } catch (error) {
    // Can't log this, but at least don't crash
  }
}

export function closeLogger() {
  if (logStream) {
    logStream.end()
    logStream = null
  }
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export function log(level: LogLevel, ...args: any[]) {
  const timestamp = new Date().toISOString()
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2)
      } catch {
        return String(arg)
      }
    }
    return String(arg)
  }).join(' ')

  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`

  // Write to file if available
  if (logStream && !logStream.destroyed) {
    try {
      logStream.write(logLine)
    } catch {
      // Ignore write errors to prevent crashes
    }
  }

  // Also write to stderr (not stdout which MCP uses) if in dev mode
  if (process.env.NODE_ENV === 'development') {
    try {
      process.stderr.write(logLine)
    } catch {
      // Ignore EPIPE errors
    }
  }
}

// Convenience methods
export const logger = {
  info: (...args: any[]) => log('info', ...args),
  warn: (...args: any[]) => log('warn', ...args),
  error: (...args: any[]) => log('error', ...args),
  debug: (...args: any[]) => log('debug', ...args)
}

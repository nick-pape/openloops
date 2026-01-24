import { BrowserWindow } from 'electron'

/**
 * App-wide event names for pub/sub pattern
 * Events are scoped by projectId to avoid unnecessary refreshes
 */
export const AppEvents = {
  // Capture events (scoped by project)
  captureCreated: (projectId: string | null) => `capture:created:${projectId || 'inbox'}`,
  captureUpdated: (projectId: string | null) => `capture:updated:${projectId || 'inbox'}`,
  captureDeleted: (projectId: string | null) => `capture:deleted:${projectId || 'inbox'}`,

  // Task events (scoped by project)
  taskCreated: (projectId: string | null) => `task:created:${projectId || 'inbox'}`,
  taskUpdated: (projectId: string | null) => `task:updated:${projectId || 'inbox'}`,
  taskDeleted: (projectId: string | null) => `task:deleted:${projectId || 'inbox'}`,

  // Project events (global)
  projectCreated: () => 'project:created',
  projectUpdated: () => 'project:updated',
  projectDeleted: () => 'project:deleted'
}

/**
 * Broadcast an event to all open windows
 */
export function broadcastEvent(eventName: string, payload?: any) {
  const windows = BrowserWindow.getAllWindows()
  windows.forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send(eventName, payload)
    }
  })
}

import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'

export type DomainEvent =
  | { type: 'project.created'; projectId: string; name: string }
  | { type: 'project.updated'; projectId: string; name: string }
  | { type: 'project.deleted'; projectId: string }
  | { type: 'capture.created'; captureId: string; projectId: string; captureType: string }
  | { type: 'capture.updated'; captureId: string }
  | { type: 'capture.deleted'; captureId: string }
  | { type: 'task.created'; taskId: string; projectId?: string; title: string }
  | { type: 'task.updated'; taskId: string; status?: string }
  | { type: 'task.deleted'; taskId: string }
  | { type: 'summary.generated'; projectId: string; summaryId: string }
  | { type: 'planning.profile.created'; profileId: string; name: string }
  | { type: 'planning.profile.updated'; profileId: string }
  | { type: 'planning.profile.set_default'; profileId: string }
  | { type: 'planning.profile.deleted'; profileId: string }
  | { type: 'plan.draft.created'; planId: string; date: string }
  | { type: 'plan.draft.discarded'; planId: string; date: string }
  | { type: 'plan.committed'; planId: string; date: string; blockCount: number }
  | { type: 'plan.block.added'; planId: string; blockId: string; kind: string }
  | { type: 'plan.block.updated'; planId: string; blockId: string }
  | { type: 'plan.block.deleted'; planId: string; blockId: string }

/**
 * Domain Event Emitter
 *
 * Central event bus for all domain mutations. Events are:
 * 1. Emitted internally for main process listeners
 * 2. Broadcast to renderer for UI updates
 * 3. Logged for audit trail
 */
class DomainEventEmitter extends EventEmitter {
  private mainWindow: BrowserWindow | null = null

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  /**
   * Emit a domain event
   * This should be called after successful DB mutations
   */
  emitDomainEvent(event: DomainEvent) {
    // Emit for internal listeners (MCP server, job manager, etc.)
    this.emit('domain-event', event)

    // Broadcast to renderer for UI updates
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('domain-event', event)
    }

    // Log for debugging and audit
    console.log('[Domain Event]', event.type, event)
  }
}

export const domainEvents = new DomainEventEmitter()

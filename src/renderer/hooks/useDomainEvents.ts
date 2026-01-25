import { useEffect } from 'react'

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

/**
 * React hook for subscribing to domain events
 *
 * Use this to react to state changes from:
 * - UI actions
 * - Agent/tool actions
 * - Background jobs
 *
 * Example:
 * ```tsx
 * useDomainEvents((event) => {
 *   if (event.type === 'task.created' && event.projectId === currentProjectId) {
 *     refetchTasks()
 *   }
 * })
 * ```
 */
export function useDomainEvents(handler: (event: DomainEvent) => void) {
  useEffect(() => {
    // Subscribe to domain events from main process
    window.electron.onDomainEvent(handler)

    return () => {
      window.electron.offDomainEvent(handler)
    }
  }, [handler])
}

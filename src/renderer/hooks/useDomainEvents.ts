import { useEffect, useRef } from 'react'

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
 * FIXED: Now subscribes ONCE and uses ref to call latest handler.
 * This prevents memory leaks from resubscribing on every render.
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
  // Store the latest handler in a ref
  const handlerRef = useRef(handler)

  // Update ref when handler changes (but don't resubscribe)
  useEffect(() => {
    handlerRef.current = handler
  })

  // Subscribe once on mount with a stable function
  useEffect(() => {
    const stableListener = (event: DomainEvent) => {
      handlerRef.current(event)
    }

    window.electron.onDomainEvent(stableListener)

    return () => {
      window.electron.offDomainEvent(stableListener)
    }
  }, []) // Empty dependency array - subscribe only once
}

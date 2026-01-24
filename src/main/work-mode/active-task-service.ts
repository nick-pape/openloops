import { repository } from '../db/repository'

/**
 * ActiveTaskService manages the currently active task for Work Mode.
 * Active task is persisted in settings and can be retrieved/cleared.
 */
export class ActiveTaskService {
  private static ACTIVE_TASK_KEY = 'active_task_id'

  /**
   * Get the currently active task ID
   */
  async getActiveTaskId(): Promise<string | null> {
    return await repository.getSetting(ActiveTaskService.ACTIVE_TASK_KEY)
  }

  /**
   * Get the full active task object
   */
  async getActiveTask() {
    const taskId = await this.getActiveTaskId()
    console.log('[ActiveTaskService] getActiveTask - taskId:', taskId)
    if (!taskId) return null

    try {
      const task = await repository.getTask(taskId)
      console.log('[ActiveTaskService] getActiveTask - found task:', task)
      return task || null
    } catch (error) {
      console.error('Failed to load active task:', error)
      // Clear invalid task ID
      await this.clearActiveTask()
      return null
    }
  }

  /**
   * Set the active task
   */
  async setActiveTask(taskId: string): Promise<void> {
    console.log('[ActiveTaskService] setActiveTask - taskId:', taskId)
    // Verify task exists
    const task = await repository.getTask(taskId)
    console.log('[ActiveTaskService] setActiveTask - task exists:', !!task)
    if (!task) {
      throw new Error('Task not found')
    }

    await repository.setSetting(ActiveTaskService.ACTIVE_TASK_KEY, taskId)
    console.log('[ActiveTaskService] setActiveTask - setting saved')
  }

  /**
   * Clear the active task
   */
  async clearActiveTask(): Promise<void> {
    await repository.setSetting(ActiveTaskService.ACTIVE_TASK_KEY, '')
  }
}

export const activeTaskService = new ActiveTaskService()

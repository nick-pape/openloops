import { repository } from '../db/repository'
import { domainEvents } from '../events/emitter'
import type {
  CreateProjectInput,
  CreateCaptureInput,
  CreateTaskInput,
  UpdateTaskInput
} from '../db/repository'

/**
 * Domain Commands - Single Mutation Pipeline
 *
 * All state mutations MUST flow through these commands.
 * Commands are responsible for:
 * 1. Calling repository methods
 * 2. Emitting domain events after successful mutations
 * 3. Returning updated entities
 *
 * Read operations can bypass commands and call repository directly.
 */

export class ProjectCommands {
  async createProject(input: CreateProjectInput) {
    const project = await repository.createProject(input)
    domainEvents.emitDomainEvent({
      type: 'project.created',
      projectId: project.id,
      name: project.name
    })
    return project
  }

  async updateProject(id: string, name: string) {
    const project = await repository.updateProject(id, name)
    domainEvents.emitDomainEvent({
      type: 'project.updated',
      projectId: id,
      name
    })
    return project
  }

  async deleteProject(id: string) {
    await repository.deleteProject(id)
    domainEvents.emitDomainEvent({
      type: 'project.deleted',
      projectId: id
    })
  }

  // Read operations - no events
  async getProject(id: string) {
    return repository.getProject(id)
  }

  async listProjects() {
    return repository.getAllProjects()
  }

  async getProjectSummary(projectId: string) {
    return repository.getLatestProjectSummary(projectId)
  }
}

export class CaptureCommands {
  async createCapture(input: CreateCaptureInput) {
    const capture = await repository.createCapture(input)
    domainEvents.emitDomainEvent({
      type: 'capture.created',
      captureId: capture.id,
      projectId: capture.projectId || '',
      captureType: capture.type
    })
    return capture
  }

  async updateCapture(id: string, title: string, bodyText: string) {
    const capture = await repository.updateCapture(id, title, bodyText)
    domainEvents.emitDomainEvent({
      type: 'capture.updated',
      captureId: id
    })
    return capture
  }

  async deleteCapture(id: string) {
    await repository.deleteCapture(id)
    domainEvents.emitDomainEvent({
      type: 'capture.deleted',
      captureId: id
    })
  }

  // Read operations - no events
  async getCapture(id: string) {
    return repository.getCapture(id)
  }

  async searchCaptures(projectId: string, type?: string) {
    const captures = await repository.getCapturesWithFlags(projectId)
    if (type) {
      return captures.filter(c => c.type === type)
    }
    return captures
  }

  async getCapturesByProject(projectId: string) {
    return repository.getCapturesByProject(projectId)
  }

  async getCapturesWithFlags(projectId: string) {
    return repository.getCapturesWithFlags(projectId)
  }

  async toggleCaptureOpenLoop(captureId: string) {
    await repository.toggleCaptureOpenLoop(captureId)
    domainEvents.emitDomainEvent({
      type: 'capture.updated',
      captureId
    })
  }
}

export class TaskCommands {
  async createTask(input: CreateTaskInput) {
    const task = await repository.createTask(input)
    domainEvents.emitDomainEvent({
      type: 'task.created',
      taskId: task.id,
      projectId: task.projectId || undefined,
      title: task.title
    })
    return task
  }

  async updateTask(id: string, input: UpdateTaskInput) {
    const task = await repository.updateTask(id, input)
    domainEvents.emitDomainEvent({
      type: 'task.updated',
      taskId: id,
      status: input.status
    })
    return task
  }

  async deleteTask(id: string) {
    await repository.deleteTask(id)
    domainEvents.emitDomainEvent({
      type: 'task.deleted',
      taskId: id
    })
  }

  // Read operations - no events
  async getTask(id: string) {
    return repository.getTask(id)
  }

  async listTasks(projectId?: string, status?: 'open' | 'done') {
    if (status === 'open') {
      return repository.getOpenTasks(projectId)
    }
    return repository.getAllTasks(projectId)
  }

  async getOpenTasks(projectId?: string) {
    return repository.getOpenTasks(projectId)
  }

  async getAllTasks(projectId?: string) {
    return repository.getAllTasks(projectId)
  }

  async getInboxTasks() {
    return repository.getInboxTasks()
  }
}

export class SummaryCommands {
  async createSummary(projectId: string, summaryMd: string, provider: string, windowStart: Date, windowEnd: Date) {
    const summaryId = await repository.createProjectSummary(projectId, summaryMd, provider, windowStart, windowEnd)
    domainEvents.emitDomainEvent({
      type: 'summary.generated',
      projectId,
      summaryId
    })
    return summaryId
  }

  // Read operations - no events
  async getLatestSummary(projectId: string) {
    return repository.getLatestProjectSummary(projectId)
  }
}

// Export singleton instances
export const projectCommands = new ProjectCommands()
export const captureCommands = new CaptureCommands()
export const taskCommands = new TaskCommands()
export const summaryCommands = new SummaryCommands()

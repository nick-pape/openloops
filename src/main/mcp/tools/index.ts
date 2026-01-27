import { z } from 'zod'
import { projectCommands, captureCommands, taskCommands, plannerCommands, planningProfileCommands } from '../../domain/commands'
import { repository } from '../../db/repository'

/**
 * MCP Tool Registry
 *
 * All tools must:
 * 1. Have a name, description, and Zod input schema
 * 2. Return MCP-compatible content blocks
 * 3. Use domain commands (not repository directly)
 */

// ============================================================================
// Projects Tools
// ============================================================================

export const projectsListTool = {
  name: 'projects_list',
  description: 'List all projects in Open Loops',
  inputSchema: z.object({})
}

export async function projectsList(_args: z.infer<typeof projectsListTool.inputSchema>) {
  const projects = await projectCommands.listProjects()
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(projects, null, 2)
    }]
  }
}

export const projectsGetTool = {
  name: 'projects_get',
  description: 'Get a specific project by ID',
  inputSchema: z.object({
    projectId: z.string().uuid('Invalid project ID format')
  })
}

export async function projectsGet(args: z.infer<typeof projectsGetTool.inputSchema>) {
  const project = await projectCommands.getProject(args.projectId)
  if (!project) {
    throw new Error(`Project ${args.projectId} not found`)
  }
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(project, null, 2)
    }]
  }
}

export const projectsCreateTool = {
  name: 'projects_create',
  description: 'Create a new project',
  inputSchema: z.object({
    name: z.string().min(1, 'Project name is required')
  })
}

export async function projectsCreate(args: z.infer<typeof projectsCreateTool.inputSchema>) {
  const project = await projectCommands.createProject({ name: args.name })
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(project, null, 2)
    }]
  }
}

export const projectsGetSummaryTool = {
  name: 'projects_get_summary',
  description: 'Get the latest AI-generated summary for a project',
  inputSchema: z.object({
    projectId: z.string().uuid('Invalid project ID format')
  })
}

export async function projectsGetSummary(args: z.infer<typeof projectsGetSummaryTool.inputSchema>) {
  const summary = await projectCommands.getProjectSummary(args.projectId)
  if (!summary) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ message: 'No summary found for this project' }, null, 2)
      }]
    }
  }
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(summary, null, 2)
    }]
  }
}

// ============================================================================
// Captures Tools
// ============================================================================

export const capturesSearchTool = {
  name: 'captures_search',
  description: 'Search captures in a project, optionally filter by type',
  inputSchema: z.object({
    projectId: z.string().uuid('Invalid project ID format'),
    type: z.enum(['text', 'image', 'audio', 'chat', 'decision']).optional()
  })
}

export async function capturesSearch(args: z.infer<typeof capturesSearchTool.inputSchema>) {
  const captures = await captureCommands.searchCaptures(args.projectId, args.type)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(captures, null, 2)
    }]
  }
}

export const capturesGetTool = {
  name: 'captures_get',
  description: 'Get a specific capture by ID with full content',
  inputSchema: z.object({
    captureId: z.string().uuid('Invalid capture ID format')
  })
}

export async function capturesGet(args: z.infer<typeof capturesGetTool.inputSchema>) {
  const capture = await captureCommands.getCapture(args.captureId)
  if (!capture) {
    throw new Error(`Capture ${args.captureId} not found`)
  }
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(capture, null, 2)
    }]
  }
}

export const capturesCreateTextTool = {
  name: 'captures_create_text',
  description: 'Create a text capture for a project',
  inputSchema: z.object({
    projectId: z.string().uuid('Invalid project ID format'),
    title: z.string().optional(),
    bodyText: z.string().min(1, 'Body text is required')
  })
}

export async function capturesCreateText(args: z.infer<typeof capturesCreateTextTool.inputSchema>) {
  const capture = await captureCommands.createCapture({
    projectId: args.projectId,
    type: 'text',
    title: args.title || null,
    bodyText: args.bodyText
  })
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(capture, null, 2)
    }]
  }
}

export const capturesCreateDecisionTool = {
  name: 'captures_create_decision',
  description: 'Create a decision capture for a project',
  inputSchema: z.object({
    projectId: z.string().uuid('Invalid project ID format'),
    title: z.string().min(1, 'Decision title is required'),
    bodyText: z.string().min(1, 'Decision body text is required (use markdown bullet list)')
  })
}

export async function capturesCreateDecision(args: z.infer<typeof capturesCreateDecisionTool.inputSchema>) {
  const capture = await captureCommands.createCapture({
    projectId: args.projectId,
    type: 'decision',
    title: args.title,
    bodyText: args.bodyText
  })
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(capture, null, 2)
    }]
  }
}

// ============================================================================
// Tasks Tools
// ============================================================================

export const tasksListTool = {
  name: 'tasks_list',
  description: 'List tasks, optionally filter by project and status',
  inputSchema: z.object({
    projectId: z.string().uuid('Invalid project ID format').optional(),
    status: z.enum(['open', 'done']).optional()
  })
}

export async function tasksList(args: z.infer<typeof tasksListTool.inputSchema>) {
  const tasks = await taskCommands.listTasks(args.projectId, args.status)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(tasks, null, 2)
    }]
  }
}

export const tasksGetTool = {
  name: 'tasks_get',
  description: 'Get a specific task by ID',
  inputSchema: z.object({
    taskId: z.string().uuid('Invalid task ID format')
  })
}

export async function tasksGet(args: z.infer<typeof tasksGetTool.inputSchema>) {
  const task = await taskCommands.getTask(args.taskId)
  if (!task) {
    throw new Error(`Task ${args.taskId} not found`)
  }
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(task, null, 2)
    }]
  }
}

export const tasksCreateTool = {
  name: 'tasks_create',
  description: 'Create a new task',
  inputSchema: z.object({
    projectId: z.string().uuid('Invalid project ID format').optional(),
    title: z.string().min(1, 'Task title is required'),
    notes: z.string().optional(),
    priority: z.number().int().min(1).max(5).optional(),
    estimateMinutes: z.number().int().positive().optional()
  })
}

export async function tasksCreate(args: z.infer<typeof tasksCreateTool.inputSchema>) {
  const task = await taskCommands.createTask({
    projectId: args.projectId,
    title: args.title,
    notes: args.notes,
    priority: args.priority,
    estimateMinutes: args.estimateMinutes
  })
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(task, null, 2)
    }]
  }
}

export const tasksUpdateTool = {
  name: 'tasks_update',
  description: 'Update a task',
  inputSchema: z.object({
    taskId: z.string().uuid('Invalid task ID format'),
    title: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(['open', 'done']).optional(),
    priority: z.number().int().min(1).max(5).optional(),
    estimateMinutes: z.number().int().positive().optional()
  })
}

export async function tasksUpdate(args: z.infer<typeof tasksUpdateTool.inputSchema>) {
  const { taskId, ...updates } = args
  const task = await taskCommands.updateTask(taskId, updates)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(task, null, 2)
    }]
  }
}

// ============================================================================
// Tool Registry (for MCP server)
// ============================================================================

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: z.ZodSchema<any>
}

export interface ToolEntry {
  definition: ToolDefinition
  handler: (args: any) => Promise<{ content: Array<{ type: 'text'; text: string }> }>
}

export const allTools: ToolEntry[] = [
  // Projects
  { definition: projectsListTool, handler: projectsList },
  { definition: projectsGetTool, handler: projectsGet },
  { definition: projectsCreateTool, handler: projectsCreate },
  { definition: projectsGetSummaryTool, handler: projectsGetSummary },

  // Captures
  { definition: capturesSearchTool, handler: capturesSearch },
  { definition: capturesGetTool, handler: capturesGet },
  { definition: capturesCreateTextTool, handler: capturesCreateText },
  { definition: capturesCreateDecisionTool, handler: capturesCreateDecision },

  // Tasks
  { definition: tasksListTool, handler: tasksList },
  { definition: tasksGetTool, handler: tasksGet },
  { definition: tasksCreateTool, handler: tasksCreate },
  { definition: tasksUpdateTool, handler: tasksUpdate },
  { definition: tasksListCandidatesForDayTool, handler: tasksListCandidatesForDay },

  // Calendar
  { definition: calendarDayEventsGetTool, handler: calendarDayEventsGet },

  // Planning Profiles
  { definition: planningProfilesListTool, handler: planningProfilesList },
  { definition: planningProfilesGetTool, handler: planningProfilesGet },
  { definition: planningProfilesCreateTool, handler: planningProfilesCreate },
  { definition: planningProfilesUpdateTool, handler: planningProfilesUpdate },
  { definition: planningProfilesDeleteTool, handler: planningProfilesDelete },

  // Planner - Draft Lifecycle
  { definition: plannerDayGetTool, handler: plannerDayGet },
  { definition: plannerDraftCreateTool, handler: plannerDraftCreate },
  { definition: plannerDraftGetTool, handler: plannerDraftGet },
  { definition: plannerDraftDiscardTool, handler: plannerDraftDiscard },

  // Planner - Block Primitives
  { definition: plannerBlockAddTool, handler: plannerBlockAdd },
  { definition: plannerBlockUpdateTool, handler: plannerBlockUpdate },
  { definition: plannerBlockMoveTool, handler: plannerBlockMove },
  { definition: plannerBlockDeleteTool, handler: plannerBlockDelete },

  // Planner - Validation & Commit
  { definition: plannerDraftValidateTool, handler: plannerDraftValidate },
  { definition: plannerDraftCommitTool, handler: plannerDraftCommit }
]

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

export const getCapturesTool = {
  name: 'get_captures',
  description: 'Get captures in a project with optional filters (text search, type, date range). Returns metadata only - use get_capture_by_id for full content.',
  inputSchema: z.object({
    projectId: z.string().uuid('Invalid project ID format'),
    query: z.string().optional().describe('Text search on title and body content'),
    type: z.enum(['text', 'image', 'audio', 'chat', 'decision', 'link']).optional(),
    startDate: z.string().datetime().optional().describe('Filter captures created after this date'),
    endDate: z.string().datetime().optional().describe('Filter captures created before this date')
  })
}

export async function getCaptures(args: z.infer<typeof getCapturesTool.inputSchema>) {
  console.log('[MCP] get_captures called with:', JSON.stringify(args, null, 2))
  const captures = await captureCommands.searchCaptures(
    args.projectId,
    args.type,
    args.query,
    args.startDate ? new Date(args.startDate) : undefined,
    args.endDate ? new Date(args.endDate) : undefined
  )

  // Return metadata only - not full content
  const metadata = captures.map(c => ({
    id: c.id,
    title: c.title,
    type: c.type,
    tags: c.tags,
    createdAt: c.createdAt
  }))

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(metadata, null, 2)
    }]
  }
}

export const getCaptureByIdTool = {
  name: 'get_capture_by_id',
  description: 'Get a specific capture by ID with full content (title, bodyText, filePath, etc.)',
  inputSchema: z.object({
    captureId: z.string().uuid('Invalid capture ID format')
  })
}

export async function getCaptureById(args: z.infer<typeof getCaptureByIdTool.inputSchema>) {
  console.log('[MCP] get_capture_by_id called with:', JSON.stringify(args, null, 2))
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
  console.log('[MCP] captures_create_text called with:', JSON.stringify({ projectId: args.projectId, title: args.title, bodyTextLength: args.bodyText.length }, null, 2))
  const capture = await captureCommands.createCapture({
    projectId: args.projectId,
    type: 'text',
    title: args.title || null,
    bodyText: args.bodyText
  })

  // Return simplified response
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: true,
        captureId: capture.id,
        title: capture.title || 'Untitled',
        type: capture.type,
        message: 'Text capture created successfully'
      }, null, 2)
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
  console.log('[MCP] captures_create_decision called with:', JSON.stringify({ projectId: args.projectId, title: args.title, bodyTextLength: args.bodyText.length }, null, 2))
  const capture = await captureCommands.createCapture({
    projectId: args.projectId,
    type: 'decision',
    title: args.title,
    bodyText: args.bodyText
  })

  // Return simplified response
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: true,
        captureId: capture.id,
        title: capture.title,
        type: capture.type,
        message: 'Decision capture created successfully'
      }, null, 2)
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

export const tasksListCandidatesForDayTool = {
  name: 'tasks_list_candidates_for_day',
  description: 'List open tasks suitable for scheduling on a specific day, ranked by priority and due date',
  inputSchema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
    limit: z.number().int().positive().optional()
  })
}

export async function tasksListCandidatesForDay(args: z.infer<typeof tasksListCandidatesForDayTool.inputSchema>) {
  const allTasks = await taskCommands.getOpenTasks()
  const dayDate = new Date(args.date)

  // Simple ranking: due date proximity, then priority
  const ranked = allTasks
    .map(task => {
      let score = task.priority // Higher priority = higher score

      if (task.dueDate) {
        const daysUntilDue = Math.floor((new Date(task.dueDate).getTime() - dayDate.getTime()) / (1000 * 60 * 60 * 24))
        // Urgent tasks (due soon) get bonus points
        if (daysUntilDue <= 0) score += 10 // Overdue
        else if (daysUntilDue <= 1) score += 5 // Due today/tomorrow
        else if (daysUntilDue <= 7) score += 2 // Due this week
      }

      return { task, score }
    })
    .sort((a, b) => b.score - a.score)
    .map(item => item.task)

  const result = args.limit ? ranked.slice(0, args.limit) : ranked

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(result, null, 2)
    }]
  }
}

// ============================================================================
// Calendar Tools (for planner)
// ============================================================================

export const calendarDayEventsGetTool = {
  name: 'calendar_day_events_get',
  description: 'Get calendar events for a specific day (YYYY-MM-DD format)',
  inputSchema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  })
}

export async function calendarDayEventsGet(args: z.infer<typeof calendarDayEventsGetTool.inputSchema>) {
  const date = new Date(args.date)
  const events = await repository.getCalendarEventsForDate(date)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(events, null, 2)
    }]
  }
}

// ============================================================================
// Planning Profiles Tools
// ============================================================================

export const planningProfilesListTool = {
  name: 'planning_profiles_list',
  description: 'List all planning profiles (reusable planning instructions)',
  inputSchema: z.object({})
}

export async function planningProfilesList(_args: z.infer<typeof planningProfilesListTool.inputSchema>) {
  const profiles = await planningProfileCommands.listProfiles()
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(profiles, null, 2)
    }]
  }
}

export const planningProfilesGetTool = {
  name: 'planning_profiles_get',
  description: 'Get a specific planning profile by ID',
  inputSchema: z.object({
    profileId: z.string().uuid('Invalid profile ID format')
  })
}

export async function planningProfilesGet(args: z.infer<typeof planningProfilesGetTool.inputSchema>) {
  const profile = await planningProfileCommands.getProfile(args.profileId)
  if (!profile) {
    throw new Error(`Planning profile ${args.profileId} not found`)
  }
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(profile, null, 2)
    }]
  }
}

export const planningProfilesCreateTool = {
  name: 'planning_profiles_create',
  description: 'Create a new planning profile with instructions and constraints',
  inputSchema: z.object({
    name: z.string().min(1, 'Profile name is required'),
    instructionsText: z.string().min(1, 'Instructions text is required'),
    constraintsJson: z.string().optional()
  })
}

export async function planningProfilesCreate(args: z.infer<typeof planningProfilesCreateTool.inputSchema>) {
  const profile = await planningProfileCommands.createProfile(args.name, args.instructionsText, args.constraintsJson)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(profile, null, 2)
    }]
  }
}

export const planningProfilesUpdateTool = {
  name: 'planning_profiles_update',
  description: 'Update an existing planning profile',
  inputSchema: z.object({
    profileId: z.string().uuid('Invalid profile ID format'),
    name: z.string().min(1, 'Profile name is required'),
    instructionsText: z.string().min(1, 'Instructions text is required'),
    constraintsJson: z.string().optional()
  })
}

export async function planningProfilesUpdate(args: z.infer<typeof planningProfilesUpdateTool.inputSchema>) {
  const profile = await planningProfileCommands.updateProfile(
    args.profileId,
    args.name,
    args.instructionsText,
    args.constraintsJson
  )
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(profile, null, 2)
    }]
  }
}

export const planningProfilesDeleteTool = {
  name: 'planning_profiles_delete',
  description: 'Delete a planning profile',
  inputSchema: z.object({
    profileId: z.string().uuid('Invalid profile ID format')
  })
}

export async function planningProfilesDelete(args: z.infer<typeof planningProfilesDeleteTool.inputSchema>) {
  await planningProfileCommands.deleteProfile(args.profileId)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ success: true, message: 'Profile deleted' }, null, 2)
    }]
  }
}

// ============================================================================
// Planner Tools - Draft Plan Lifecycle
// ============================================================================

export const plannerDayGetTool = {
  name: 'planner_day_get',
  description: 'Get plan information for a specific day (draft or committed)',
  inputSchema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  })
}

export async function plannerDayGet(args: z.infer<typeof plannerDayGetTool.inputSchema>) {
  const plan = await plannerCommands.getDayPlan(args.date)
  if (!plan) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ message: 'No plan found for this date' }, null, 2)
      }]
    }
  }
  const blocks = await plannerCommands.getPlanBlocks(plan.id)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ plan, blocks }, null, 2)
    }]
  }
}

export const plannerDraftCreateTool = {
  name: 'planner_draft_create',
  description: 'Create a new draft plan for a day. Deletes existing draft if present.',
  inputSchema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
    planningProfileId: z.string().uuid('Invalid profile ID format').optional()
  })
}

export async function plannerDraftCreate(args: z.infer<typeof plannerDraftCreateTool.inputSchema>) {
  const planId = await plannerCommands.createDraft(args.date, args.planningProfileId)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ planId, date: args.date, status: 'draft' }, null, 2)
    }]
  }
}

export const plannerDraftGetTool = {
  name: 'planner_draft_get',
  description: 'Get the draft plan for a specific day',
  inputSchema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  })
}

export async function plannerDraftGet(args: z.infer<typeof plannerDraftGetTool.inputSchema>) {
  const result = await plannerCommands.getDraft(args.date)
  if (!result) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ message: 'No draft plan found for this date' }, null, 2)
      }]
    }
  }
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(result, null, 2)
    }]
  }
}

export const plannerDraftDiscardTool = {
  name: 'planner_draft_discard',
  description: 'Discard the draft plan for a specific day',
  inputSchema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  })
}

export async function plannerDraftDiscard(args: z.infer<typeof plannerDraftDiscardTool.inputSchema>) {
  await plannerCommands.discardDraft(args.date)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ success: true, message: 'Draft plan discarded' }, null, 2)
    }]
  }
}

// ============================================================================
// Planner Tools - Block Primitives
// ============================================================================

export const plannerBlockAddTool = {
  name: 'planner_block_add',
  description: 'Add a time block to a draft plan. Times should be in LOCAL timezone (will be converted to UTC automatically).',
  inputSchema: z.object({
    draftPlanId: z.string().uuid('Invalid plan ID format'),
    start: z.string().describe('Start time in ISO format WITHOUT timezone (e.g., "2026-01-29T09:00:00"). Uses local timezone.'),
    end: z.string().describe('End time in ISO format WITHOUT timezone (e.g., "2026-01-29T17:00:00"). Uses local timezone.'),
    title: z.string().min(1, 'Title is required'),
    kind: z.enum(['calendar_fixed', 'task', 'focus', 'break', 'buffer', 'admin']),
    locked: z.boolean().default(false),
    taskId: z.string().uuid('Invalid task ID format').optional(),
    notes: z.string().optional()
  })
}

export async function plannerBlockAdd(args: z.infer<typeof plannerBlockAddTool.inputSchema>) {
  const blockId = await plannerCommands.addBlock(
    args.draftPlanId,
    new Date(args.start),
    new Date(args.end),
    args.title,
    args.kind,
    args.locked,
    undefined,
    args.taskId,
    args.notes
  )
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ blockId, message: 'Block added successfully' }, null, 2)
    }]
  }
}

export const plannerBlockUpdateTool = {
  name: 'planner_block_update',
  description: 'Update a time block in a draft plan. Times should be in LOCAL timezone (will be converted to UTC automatically).',
  inputSchema: z.object({
    blockId: z.string().uuid('Invalid block ID format'),
    start: z.string().describe('Start time in ISO format WITHOUT timezone. Uses local timezone.').optional(),
    end: z.string().describe('End time in ISO format WITHOUT timezone. Uses local timezone.').optional(),
    title: z.string().optional(),
    kind: z.enum(['calendar_fixed', 'task', 'focus', 'break', 'buffer', 'admin']).optional(),
    locked: z.boolean().optional(),
    taskId: z.string().uuid('Invalid task ID format').optional(),
    notes: z.string().optional()
  })
}

export async function plannerBlockUpdate(args: z.infer<typeof plannerBlockUpdateTool.inputSchema>) {
  const updates: any = {}
  if (args.start !== undefined) updates.startDt = new Date(args.start)
  if (args.end !== undefined) updates.endDt = new Date(args.end)
  if (args.title !== undefined) updates.label = args.title
  if (args.kind !== undefined) updates.kind = args.kind
  if (args.locked !== undefined) updates.locked = args.locked
  if (args.taskId !== undefined) updates.linkedTaskId = args.taskId
  if (args.notes !== undefined) updates.notes = args.notes

  const block = await plannerCommands.updateBlock(args.blockId, updates)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(block, null, 2)
    }]
  }
}

export const plannerBlockMoveTool = {
  name: 'planner_block_move',
  description: 'Move a time block to a new time slot. Times should be in LOCAL timezone (will be converted to UTC automatically).',
  inputSchema: z.object({
    blockId: z.string().uuid('Invalid block ID format'),
    start: z.string().describe('Start time in ISO format WITHOUT timezone. Uses local timezone.'),
    end: z.string().describe('End time in ISO format WITHOUT timezone. Uses local timezone.')
  })
}

export async function plannerBlockMove(args: z.infer<typeof plannerBlockMoveTool.inputSchema>) {
  const block = await plannerCommands.moveBlock(
    args.blockId,
    new Date(args.start),
    new Date(args.end)
  )
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(block, null, 2)
    }]
  }
}

export const plannerBlockDeleteTool = {
  name: 'planner_block_delete',
  description: 'Delete a time block from a draft plan',
  inputSchema: z.object({
    blockId: z.string().uuid('Invalid block ID format')
  })
}

export async function plannerBlockDelete(args: z.infer<typeof plannerBlockDeleteTool.inputSchema>) {
  await plannerCommands.deleteBlock(args.blockId)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ success: true, message: 'Block deleted' }, null, 2)
    }]
  }
}

// ============================================================================
// Planner Tools - Validation & Commit
// ============================================================================

export const plannerDraftValidateTool = {
  name: 'planner_draft_validate',
  description: 'Validate a draft plan for overlaps, conflicts, and constraint violations',
  inputSchema: z.object({
    draftPlanId: z.string().uuid('Invalid plan ID format')
  })
}

export async function plannerDraftValidate(args: z.infer<typeof plannerDraftValidateTool.inputSchema>) {
  const validation = await plannerCommands.validateDraft(args.draftPlanId)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(validation, null, 2)
    }]
  }
}

export const plannerDraftCommitTool = {
  name: 'planner_draft_commit',
  description: 'Commit a draft plan (validates and marks as committed, preventing further changes)',
  inputSchema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  })
}

export async function plannerDraftCommit(args: z.infer<typeof plannerDraftCommitTool.inputSchema>) {
  const planId = await plannerCommands.commitDraft(args.date)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ success: true, planId, message: 'Plan committed successfully' }, null, 2)
    }]
  }
}

export const plannerDraftUncommitTool = {
  name: 'planner_draft_uncommit',
  description: 'Revert a committed plan back to draft status (allows editing a committed plan)',
  inputSchema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  })
}

export async function plannerDraftUncommit(args: z.infer<typeof plannerDraftUncommitTool.inputSchema>) {
  const planId = await plannerCommands.uncommitDraft(args.date)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ success: true, planId, message: 'Plan reverted to draft status' }, null, 2)
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
  { definition: getCapturesTool, handler: getCaptures },
  { definition: getCaptureByIdTool, handler: getCaptureById },
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
  { definition: plannerDraftCommitTool, handler: plannerDraftCommit },
  { definition: plannerDraftUncommitTool, handler: plannerDraftUncommit }
]

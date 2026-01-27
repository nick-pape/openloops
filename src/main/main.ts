import { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut } from 'electron'
import path from 'path'
import fs from 'fs'
import { initDatabase, closeDatabase } from './db/database'
import { repository } from './db/repository'
import { activeTaskService } from './work-mode/active-task-service'
import { workModeWindow } from './windows/work-mode-window'
import { textCaptureWindow } from './windows/text-capture-window'
import { jobManager } from './workers/job-manager'
import { parseICSFile } from './planning/ics-parser'
import { DayPlanner } from './planning/day-planner'
import { screenshotHandler } from './screenshot/screenshot-handler'
import { ProviderFactory } from './ai/providers'
import { domainEvents } from './events/emitter'
import { projectCommands, captureCommands, taskCommands, summaryCommands } from './domain/commands'
import { allTools } from './mcp/tools/index'
import { createMCPServer } from './mcp/server'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { startHTTPTransport, stopHTTPTransport, isHTTPTransportRunning } from './mcp/http-transport'
import { initLogger, closeLogger, logger } from './logger'
import { ModelMessage } from '@ai-sdk/provider-utils'
import { createAiSdkModel } from './llm/aiSdkClient'
import { runAgentStream } from './ai/agent/openLoopsAgent'
import { closeAllClients as closeMcpClients } from './mcp/registry/clientPool'

// Track active chat streams for cancellation
const activeChatStreams = new Map<string, AbortController>()

let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Global error handlers - catch uncaught exceptions and show user-friendly errors
process.on('uncaughtException', (error) => {
  logger.error('[Uncaught Exception]', error)

  // Show user-friendly error notification instead of crashing
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:error', {
      title: 'An error occurred',
      message: error.message,
      details: error.stack
    })
  }

  // Don't exit in dev mode to make debugging easier
  if (!isDev) {
    // Give time for the error to be logged and shown
    setTimeout(() => {
      app.quit()
    }, 1000)
  }
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[Unhandled Rejection]', 'Promise:', promise, 'Reason:', reason)

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:error', {
      title: 'An error occurred',
      message: String(reason),
      details: reason instanceof Error ? reason.stack : undefined
    })
  }
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: '🤹‍♂️ Open Loops',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  // Set main window reference for job manager to emit events
  jobManager.setMainWindow(mainWindow)

  // Set main window reference for domain events
  domainEvents.setMainWindow(mainWindow)

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    jobManager.setMainWindow(null)
    domainEvents.setMainWindow(null)
    mainWindow = null
  })
}

function createMenu() {
  const template: any[] = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ]

  // Add app menu on macOS
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(async () => {
  // Initialize file logger FIRST before anything else (before MCP redirects stdio)
  initLogger()
  logger.info('[App] Starting Open Loops...')

  initDatabase()
  await jobManager.start()

  // Start MCP stdio server (Phase 3)
  // NOTE: This redirects stdout/stderr for JSON-RPC, so we must use logger.* instead of console.log
  logger.info('[MCP] Starting MCP stdio server...')
  const mcpServer = createMCPServer()
  const transport = new StdioServerTransport()
  await mcpServer.connect(transport)
  logger.info('[MCP] MCP stdio server started - ready for tool calls')

  // Start MCP HTTP transport if enabled (Phase 4)
  try {
    const httpEnabled = await repository.getSetting('mcp.http.enabled')
    const httpPort = await repository.getSetting('mcp.http.port')
    const httpAuthToken = await repository.getSetting('mcp.http.authToken')

    if (httpEnabled === 'true') {
      await startHTTPTransport({
        enabled: true,
        port: httpPort ? parseInt(httpPort) : 3000,
        authToken: httpAuthToken || undefined
      })
    }
  } catch (error) {
    logger.error('[MCP HTTP] Failed to start HTTP transport:', error)
  }

  setupIPC()
  createMenu()
  createWindow()

  // Register global hotkey for image upload (Ctrl+Shift+U)
  // Note: Ctrl+Shift+I is reserved for DevTools
  const success = globalShortcut.register('CommandOrControl+Shift+U', () => {
    console.log('[Global Hotkey] Image upload triggered (Ctrl+Shift+U)')

    if (mainWindow) {
      // Bring app to foreground
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()

      // Trigger image upload via IPC
      mainWindow.webContents.send('trigger-image-upload')
    }
  })

  if (!success) {
    console.error('[Global Hotkey] Failed to register Ctrl+Shift+U')
  } else {
    console.log('[Global Hotkey] Registered Ctrl+Shift+U for image upload')
  }

  // Register global hotkey for screenshot (Ctrl+Shift+S)
  const screenshotSuccess = globalShortcut.register('CommandOrControl+Shift+S', () => {
    console.log('[Global Hotkey] Screenshot triggered (Ctrl+Shift+S)')

    if (mainWindow) {
      // Bring app to foreground
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()

      // Trigger screenshot via IPC
      mainWindow.webContents.send('trigger-screenshot')
    }
  })

  if (!screenshotSuccess) {
    console.error('[Global Hotkey] Failed to register Ctrl+Shift+S')
  } else {
    console.log('[Global Hotkey] Registered Ctrl+Shift+S for screenshot')
  }

  // Register global hotkey for Work Mode (Ctrl+Shift+W)
  const workModeSuccess = globalShortcut.register('CommandOrControl+Shift+W', () => {
    console.log('[Global Hotkey] Work Mode toggle triggered (Ctrl+Shift+W)')
    workModeWindow.toggle()
  })

  if (!workModeSuccess) {
    console.error('[Global Hotkey] Failed to register Ctrl+Shift+W')
  } else {
    console.log('[Global Hotkey] Registered Ctrl+Shift+W for Work Mode')
  }

  // Register global hotkey for Text Capture (Ctrl+Shift+T)
  const textCaptureSuccess = globalShortcut.register('CommandOrControl+Shift+T', () => {
    console.log('[Global Hotkey] Text capture triggered (Ctrl+Shift+T)')
    textCaptureWindow.create()
  })

  if (!textCaptureSuccess) {
    console.error('[Global Hotkey] Failed to register Ctrl+Shift+T')
  } else {
    console.log('[Global Hotkey] Registered Ctrl+Shift+T for text capture')
  }

  // Register global hotkey for Audio Recording (Ctrl+Shift+V for Voice)
  const audioRecordSuccess = globalShortcut.register('CommandOrControl+Shift+V', () => {
    console.log('[Global Hotkey] Audio recording triggered (Ctrl+Shift+V)')
    // Send event to Work Mode window if open
    if (workModeWindow.isOpen()) {
      // TODO: Implement audio recording trigger
      console.log('[Global Hotkey] Work Mode is open, audio recording not yet implemented')
    } else {
      console.log('[Global Hotkey] Work Mode not open, audio recording requires Work Mode')
    }
  })

  if (!audioRecordSuccess) {
    console.error('[Global Hotkey] Failed to register Ctrl+Shift+V')
  } else {
    console.log('[Global Hotkey] Registered Ctrl+Shift+V for audio recording')
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    jobManager.stop()
    closeDatabase()
    closeLogger()
    app.quit()
  }
})

app.on('before-quit', async () => {
  globalShortcut.unregisterAll()
  screenshotHandler.cleanup()
  jobManager.stop()
  await closeMcpClients()
  closeDatabase()
  closeLogger()
})

/**
 * Helper function to save an image buffer to disk
 */
async function saveImageFromBuffer(projectId: string, buffer: Buffer, extension: string): Promise<string> {
  const userDataPath = app.getPath('userData')
  const imagesDir = path.join(userDataPath, 'app-data', 'images', projectId)

  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true })
  }

  const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`
  const filePath = path.join(imagesDir, filename)

  fs.writeFileSync(filePath, buffer)

  return filePath
}

function setupIPC() {
  // Projects
  ipcMain.handle('projects:getAll', async () => {
    return repository.getAllProjects()
  })

  ipcMain.handle('projects:get', async (_, id: string) => {
    return repository.getProject(id)
  })

  ipcMain.handle('projects:create', async (_, name: string) => {
    return projectCommands.createProject({ name })
  })

  ipcMain.handle('projects:update', async (_, id: string, name: string) => {
    return projectCommands.updateProject(id, name)
  })

  ipcMain.handle('projects:delete', async (_, id: string) => {
    await projectCommands.deleteProject(id)
  })

  // MCP Tool Test Handler (for Phase 2 testing)
  ipcMain.handle('mcp:callTool', async (_, toolName: string, args: any) => {
    console.log(`[MCP Test] Calling tool: ${toolName}`, args)
    const toolEntry = allTools.find(t => t.definition.name === toolName)

    if (!toolEntry) {
      throw new Error(`Unknown tool: ${toolName}`)
    }

    try {
      // Validate with Zod
      const validatedArgs = toolEntry.definition.inputSchema.parse(args)

      // Execute tool
      const result = await toolEntry.handler(validatedArgs)
      console.log(`[MCP Test] Tool ${toolName} completed`)

      return result
    } catch (error) {
      console.error(`[MCP Test] Tool ${toolName} error:`, error)
      throw error
    }
  })

  // Captures
  ipcMain.handle('captures:getByProject', async (_, projectId: string) => {
    return repository.getCapturesWithFlags(projectId)
  })

  ipcMain.handle('captures:create', async (_, input: any) => {
    return captureCommands.createCapture(input)
  })

  ipcMain.handle('captures:toggleOpenLoop', async (_, captureId: string) => {
    await captureCommands.toggleCaptureOpenLoop(captureId)
  })

  ipcMain.handle('captures:update', async (_, id: string, title: string, bodyText: string) => {
    return captureCommands.updateCapture(id, title, bodyText)
  })

  ipcMain.handle('captures:delete', async (_, id: string) => {
    await captureCommands.deleteCapture(id)
  })

  ipcMain.handle('captures:getTranscription', async (_, captureId: string) => {
    return repository.getTranscriptionByCapture(captureId)
  })

  // File operations
  ipcMain.handle('files:saveImage', async (_, projectId: string, arrayBuffer: ArrayBuffer, extension: string) => {
    const userDataPath = app.getPath('userData')
    const imagesDir = path.join(userDataPath, 'app-data', 'images', projectId)

    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true })
    }

    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`
    const filePath = path.join(imagesDir, filename)

    fs.writeFileSync(filePath, Buffer.from(arrayBuffer))

    return filePath
  })

  ipcMain.handle('files:saveAudio', async (_, projectId: string, arrayBuffer: ArrayBuffer) => {
    const userDataPath = app.getPath('userData')
    const audioDir = path.join(userDataPath, 'app-data', 'audio', projectId)

    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true })
    }

    const filename = `${Date.now()}.webm`
    const filePath = path.join(audioDir, filename)

    fs.writeFileSync(filePath, Buffer.from(arrayBuffer))

    return filePath
  })

  ipcMain.handle('files:readImage', async (_, filePath: string) => {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found')
    }

    const buffer = fs.readFileSync(filePath)
    return buffer.buffer
  })

  ipcMain.handle('files:readAudio', async (_, filePath: string) => {
    if (!fs.existsSync(filePath)) {
      throw new Error('Audio file not found')
    }

    const buffer = fs.readFileSync(filePath)
    return buffer.buffer
  })

  ipcMain.handle('files:selectImage', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
      }]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const filePath = result.filePaths[0]

    // Read the file and return both path and buffer
    const buffer = fs.readFileSync(filePath)
    const filename = path.basename(filePath)

    return {
      filePath,
      filename,
      buffer: buffer.buffer // Return ArrayBuffer
    }
  })

  // Audio transcription
  ipcMain.handle('audio:requestTranscription', async (_, captureId: string, audioFilePath: string) => {
    const transcriptionId = await repository.createTranscription(captureId, 'pending')
    const jobId = await jobManager.enqueueTranscription(captureId, audioFilePath)

    // Emit event to renderer with newly created job
    const job = await repository.getJob(jobId)
    if (job && mainWindow) {
      mainWindow.webContents.send('job:updated', job)
    }

    return transcriptionId
  })

  // Image description
  ipcMain.handle('images:requestDescription', async (_, captureId: string, imagePath: string) => {
    console.log('[Images] Requesting description for capture:', captureId)

    try {
      // Import sharp dynamically (only in main process, not worker)
      const sharp = require('sharp')

      // Resize image BEFORE enqueueing job
      console.log('[Images] Resizing image...')
      const originalSize = fs.statSync(imagePath).size

      const resizedBuffer = await sharp(imagePath)
        .resize(768, 768, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .toFormat('jpeg', { quality: 85 })
        .toBuffer()

      console.log('[Images] Original size:', originalSize, 'bytes')
      console.log('[Images] Resized size:', resizedBuffer.length, 'bytes')

      // Save resized image to temp location
      const resizedPath = imagePath.replace(/\.[^.]+$/, '_resized.jpg')
      fs.writeFileSync(resizedPath, resizedBuffer)

      // Enqueue job with resized image path
      const jobId = await jobManager.enqueueImageDescription(captureId, resizedPath)
      console.log('[Images] Image description job enqueued')

      // Emit event to renderer with newly created job
      const job = await repository.getJob(jobId)
      if (job && mainWindow) {
        mainWindow.webContents.send('job:updated', job)
      }
    } catch (error: any) {
      console.error('[Images] Failed to resize image:', error)
      throw new Error(`Failed to prepare image for description: ${error.message}`)
    }
  })

  // Screenshot capture
  ipcMain.handle('screenshot:snip', async (_, projectId: string) => {
    console.log('[Screenshot] Initiating Snipping Tool capture for project:', projectId)

    try {
      const result = await screenshotHandler.captureWithSnippingTool()

      if (!result) {
        console.log('[Screenshot] Capture cancelled or timed out')
        return null
      }

      console.log('[Screenshot] Screenshot captured, saving...')

      // Save screenshot to disk
      const filePath = await saveImageFromBuffer(projectId, result.buffer, result.extension)
      console.log('[Screenshot] Saved to:', filePath)

      return {
        filePath,
        metadata: result.metadata
      }
    } catch (error) {
      console.error('[Screenshot] Capture failed:', error)
      throw error
    }
  })

  ipcMain.handle('screenshot:getSources', async () => {
    console.log('[Screenshot] Getting desktop sources...')

    try {
      const sources = await screenshotHandler.getDesktopSources()
      console.log('[Screenshot] Found', sources.length, 'sources')
      return sources
    } catch (error) {
      console.error('[Screenshot] Failed to get sources:', error)
      throw error
    }
  })

  ipcMain.handle('screenshot:captureSource', async (_, sourceId: string, _projectId: string, sourceName: string) => {
    console.log('[Screenshot] Capture requested for source:', sourceId)

    // Note: Actual capture happens in renderer using getUserMedia
    // This handler is reserved for future use if we need to process the capture in main process
    return {
      sourceId,
      sourceName
    }
  })

  // Project summaries
  ipcMain.handle('summaries:getLatest', async (_, projectId: string) => {
    return repository.getLatestProjectSummary(projectId)
  })

  ipcMain.handle('summaries:generate', async (_, projectId: string) => {
    console.log('=== Summary Generation Started ===')
    console.log('Project ID:', projectId)

    try {
      // Get captures and tasks for the last 14 days
      const captures = await repository.getCapturesByProject(projectId)
      const tasks = await repository.getOpenTasks(projectId)

      console.log(`Found ${captures.length} captures and ${tasks.length} tasks`)

      // Build context
      let context = `Project captures from last 14 days:\n\n`
      for (const capture of captures.slice(0, 20)) {
        context += `- Capture: ${capture.title} (${capture.type})\n`
        if (capture.bodyText) {
          context += `  ${capture.bodyText.substring(0, 200)}\n`
        }
      }

      context += `\n\nOpen tasks:\n\n`
      for (const task of tasks) {
        context += `- Task: ${task.title} (Priority: ${task.priority}, Estimate: ${task.estimateMinutes}min)\n`
        if (task.notes) {
          context += `  ${task.notes.substring(0, 200)}\n`
        }
      }

      console.log('Context length:', context.length, 'characters')

      const prompt = `You are helping summarize a project. Based on the recent captures and open tasks, create a markdown summary with:
1. What's going on (brief overview)
2. Current open loops (active work items)
3. Recent decisions or notes
4. Next 3 likely actions

Keep it concise and actionable.`

      console.log('Enqueueing summary job...')
      const jobId = await jobManager.enqueueSummary(projectId, context, prompt)
      console.log('Summary job enqueued successfully')

      // Emit event to renderer with newly created job
      const job = await repository.getJob(jobId)
      if (job && mainWindow) {
        mainWindow.webContents.send('job:updated', job)
      }
    } catch (error) {
      console.error('Error in summaries:generate handler:', error)
      throw error
    }
  })

  // Chat - uses AI SDK agent with MCP tools and streaming (context-aware)
  ipcMain.handle('chat:send', async (event, messages: any[], context: any, streamId: string) => {
    console.log('[Chat] Starting agent chat, context:', context.active.type, 'streamId:', streamId)

    try {
      // Get LLM config from settings
      const llmType = await repository.getSetting('llm_type') || 'disabled'
      const baseUrl = await repository.getSetting('llm_base_url') || 'https://api.openai.com/v1'
      const apiKey = await repository.getSetting('secret_llm_api_key') || ''
      const modelName = await repository.getSetting('llm_model') || 'gpt-4o-mini'

      // Check if LLM is disabled
      if (llmType === 'disabled') {
        return {
          role: 'assistant',
          content: 'LLM is disabled. Please configure an LLM provider in Settings.',
          timestamp: new Date().toISOString()
        }
      }

      // Build system prompt based on context type
      let systemPrompt = `You are an assistant for Open Loops.\n\n`

      // Add general context
      if (context.general.projects.length > 0) {
        systemPrompt += `Projects in workspace: ${context.general.projects.map((p: any) => p.name).join(', ')}\n`
      }
      systemPrompt += `Total open tasks: ${context.general.openTaskCount}\n\n`

      // Add active context based on type
      switch (context.active.type) {
        case 'project': {
          const projectId = context.active.data.projectId
          const project = await repository.getProject(projectId)
          const allCaptures = await repository.getCapturesByProject(projectId)
          const recentCaptures = allCaptures.filter((c: any) => c.type !== 'chat').slice(0, 5)

          systemPrompt += `Current Context: Project "${project.name}"\n`
          systemPrompt += `Project ID: ${projectId}\n`
          systemPrompt += `Created: ${project.createdAt.toLocaleDateString()}\n`
          if (recentCaptures.length > 0) {
            systemPrompt += `Recent captures: ${recentCaptures.map((c: any) => c.title || 'Untitled').join(', ')}\n`
          }
          systemPrompt += `Open tasks in this project: ${context.active.data.openTaskCount}\n\n`
          systemPrompt += `When creating/modifying, use project ID: ${projectId}\n`
          break
        }
        case 'planner': {
          const today = new Date().toISOString().split('T')[0]
          systemPrompt += `Current Context: Day Planner\n\n`
          systemPrompt += `Today's date: ${today}\n\n`
          systemPrompt += `You are helping the user create a daily schedule using a draft → commit workflow.\n\n`
          systemPrompt += `## Workflow:\n`
          systemPrompt += `1. Create a draft plan: planner_draft_create(date)\n`
          systemPrompt += `2. Get calendar events: calendar_day_events_get(date) - these are FIXED, don't schedule over them\n`
          systemPrompt += `3. Get tasks to schedule: tasks_list_candidates_for_day(date) or tasks_list(status='open')\n`
          systemPrompt += `4. Add blocks using primitives: planner_block_add(draftPlanId, start, end, title, kind, locked, taskId?, notes?)\n`
          systemPrompt += `   - kind options: 'task', 'focus', 'break', 'buffer', 'admin'\n`
          systemPrompt += `   - CRITICAL: Use ISO datetime format with Z: YYYY-MM-DDTHH:mm:ssZ\n`
          systemPrompt += `   - Example: "2026-01-27T09:00:00Z" for 9am, "2026-01-27T17:00:00Z" for 5pm\n`
          systemPrompt += `   - MUST end with 'Z' (UTC timezone) - this is required by the validator\n`
          systemPrompt += `   - Build datetime: date + "T" + time + "Z" (e.g., "2026-01-27" + "T" + "09:00:00" + "Z")\n`
          systemPrompt += `5. Validate: planner_draft_validate(draftPlanId) - checks for overlaps and conflicts\n`
          systemPrompt += `6. Commit when user approves: planner_draft_commit(date)\n\n`
          systemPrompt += `## Guidelines:\n`
          systemPrompt += `- Don't call projects_* tools unless user specifically asks about projects\n`
          systemPrompt += `- Focus on planner_* and tasks_* tools\n`
          systemPrompt += `- Add 4-8 blocks typically (don't overplan)\n`
          systemPrompt += `- Respect calendar events (they're fixed)\n`
          systemPrompt += `- Ask before committing - let user review first\n`
          systemPrompt += `- If draft exists, get it with planner_draft_get(date) before making changes\n`
          break
        }
        case 'tasks': {
          systemPrompt += `Current Context: All Tasks View\n`
          systemPrompt += `Viewing all open tasks across all projects.\n`
          break
        }
        case 'agents': {
          systemPrompt += `Current Context: Agents Configuration\n`
          systemPrompt += `You can help with understanding and configuring agents.\n`
          break
        }
        case 'mcp-servers': {
          systemPrompt += `Current Context: MCP Servers Configuration\n`
          systemPrompt += `You can help with MCP server setup and configuration.\n`
          break
        }
        case 'settings': {
          systemPrompt += `Current Context: Settings\n`
          systemPrompt += `You can help with configuring Open Loops settings.\n`
          break
        }
        default: {
          systemPrompt += `Current Context: General\n`
          systemPrompt += `You can help with projects, tasks, planning, and configuration.\n`
        }
      }

      systemPrompt += `\nRules:
- Keep responses SHORT (1-3 sentences). Be concise.
- Use tools when needed to answer questions or perform actions.
- If you don't have info to answer a question, use a tool to find it.`

      // Build conversation messages (without system - that goes in systemPrompt)
      const aiMessages: ModelMessage[] = messages.map((msg: any) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content
      }))

      // Create AI SDK model
      const model = createAiSdkModel({ baseUrl, model: modelName, apiKey })

      // Create abort controller for cancellation
      const abortController = new AbortController()
      activeChatStreams.set(streamId, abortController)

      // Get the sender's webContents to send streaming updates
      const webContents = event.sender

      // Start agent stream
      console.log('[Chat] Starting agent stream with tools...')
      console.log('[Chat] Model:', modelName, 'BaseURL:', baseUrl)

      // Notify renderer that streaming has started
      webContents.send('chat:started', { streamId })

      let fullText = ''
      let eventCount = 0

      // Run agent and stream events to renderer
      // Increase maxSteps for planner context (needs more tool calls for draft → blocks → commit workflow)
      const maxSteps = context.active.type === 'planner' ? 25 : 10
      for await (const agentEvent of runAgentStream(
        { model, maxSteps, temperature: 0.7, maxOutputTokens: 4000 },
        { messages: aiMessages, systemPrompt, abortSignal: abortController.signal }
      )) {
        eventCount++

        switch (agentEvent.type) {
          case 'text-delta':
            fullText += agentEvent.delta
            webContents.send('chat:delta', { streamId, delta: agentEvent.delta })
            break

          case 'tool-input-start':
            console.log(`[Chat] Tool input starting: ${agentEvent.toolName}`)
            webContents.send('chat:tool-call', {
              streamId,
              toolCallId: agentEvent.toolCallId,
              toolName: agentEvent.toolName,
              status: 'started'
            })
            break

          case 'tool-input-delta':
            // Tool input is streaming (could show args as they arrive)
            console.log(`[Chat] Tool input delta for ${agentEvent.toolCallId}`)
            break

          case 'tool-call-complete':
            console.log(`[Chat] Tool call complete: ${agentEvent.toolName}`)
            webContents.send('chat:tool-call', {
              streamId,
              toolCallId: agentEvent.toolCallId,
              toolName: agentEvent.toolName,
              input: agentEvent.input,
              status: 'executing'
            })
            break

          case 'tool-result':
            console.log(`[Chat] Tool result: ${agentEvent.toolName}`)
            webContents.send('chat:tool-result', {
              streamId,
              toolCallId: agentEvent.toolCallId,
              toolName: agentEvent.toolName,
              output: agentEvent.output
            })
            break

          case 'step-finish':
            console.log(`[Chat] Step ${agentEvent.stepNumber} finished: ${agentEvent.finishReason}`)
            break

          case 'error':
            console.error(`[Chat] Agent error: ${agentEvent.error}`)
            webContents.send('chat:error', { streamId, error: agentEvent.error })
            break

          case 'finish':
            console.log(`[Chat] Agent finished: ${agentEvent.finishReason}, steps: ${agentEvent.totalSteps}`)
            break
        }
      }

      // Clean up
      activeChatStreams.delete(streamId)

      // Send completion signal
      webContents.send('chat:done', { streamId })

      console.log('[Chat] Agent complete, events:', eventCount, 'text length:', fullText.length)

      return {
        role: 'assistant',
        content: fullText,
        timestamp: new Date().toISOString()
      }
    } catch (error: any) {
      console.error('[Chat] Error:', error)
      activeChatStreams.delete(streamId)

      // Check if it was an abort
      if (error.name === 'AbortError') {
        return {
          role: 'assistant',
          content: '(Generation stopped)',
          timestamp: new Date().toISOString()
        }
      }

      throw error
    }
  })

  // Chat cancellation
  ipcMain.handle('chat:cancel', async (_, streamId: string) => {
    console.log('[Chat] Cancelling stream:', streamId)
    const controller = activeChatStreams.get(streamId)
    if (controller) {
      controller.abort()
      activeChatStreams.delete(streamId)
      return { success: true }
    }
    return { success: false, error: 'Stream not found' }
  })

  ipcMain.handle('chat:save', async (_, projectId: string, messages: any[]) => {
    console.log('[Chat] Saving chat transcript, project:', projectId, 'message count:', messages.length)

    // Use domain command - emits event automatically
    const capture = await captureCommands.createCapture({
      projectId,
      type: 'chat',
      title: `Chat — ${new Date().toLocaleString()}`,
      bodyText: JSON.stringify(messages)
    })

    console.log('[Chat] Chat saved as capture:', capture.id)
    return capture
  })

  ipcMain.handle('chat:extractTasks', async (_, projectId: string, _messages: any[]) => {
    console.log('[Chat] Extracting tasks from chat, project:', projectId)

    // TODO: Implement task extraction via job queue
    // For now, return placeholder job ID
    console.warn('[Chat] Task extraction not yet implemented')
    return 'placeholder-job-id'
  })

  ipcMain.handle('chat:extractDecisions', async (_, projectId: string, _messages: any[]) => {
    console.log('[Chat] Extracting decisions from chat, project:', projectId)

    // TODO: Implement decision extraction via job queue
    // For now, return placeholder job ID
    console.warn('[Chat] Decision extraction not yet implemented')
    return 'placeholder-job-id'
  })

  ipcMain.handle('chat:updateSummary', async (_, projectId: string) => {
    console.log('[Chat] Triggering summary regeneration, project:', projectId)

    // Reuse existing summary generation logic
    try {
      const captures = await repository.getCapturesByProject(projectId)
      const tasks = await repository.getOpenTasks(projectId)

      let context = `Project captures from last 14 days:\n\n`
      for (const capture of captures.slice(0, 20)) {
        context += `- Capture: ${capture.title} (${capture.type})\n`
        if (capture.bodyText) {
          context += `  ${capture.bodyText.substring(0, 200)}\n`
        }
      }

      context += `\n\nOpen tasks:\n\n`
      for (const task of tasks) {
        context += `- Task: ${task.title} (Priority: ${task.priority}, Estimate: ${task.estimateMinutes}min)\n`
        if (task.notes) {
          context += `  ${task.notes.substring(0, 200)}\n`
        }
      }

      const prompt = `You are helping summarize a project. Based on the recent captures and open tasks, create a markdown summary with:
1. What's going on (brief overview)
2. Current open loops (active work items)
3. Recent decisions or notes
4. Next 3 likely actions

Keep it concise and actionable.`

      const jobId = await jobManager.enqueueSummary(projectId, context, prompt)

      // Emit event to renderer
      const job = await repository.getJob(jobId)
      if (job && mainWindow) {
        mainWindow.webContents.send('job:updated', job)
      }
    } catch (error) {
      console.error('[Chat] Error updating summary:', error)
      throw error
    }
  })

  // Jobs
  ipcMain.handle('jobs:getAll', async () => {
    return repository.getAllJobs()
  })

  ipcMain.handle('jobs:getByProject', async (_, projectId: string) => {
    return repository.getJobsByProject(projectId)
  })

  ipcMain.handle('jobs:clear', async () => {
    await repository.clearCompletedJobs()
  })

  ipcMain.handle('jobs:clearAll', async () => {
    await repository.clearAllJobs()
  })

  // Tasks
  ipcMain.handle('tasks:getAll', async (_, projectId?: string) => {
    return repository.getAllTasks(projectId)
  })

  ipcMain.handle('tasks:getOpen', async (_, projectId?: string) => {
    return repository.getOpenTasks(projectId)
  })

  ipcMain.handle('tasks:getInbox', async () => {
    return repository.getInboxTasks()
  })

  ipcMain.handle('tasks:create', async (_, input: any) => {
    return taskCommands.createTask(input)
  })

  ipcMain.handle('tasks:update', async (_, id: string, input: any) => {
    return taskCommands.updateTask(id, input)
  })

  ipcMain.handle('tasks:delete', async (_, id: string) => {
    await taskCommands.deleteTask(id)
  })

  // Work Mode
  ipcMain.handle('workMode:getActiveTask', async () => {
    return await activeTaskService.getActiveTask()
  })

  ipcMain.handle('workMode:setActiveTask', async (_, taskId: string) => {
    await activeTaskService.setActiveTask(taskId)
  })

  ipcMain.handle('workMode:clearActiveTask', async () => {
    await activeTaskService.clearActiveTask()
  })

  ipcMain.handle('workMode:openWindow', async () => {
    await workModeWindow.create()
  })

  ipcMain.handle('workMode:closeWindow', async () => {
    workModeWindow.close()
  })

  ipcMain.handle('workMode:toggleWindow', async () => {
    workModeWindow.toggle()
  })

  // Text Capture
  ipcMain.handle('textCapture:openWindow', async (_, projectId?: string) => {
    await textCaptureWindow.create(projectId)
  })

  ipcMain.handle('textCapture:closeWindow', async () => {
    textCaptureWindow.close()
  })

  ipcMain.handle('textCapture:save', async (_, text: string) => {
    const storedProjectId = textCaptureWindow.getProjectId()
    const activeTask = await activeTaskService.getActiveTask()

    // Determine capture target:
    // 1. If opened from project page (storedProjectId exists) → project-level capture
    // 2. If opened from work mode with active task → task-level capture
    // 3. Otherwise → project-level capture using active task's project (or fail if no context)

    let captureInput: any

    if (storedProjectId) {
      // Opened from Projects page
      captureInput = {
        projectId: storedProjectId,
        type: 'text',
        bodyText: text,
        title: null
      }
    } else if (activeTask) {
      // Opened from Work Mode with active task
      if (activeTask.projectId) {
        // Task belongs to a project - create project-level capture
        captureInput = {
          projectId: activeTask.projectId,
          type: 'text',
          bodyText: text,
          title: null
        }
      } else {
        // Inbox task - create task-linked capture
        captureInput = {
          linkedTaskId: activeTask.id,
          type: 'text',
          bodyText: text,
          title: null
        }
      }
    } else {
      // No context - this shouldn't happen in normal usage
      throw new Error('Cannot create text capture: no project or task context')
    }

    const capture = await captureCommands.createCapture(captureInput)

    // Enqueue AI title generation job
    const jobId = await jobManager.enqueueTextTitleGeneration(capture.id, text)

    // Emit event to renderer with newly created job
    const job = await repository.getJob(jobId)
    if (job && mainWindow) {
      mainWindow.webContents.send('job:updated', job)
    }

    // Close the text capture window
    textCaptureWindow.close()

    return capture
  })

  // Calendar
  ipcMain.handle('calendar:importICS', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Calendar Files', extensions: ['ics'] }]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const icsContent = fs.readFileSync(result.filePaths[0], 'utf-8')
    return icsContent
  })

  ipcMain.handle('calendar:parseICS', async (_, icsContent: string) => {
    const events = parseICSFile(icsContent)

    // Clear existing events and import new ones
    await repository.clearCalendarEvents()

    for (const event of events) {
      await repository.createCalendarEvent(
        event.title,
        event.startDt,
        event.endDt,
        event.uid,
        JSON.stringify(event.raw)
      )
    }

    return events
  })

  ipcMain.handle('calendar:getEventsForDate', async (_, dateStr: string) => {
    const date = new Date(dateStr)
    return repository.getCalendarEventsForDate(date)
  })

  // Day planning
  ipcMain.handle('planning:generate', async (_, dateStr: string, configOverrides?: any) => {
    const date = new Date(dateStr)

    // Get events and tasks
    const events = await repository.getCalendarEventsForDate(date)
    const tasks = await repository.getOpenTasks()

    // Get planner config from settings
    const workingHoursStart = parseInt(await repository.getSetting('working_hours_start') || '9')
    const workingHoursEnd = parseInt(await repository.getSetting('working_hours_end') || '17')
    const minBlockSizeMinutes = parseInt(await repository.getSetting('min_block_size_minutes') || '30')

    const config = {
      workingHoursStart: configOverrides?.workingHoursStart || workingHoursStart,
      workingHoursEnd: configOverrides?.workingHoursEnd || workingHoursEnd,
      minBlockSizeMinutes: configOverrides?.minBlockSizeMinutes || minBlockSizeMinutes
    }

    const planner = new DayPlanner(config)
    const blocks = planner.generatePlan(date, events, tasks)

    return blocks
  })

  ipcMain.handle('planning:save', async (_, dateStr: string, blocks: any[]) => {
    // Delete existing plan for this date
    const existingPlan = await repository.getDayPlan(dateStr)
    if (existingPlan) {
      await repository.deleteDayPlan(existingPlan.id)
    }

    // Create new plan
    const planId = await repository.createDayPlan(dateStr)

    // Create blocks
    for (const block of blocks) {
      await repository.createDayPlanBlock(
        planId,
        new Date(block.startDt),
        new Date(block.endDt),
        block.label,
        block.linkedTaskId,
        block.notes
      )
    }

    return planId
  })

  ipcMain.handle('planning:get', async (_, dateStr: string) => {
    const plan = await repository.getDayPlan(dateStr)
    if (!plan) {
      return null
    }

    const blocks = await repository.getDayPlanBlocks(plan.id)
    return { plan, blocks }
  })

  ipcMain.handle('planning:updateBlock', async (_, blockId: string, updates: any) => {
    await repository.updateDayPlanBlock(
      blockId,
      new Date(updates.startDt),
      new Date(updates.endDt),
      updates.label,
      updates.notes
    )
  })

  ipcMain.handle('planning:deleteBlock', async (_, blockId: string) => {
    await repository.deleteDayPlanBlock(blockId)
  })

  ipcMain.handle('planning:discardDraft', async (_, dateStr: string) => {
    const { plannerCommands } = await import('./domain/commands')
    await plannerCommands.discardDraft(dateStr)
  })

  // Settings
  ipcMain.handle('settings:get', async (_, key: string) => {
    return repository.getSetting(key)
  })

  ipcMain.handle('settings:set', async (_, key: string, value: string) => {
    await repository.setSetting(key, value)
  })

  ipcMain.handle('settings:getAll', async () => {
    const keys = [
      'transcription_type',
      'transcription_base_url',
      'transcription_model',
      'whisper_binary_path',
      'whisper_model_path',
      'llm_type',
      'llm_base_url',
      'llm_model',
      'working_hours_start',
      'working_hours_end',
      'min_block_size_minutes',
      'summary_lookback_days',
      'mcp.http.enabled',
      'mcp.http.port',
      'mcp.http.authToken'
    ]

    const settings: Record<string, string> = {}
    for (const key of keys) {
      settings[key] = await repository.getSetting(key) || ''
    }

    return settings
  })

  // Secrets (using keytar would be here, but for simplicity storing in settings for MVP)
  ipcMain.handle('secrets:get', async (_, key: string) => {
    return repository.getSetting(`secret_${key}`)
  })

  ipcMain.handle('secrets:set', async (_, key: string, value: string) => {
    await repository.setSetting(`secret_${key}`, value)
  })

  // MCP HTTP Transport (Phase 4)
  ipcMain.handle('mcp:http:start', async () => {
    try {
      const httpEnabled = await repository.getSetting('mcp.http.enabled')
      const httpPort = await repository.getSetting('mcp.http.port')
      const httpAuthToken = await repository.getSetting('mcp.http.authToken')

      if (httpEnabled !== 'true') {
        throw new Error('MCP HTTP transport is disabled in settings')
      }

      await startHTTPTransport({
        enabled: true,
        port: httpPort ? parseInt(httpPort) : 3000,
        authToken: httpAuthToken || undefined
      })

      return { success: true }
    } catch (error: any) {
      console.error('[MCP HTTP] Failed to start:', error)
      throw error
    }
  })

  ipcMain.handle('mcp:http:stop', async () => {
    try {
      await stopHTTPTransport()
      return { success: true }
    } catch (error: any) {
      console.error('[MCP HTTP] Failed to stop:', error)
      throw error
    }
  })

  ipcMain.handle('mcp:http:status', async () => {
    const running = isHTTPTransportRunning()
    const port = await repository.getSetting('mcp.http.port')
    return {
      running,
      port: port ? parseInt(port) : 3000
    }
  })

  // Agents Registry
  ipcMain.handle('agents:list', async () => {
    const { getAllAgents } = await import('./mcp/registry/agentRegistry')
    const { getToolSetForServers } = await import('./mcp/registry/toolsetComposer')

    const agents = getAllAgents()

    // Enhance with tool count
    const agentsWithCounts = await Promise.all(
      agents.map(async (agent) => {
        try {
          const tools = await getToolSetForServers(agent.mcpServers)
          return {
            ...agent,
            toolCount: Object.keys(tools).length
          }
        } catch (error) {
          return {
            ...agent,
            toolCount: 0
          }
        }
      })
    )

    return agentsWithCounts
  })

  // MCP Servers Registry
  ipcMain.handle('mcpServers:list', async () => {
    const { getAllServers } = await import('./mcp/registry/registry')
    const { healthCheck } = await import('./mcp/registry/clientPool')

    const servers = getAllServers()

    // Enhance with health status
    const serversWithStatus = await Promise.all(
      servers.map(async (server) => {
        const status = await healthCheck(server.id)
        return {
          ...server,
          status
        }
      })
    )

    return serversWithStatus
  })

  // LLM Connection Testing
  ipcMain.handle('llm:testConnection', async (_, baseUrl: string, apiKey: string) => {
    console.log('[LLM Test] Testing connection to:', baseUrl)

    try {
      const modelsUrl = `${baseUrl}/models`
      console.log('[LLM Test] Fetching models from:', modelsUrl)

      const response = await fetch(modelsUrl, {
        headers: apiKey ? {
          'Authorization': `Bearer ${apiKey}`
        } : {}
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('[LLM Test] Response:', data)

      // Handle both OpenAI format and Ollama format
      let models: string[] = []

      if (data.data && Array.isArray(data.data)) {
        // OpenAI format: { data: [{ id: "model-name" }] }
        models = data.data.map((m: any) => m.id)
      } else if (data.models && Array.isArray(data.models)) {
        // Ollama format: { models: [{ name: "model-name" }] }
        models = data.models.map((m: any) => m.name || m.model)
      } else {
        console.warn('[LLM Test] Unexpected response format:', data)
        throw new Error('Unexpected API response format')
      }

      console.log('[LLM Test] Found models:', models)
      return { success: true, models }
    } catch (error: any) {
      console.error('[LLM Test] Connection failed:', error.message)
      return { success: false, error: error.message }
    }
  })

  // Transcription Connection Testing
  ipcMain.handle('transcription:testConnection', async (_, baseUrl: string, apiKey: string) => {
    console.log('[Transcription Test] Testing connection to:', baseUrl)

    try {
      const modelsUrl = `${baseUrl}/models`
      console.log('[Transcription Test] Fetching models from:', modelsUrl)

      const response = await fetch(modelsUrl, {
        headers: apiKey ? {
          'Authorization': `Bearer ${apiKey}`
        } : {}
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('[Transcription Test] Response received')

      // Parse models like LLM does
      let models: string[] = []
      if (data.data && Array.isArray(data.data)) {
        // OpenAI format: { data: [{ id: "model-name" }] }
        models = data.data.map((m: any) => m.id)
      } else if (data.models && Array.isArray(data.models)) {
        // Ollama format: { models: [{ name: "model-name" }] }
        models = data.models.map((m: any) => m.name || m.model)
      }

      console.log('[Transcription Test] Found models:', models)
      return { success: true, message: 'Connection successful', models }
    } catch (error: any) {
      console.error('[Transcription Test] Connection failed:', error.message)
      return { success: false, error: error.message }
    }
  })
}


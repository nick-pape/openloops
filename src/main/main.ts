import { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut } from 'electron'
import path from 'path'
import fs from 'fs'
import { initDatabase, closeDatabase } from './db/database'
import { repository } from './db/repository'
import { jobManager } from './workers/job-manager'
import { parseICSFile } from './planning/ics-parser'
import { DayPlanner } from './planning/day-planner'
import { screenshotHandler } from './screenshot/screenshot-handler'

let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

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

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    jobManager.setMainWindow(null)
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
  initDatabase()
  await jobManager.start()
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
    app.quit()
  }
})

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  screenshotHandler.cleanup()
  jobManager.stop()
  closeDatabase()
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
    return repository.createProject({ name })
  })

  ipcMain.handle('projects:update', async (_, id: string, name: string) => {
    return repository.updateProject(id, name)
  })

  ipcMain.handle('projects:delete', async (_, id: string) => {
    await repository.deleteProject(id)
  })

  // Captures
  ipcMain.handle('captures:getByProject', async (_, projectId: string) => {
    return repository.getCapturesWithFlags(projectId)
  })

  ipcMain.handle('captures:create', async (_, input: any) => {
    return repository.createCapture(input)
  })

  ipcMain.handle('captures:toggleOpenLoop', async (_, captureId: string) => {
    await repository.toggleCaptureOpenLoop(captureId)
  })

  ipcMain.handle('captures:update', async (_, id: string, title: string, bodyText: string) => {
    return repository.updateCapture(id, title, bodyText)
  })

  ipcMain.handle('captures:delete', async (_, id: string) => {
    await repository.deleteCapture(id)
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
    return repository.createTask(input)
  })

  ipcMain.handle('tasks:update', async (_, id: string, input: any) => {
    return repository.updateTask(id, input)
  })

  ipcMain.handle('tasks:delete', async (_, id: string) => {
    await repository.deleteTask(id)
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
      'whisper_binary_path',
      'whisper_model_path',
      'llm_type',
      'llm_base_url',
      'llm_model',
      'working_hours_start',
      'working_hours_end',
      'min_block_size_minutes',
      'summary_lookback_days'
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

      return { success: true, message: 'Connection successful' }
    } catch (error: any) {
      console.error('[Transcription Test] Connection failed:', error.message)
      return { success: false, error: error.message }
    }
  })
}

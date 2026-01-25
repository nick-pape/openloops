import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Projects
  projects: {
    getAll: () => ipcRenderer.invoke('projects:getAll'),
    get: (id: string) => ipcRenderer.invoke('projects:get', id),
    create: (name: string) => ipcRenderer.invoke('projects:create', name),
    update: (id: string, name: string) => ipcRenderer.invoke('projects:update', id, name),
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id)
  },

  // Captures
  captures: {
    getByProject: (projectId: string) => ipcRenderer.invoke('captures:getByProject', projectId),
    create: (input: any) => ipcRenderer.invoke('captures:create', input),
    toggleOpenLoop: (captureId: string) => ipcRenderer.invoke('captures:toggleOpenLoop', captureId),
    update: (id: string, title: string, bodyText: string) => ipcRenderer.invoke('captures:update', id, title, bodyText),
    delete: (id: string) => ipcRenderer.invoke('captures:delete', id),
    getTranscription: (captureId: string) => ipcRenderer.invoke('captures:getTranscription', captureId)
  },

  // Files
  files: {
    selectImage: () => ipcRenderer.invoke('files:selectImage'),
    saveImage: (projectId: string, arrayBuffer: ArrayBuffer, extension: string) =>
      ipcRenderer.invoke('files:saveImage', projectId, arrayBuffer, extension),
    saveAudio: (projectId: string, arrayBuffer: ArrayBuffer) =>
      ipcRenderer.invoke('files:saveAudio', projectId, arrayBuffer),
    readImage: (filePath: string) => ipcRenderer.invoke('files:readImage', filePath)
  },

  // Audio
  audio: {
    requestTranscription: (captureId: string, audioFilePath: string) =>
      ipcRenderer.invoke('audio:requestTranscription', captureId, audioFilePath)
  },

  // Images
  images: {
    requestDescription: (captureId: string, imagePath: string) =>
      ipcRenderer.invoke('images:requestDescription', captureId, imagePath)
  },

  // Screenshots
  screenshot: {
    snip: (projectId: string) => ipcRenderer.invoke('screenshot:snip', projectId),
    getSources: () => ipcRenderer.invoke('screenshot:getSources'),
    captureSource: (sourceId: string, projectId: string, sourceName: string) =>
      ipcRenderer.invoke('screenshot:captureSource', sourceId, projectId, sourceName)
  },

  // Summaries
  summaries: {
    getLatest: (projectId: string) => ipcRenderer.invoke('summaries:getLatest', projectId),
    generate: (projectId: string) => ipcRenderer.invoke('summaries:generate', projectId)
  },

  // Tasks
  tasks: {
    getAll: (projectId?: string) => ipcRenderer.invoke('tasks:getAll', projectId),
    getOpen: (projectId?: string) => ipcRenderer.invoke('tasks:getOpen', projectId),
    create: (input: any) => ipcRenderer.invoke('tasks:create', input),
    update: (id: string, input: any) => ipcRenderer.invoke('tasks:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('tasks:delete', id)
  },

  // Work Mode
  workMode: {
    getActiveTask: () => ipcRenderer.invoke('workMode:getActiveTask'),
    setActiveTask: (taskId: string) => ipcRenderer.invoke('workMode:setActiveTask', taskId),
    clearActiveTask: () => ipcRenderer.invoke('workMode:clearActiveTask'),
    openWindow: () => ipcRenderer.invoke('workMode:openWindow'),
    closeWindow: () => ipcRenderer.invoke('workMode:closeWindow'),
    toggleWindow: () => ipcRenderer.invoke('workMode:toggleWindow')
  },

  // Text Capture
  textCapture: {
    openWindow: (projectId?: string) => ipcRenderer.invoke('textCapture:openWindow', projectId),
    closeWindow: () => ipcRenderer.invoke('textCapture:closeWindow'),
    save: (text: string) => ipcRenderer.invoke('textCapture:save', text)
  },

  // Chat
  chat: {
    send: (projectId: string, messages: any[]) => ipcRenderer.invoke('chat:send', projectId, messages),
    save: (projectId: string, messages: any[]) => ipcRenderer.invoke('chat:save', projectId, messages),
    extractTasks: (projectId: string, messages: any[]) => ipcRenderer.invoke('chat:extractTasks', projectId, messages),
    extractDecisions: (projectId: string, messages: any[]) => ipcRenderer.invoke('chat:extractDecisions', projectId, messages),
    updateSummary: (projectId: string) => ipcRenderer.invoke('chat:updateSummary', projectId)
  },

  // Calendar
  calendar: {
    importICS: () => ipcRenderer.invoke('calendar:importICS'),
    parseICS: (icsContent: string) => ipcRenderer.invoke('calendar:parseICS', icsContent),
    getEventsForDate: (dateStr: string) => ipcRenderer.invoke('calendar:getEventsForDate', dateStr)
  },

  // Planning
  planning: {
    generate: (dateStr: string, config?: any) => ipcRenderer.invoke('planning:generate', dateStr, config),
    save: (dateStr: string, blocks: any[]) => ipcRenderer.invoke('planning:save', dateStr, blocks),
    get: (dateStr: string) => ipcRenderer.invoke('planning:get', dateStr),
    updateBlock: (blockId: string, updates: any) => ipcRenderer.invoke('planning:updateBlock', blockId, updates),
    deleteBlock: (blockId: string) => ipcRenderer.invoke('planning:deleteBlock', blockId)
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll')
  },

  // Secrets
  secrets: {
    get: (key: string) => ipcRenderer.invoke('secrets:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('secrets:set', key, value)
  },

  // Connection Testing
  llm: {
    testConnection: (baseUrl: string, apiKey: string) => ipcRenderer.invoke('llm:testConnection', baseUrl, apiKey)
  },

  transcription: {
    testConnection: (baseUrl: string, apiKey: string) => ipcRenderer.invoke('transcription:testConnection', baseUrl, apiKey)
  },

  // Jobs
  jobs: {
    getAll: () => ipcRenderer.invoke('jobs:getAll'),
    getByProject: (projectId: string) => ipcRenderer.invoke('jobs:getByProject', projectId),
    clear: () => ipcRenderer.invoke('jobs:clear'),
    clearAll: () => ipcRenderer.invoke('jobs:clearAll')
  },

  // Event listeners for main → renderer communication
  onTriggerImageUpload: (callback: () => void) => {
    ipcRenderer.on('trigger-image-upload', callback)
  },
  offTriggerImageUpload: (callback: () => void) => {
    ipcRenderer.removeListener('trigger-image-upload', callback)
  },
  onTriggerScreenshot: (callback: () => void) => {
    ipcRenderer.on('trigger-screenshot', callback)
  },
  offTriggerScreenshot: (callback: () => void) => {
    ipcRenderer.removeListener('trigger-screenshot', callback)
  },
  onJobUpdated: (callback: (job: any) => void) => {
    ipcRenderer.on('job:updated', (_event, job) => callback(job))
  },
  offJobUpdated: (callback: (job: any) => void) => {
    ipcRenderer.removeListener('job:updated', callback)
  },

  // Capture events (project-scoped)
  onCaptureCreated: (projectId: string | null, callback: (capture: any) => void) => {
    const channel = `capture:created:${projectId || 'inbox'}`
    ipcRenderer.on(channel, (_event, capture) => callback(capture))
  },
  offCaptureCreated: (projectId: string | null, callback: any) => {
    const channel = `capture:created:${projectId || 'inbox'}`
    ipcRenderer.removeListener(channel, callback)
  },
  onCaptureUpdated: (projectId: string | null, callback: (capture: any) => void) => {
    const channel = `capture:updated:${projectId || 'inbox'}`
    ipcRenderer.on(channel, (_event, capture) => callback(capture))
  },
  offCaptureUpdated: (projectId: string | null, callback: any) => {
    const channel = `capture:updated:${projectId || 'inbox'}`
    ipcRenderer.removeListener(channel, callback)
  },
  onCaptureDeleted: (projectId: string | null, callback: (data: { id: string }) => void) => {
    const channel = `capture:deleted:${projectId || 'inbox'}`
    ipcRenderer.on(channel, (_event, data) => callback(data))
  },
  offCaptureDeleted: (projectId: string | null, callback: any) => {
    const channel = `capture:deleted:${projectId || 'inbox'}`
    ipcRenderer.removeListener(channel, callback)
  },

  // Task events (project-scoped)
  onTaskCreated: (projectId: string | null, callback: (task: any) => void) => {
    const channel = `task:created:${projectId || 'inbox'}`
    ipcRenderer.on(channel, (_event, task) => callback(task))
  },
  offTaskCreated: (projectId: string | null, callback: any) => {
    const channel = `task:created:${projectId || 'inbox'}`
    ipcRenderer.removeListener(channel, callback)
  },
  onTaskUpdated: (projectId: string | null, callback: (task: any) => void) => {
    const channel = `task:updated:${projectId || 'inbox'}`
    ipcRenderer.on(channel, (_event, task) => callback(task))
  },
  offTaskUpdated: (projectId: string | null, callback: any) => {
    const channel = `task:updated:${projectId || 'inbox'}`
    ipcRenderer.removeListener(channel, callback)
  },
  onTaskDeleted: (projectId: string | null, callback: (data: { id: string }) => void) => {
    const channel = `task:deleted:${projectId || 'inbox'}`
    ipcRenderer.on(channel, (_event, data) => callback(data))
  },
  offTaskDeleted: (projectId: string | null, callback: any) => {
    const channel = `task:deleted:${projectId || 'inbox'}`
    ipcRenderer.removeListener(channel, callback)
  }
}

contextBridge.exposeInMainWorld('electron', api)

export type ElectronAPI = typeof api

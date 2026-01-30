import { contextBridge, ipcRenderer } from 'electron'

/**
 * Listener tracking system to fix unsubscribe bugs
 * Maps channel -> WeakMap<originalCallback, wrapperFunction>
 * This allows us to properly remove wrapped event listeners
 */
const listenerMap = new Map<string, WeakMap<Function, Function>>()

function trackListener(channel: string, originalCallback: Function, wrapper: Function): void {
  if (!listenerMap.has(channel)) {
    listenerMap.set(channel, new WeakMap())
  }
  listenerMap.get(channel)!.set(originalCallback, wrapper)
}

function getTrackedListener(channel: string, originalCallback: Function): Function | undefined {
  return listenerMap.get(channel)?.get(originalCallback)
}

function untrackListener(channel: string, originalCallback: Function): void {
  listenerMap.get(channel)?.delete(originalCallback)
}

/**
 * Debug function to get listener counts per channel
 * Used to verify no listener growth/leaks
 */
function getListenerCounts(): Record<string, number> {
  const counts: Record<string, number> = {}

  // Count IPC listeners directly from ipcRenderer
  const channels = [
    'job:updated',
    'domain-event',
    'app:error',
    'trigger-image-upload',
    'trigger-screenshot'
  ]

  for (const channel of channels) {
    const listenerCount = ipcRenderer.listenerCount(channel)
    if (listenerCount > 0) {
      counts[channel] = listenerCount
    }
  }

  return counts
}

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
    readImage: (filePath: string) => ipcRenderer.invoke('files:readImage', filePath),
    readAudio: (filePath: string) => ipcRenderer.invoke('files:readAudio', filePath)
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
    send: (messages: any[], context: any, streamId: string, attachments?: any[]) => ipcRenderer.invoke('chat:send', messages, context, streamId, attachments),
    cancel: (streamId: string) => ipcRenderer.invoke('chat:cancel', streamId),
    save: (projectId: string, messages: any[]) => ipcRenderer.invoke('chat:save', projectId, messages),
    extractTasks: (projectId: string, messages: any[]) => ipcRenderer.invoke('chat:extractTasks', projectId, messages),
    extractDecisions: (projectId: string, messages: any[]) => ipcRenderer.invoke('chat:extractDecisions', projectId, messages),
    updateSummary: (projectId: string) => ipcRenderer.invoke('chat:updateSummary', projectId),
    // Streaming events
    onStarted: (callback: (data: { streamId: string }) => void) => {
      const listener = (_event: any, data: { streamId: string }) => callback(data)
      ipcRenderer.on('chat:started', listener)
      return () => ipcRenderer.removeListener('chat:started', listener)
    },
    onDelta: (callback: (data: { streamId: string; delta: string }) => void) => {
      const listener = (_event: any, data: { streamId: string; delta: string }) => callback(data)
      ipcRenderer.on('chat:delta', listener)
      return () => ipcRenderer.removeListener('chat:delta', listener)
    },
    onDone: (callback: (data: { streamId: string }) => void) => {
      const listener = (_event: any, data: { streamId: string }) => callback(data)
      ipcRenderer.on('chat:done', listener)
      return () => ipcRenderer.removeListener('chat:done', listener)
    },
    // Tool call events (for agent mode)
    onToolCall: (callback: (data: { streamId: string; toolCallId: string; toolName: string; args?: unknown; status: string }) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('chat:tool-call', listener)
      return () => ipcRenderer.removeListener('chat:tool-call', listener)
    },
    onToolResult: (callback: (data: { streamId: string; toolCallId: string; toolName: string; result: unknown }) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('chat:tool-result', listener)
      return () => ipcRenderer.removeListener('chat:tool-result', listener)
    },
    onError: (callback: (data: { streamId: string; error: string }) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('chat:error', listener)
      return () => ipcRenderer.removeListener('chat:error', listener)
    }
  },

  // Calendar
  calendar: {
    importICS: () => ipcRenderer.invoke('calendar:importICS'),
    parseICS: (icsContent: string) => ipcRenderer.invoke('calendar:parseICS', icsContent),
    getEventsForDate: (dateStr: string) => ipcRenderer.invoke('calendar:getEventsForDate', dateStr)
  },

  // Microsoft Graph Calendar Sync
  microsoftGraph: {
    isConfigured: () => ipcRenderer.invoke('microsoft-graph:isConfigured'),
    isConnected: () => ipcRenderer.invoke('microsoft-graph:isConnected'),
    connect: () => ipcRenderer.invoke('microsoft-graph:connect'),
    disconnect: () => ipcRenderer.invoke('microsoft-graph:disconnect'),
    getUserProfile: () => ipcRenderer.invoke('microsoft-graph:getUserProfile'),
    syncCalendar: (startDate: string, endDate: string) => ipcRenderer.invoke('microsoft-graph:syncCalendar', startDate, endDate),
    getLastSyncTime: () => ipcRenderer.invoke('microsoft-graph:getLastSyncTime')
  },

  // Planning
  planning: {
    generate: (dateStr: string, config?: any) => ipcRenderer.invoke('planning:generate', dateStr, config),
    save: (dateStr: string, blocks: any[]) => ipcRenderer.invoke('planning:save', dateStr, blocks),
    get: (dateStr: string) => ipcRenderer.invoke('planning:get', dateStr),
    updateBlock: (blockId: string, updates: any) => ipcRenderer.invoke('planning:updateBlock', blockId, updates),
    deleteBlock: (blockId: string) => ipcRenderer.invoke('planning:deleteBlock', blockId),
    discardDraft: (dateStr: string) => ipcRenderer.invoke('planning:discardDraft', dateStr),
    uncommitDraft: (dateStr: string) => ipcRenderer.invoke('planning:uncommitDraft', dateStr)
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

  // Agents Registry
  agents: {
    list: () => ipcRenderer.invoke('agents:list')
  },

  // MCP Servers Registry
  mcpServers: {
    list: () => ipcRenderer.invoke('mcpServers:list')
  },

  // Connection Testing
  llm: {
    testConnection: (baseUrl: string, apiKey: string) => ipcRenderer.invoke('llm:testConnection', baseUrl, apiKey)
  },

  transcription: {
    testConnection: (baseUrl: string, apiKey: string) => ipcRenderer.invoke('transcription:testConnection', baseUrl, apiKey)
  },

  // Links
  links: {
    fetchTitle: (url: string) => ipcRenderer.invoke('links:fetchTitle', url)
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
    const channel = 'job:updated'
    const wrapper = (_event: any, job: any) => callback(job)
    trackListener(channel, callback, wrapper)
    ipcRenderer.on(channel, wrapper)
  },
  offJobUpdated: (callback: (job: any) => void) => {
    const channel = 'job:updated'
    const wrapper = getTrackedListener(channel, callback)
    if (wrapper) {
      ipcRenderer.removeListener(channel, wrapper)
      untrackListener(channel, callback)
    }
  },

  // Domain events (unified event system)
  onDomainEvent: (callback: (event: any) => void) => {
    const channel = 'domain-event'
    const wrapper = (_event: any, domainEvent: any) => callback(domainEvent)
    trackListener(channel, callback, wrapper)
    ipcRenderer.on(channel, wrapper)
  },
  offDomainEvent: (callback: any) => {
    const channel = 'domain-event'
    const wrapper = getTrackedListener(channel, callback)
    if (wrapper) {
      ipcRenderer.removeListener(channel, wrapper)
      untrackListener(channel, callback)
    }
  },

  // MCP (Phase 2 - testing, Phase 4 - HTTP transport)
  mcp: {
    callTool: (toolName: string, args: any) => ipcRenderer.invoke('mcp:callTool', toolName, args),
    http: {
      start: () => ipcRenderer.invoke('mcp:http:start'),
      stop: () => ipcRenderer.invoke('mcp:http:stop'),
      status: () => ipcRenderer.invoke('mcp:http:status')
    }
  },

  // App error events
  onAppError: (callback: (error: { title: string; message: string; details?: string }) => void) => {
    const channel = 'app:error'
    const wrapper = (_event: any, errorData: any) => callback(errorData)
    trackListener(channel, callback, wrapper)
    ipcRenderer.on(channel, wrapper)
  },
  offAppError: (callback: any) => {
    const channel = 'app:error'
    const wrapper = getTrackedListener(channel, callback)
    if (wrapper) {
      ipcRenderer.removeListener(channel, wrapper)
      untrackListener(channel, callback)
    }
  },

  // Generic event listener (for future events)
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, callback)
  },
  removeListener: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback)
  },

  // Debug: Get listener counts per channel (for leak detection)
  debug: {
    getListenerCounts: () => getListenerCounts()
  }
}

contextBridge.exposeInMainWorld('electron', api)

export type ElectronAPI = typeof api

export interface Project {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export interface Capture {
  id: string
  projectId?: string        // Optional - set if project-level capture
  linkedTaskId?: string     // Optional - set if task-level capture
  type: 'text' | 'image' | 'audio' | 'chat' | 'decision' | 'link'
  title: string
  bodyText?: string
  filePath?: string
  metadata?: string
  detailedDescription?: string  // AI-generated detailed description (for images, used by non-VLM chat)
  tags?: string[]              // AI-generated tags (2-10 keywords)
  createdAt: Date
  isOpenLoop?: boolean
  // CONSTRAINT: Exactly one of projectId or linkedTaskId must be set
}

export interface ToolCall {
  toolCallId: string
  toolName: string
  status: 'started' | 'executing' | 'completed' | 'error'
  args?: unknown
  result?: unknown
  error?: string
}

export interface ChatContext {
  general: {
    projects: Array<{ id: string; name: string }>
    openTaskCount: number
  }
  active: {
    type: 'project' | 'planner' | 'tasks' | 'agents' | 'mcp-servers' | 'settings' | 'general'
    label: string
    color: 'blue' | 'green' | 'orange' | 'purple' | 'teal' | 'gray'
    data?: Record<string, any>
  }
}

export interface ChatAttachment {
  type: 'capture' | 'task' | 'summary'
  id: string
  title: string  // Display text for the chip
  data: Capture | Task | ProjectSummary  // Full data to send to backend
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string  // Optional for system messages
  toolCalls?: ToolCall[]  // Tool calls made during this message
  context?: {  // Context when message was sent
    type: string
    label: string
    color: string
  }
  attachments?: Array<{  // Attachments sent with this message
    type: 'capture' | 'task' | 'summary'
    id: string
    title: string
  }>
}

export interface CaptureMetadata {
  source: string
  captureMethod: 'native-snipping-tool' | 'desktop-capturer'
  screenshotType?: 'snipping-tool' | 'full-screen' | 'window' | 'region'
  windowTitle?: string
  appName?: string
  displayName?: string
  timestamp: string
}

export interface DesktopSource {
  id: string
  name: string
  thumbnail: string
  type: 'screen' | 'window'
  display_id?: string
  appIcon?: string
}

export interface Transcription {
  id: string
  captureId: string
  status: 'pending' | 'done' | 'error'
  text?: string
  errorMessage?: string
  provider: string
  createdAt: Date
  updatedAt: Date
}

export interface Task {
  id: string
  projectId?: string
  title: string
  notes?: string
  status: 'open' | 'done'
  priority: number
  estimateMinutes: number
  dueDate?: Date
  createdAt: Date
  updatedAt: Date
}

export interface ProjectSummary {
  id: string
  projectId: string
  summaryMd: string
  provider: string
  sourceWindowStart: Date
  sourceWindowEnd: Date
  createdAt: Date
}

export interface CalendarEvent {
  id: string
  source: string
  externalUid?: string
  title: string
  startDt: Date
  endDt: Date
  rawJson: string
  importedAt: Date
}

export interface MicrosoftAuthResponse {
  accessToken: string
  refreshToken: string
  expiresOn: Date
  account: {
    username: string  // email
    name: string
    homeAccountId: string
  }
}

export interface MicrosoftUserProfile {
  id: string
  displayName: string
  mail: string
  userPrincipalName: string
}

export interface TimeBlock {
  id?: string
  startDt: Date
  endDt: Date
  label: string
  kind: 'calendar_fixed' | 'task' | 'focus' | 'break' | 'buffer' | 'admin'
  locked: boolean
  source?: { type: 'calendar'; eventId: string }
  linkedTaskId?: string
  notes?: string
}

export interface PlanningProfile {
  id: string
  name: string
  instructionsText: string
  constraintsJson?: string
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

export interface DayPlan {
  id: string
  date: string
  status: 'draft' | 'committed'
  planningProfileId?: string
  createdAt: Date
}

export interface AgentSummary {
  id: string
  name: string
  description: string
  isBuiltIn: boolean
  enabled: boolean
  mcpServers: string[]
  toolCount?: number
  tags?: string[]
  createdAt?: Date
  updatedAt?: Date
}

export interface McpServerSummary {
  id: string
  name: string
  description?: string
  isBuiltIn: boolean
  enabled: boolean
  transport: {
    kind: string
    url?: string
  }
  status: {
    id: string
    connected: boolean
    healthy?: boolean
    error?: string
  }
  tags?: string[]
}

declare global {
  interface Window {
    electron: {
      projects: {
        getAll: () => Promise<Project[]>
        get: (id: string) => Promise<Project>
        create: (name: string) => Promise<Project>
        update: (id: string, name: string) => Promise<Project>
        delete: (id: string) => Promise<void>
      }
      captures: {
        getByProject: (projectId: string) => Promise<Capture[]>
        create: (input: any) => Promise<Capture>
        toggleOpenLoop: (captureId: string) => Promise<void>
        update: (id: string, title: string, bodyText: string) => Promise<Capture>
        delete: (id: string) => Promise<void>
        getTranscription: (captureId: string) => Promise<Transcription | undefined>
      }
      files: {
        selectImage: () => Promise<{ filePath: string; filename: string; buffer: ArrayBuffer } | null>
        saveImage: (projectId: string, arrayBuffer: ArrayBuffer, extension: string) => Promise<string>
        saveAudio: (projectId: string, arrayBuffer: ArrayBuffer) => Promise<string>
        readImage: (filePath: string) => Promise<ArrayBuffer>
      }
      jobs: {
        getAll: () => Promise<any[]>
        getByProject: (projectId: string) => Promise<any[]>
        clear: () => Promise<void>
        clearAll: () => Promise<void>
      }
      audio: {
        requestTranscription: (captureId: string, audioFilePath: string) => Promise<string>
      }
      images: {
        requestDescription: (captureId: string, imagePath: string) => Promise<void>
      }
      screenshot: {
        snip: (projectId: string) => Promise<{ filePath: string; metadata: CaptureMetadata } | null>
        getSources: () => Promise<DesktopSource[]>
        captureSource: (sourceId: string, projectId: string, sourceName: string) => Promise<{ sourceId: string; sourceName: string }>
      }
      summaries: {
        getLatest: (projectId: string) => Promise<ProjectSummary | undefined>
        generate: (projectId: string) => Promise<void>
      }
      tasks: {
        getAll: (projectId?: string) => Promise<Task[]>
        getOpen: (projectId?: string) => Promise<Task[]>
        create: (input: any) => Promise<Task>
        update: (id: string, input: any) => Promise<Task>
        delete: (id: string) => Promise<void>
      }
      workMode: {
        getActiveTask: () => Promise<Task | null>
        setActiveTask: (taskId: string) => Promise<void>
        clearActiveTask: () => Promise<void>
        openWindow: () => Promise<void>
        closeWindow: () => Promise<void>
        toggleWindow: () => Promise<void>
      }
      textCapture: {
        openWindow: (projectId?: string) => Promise<void>
        closeWindow: () => Promise<void>
        save: (text: string) => Promise<Capture>
      }
      chat: {
        send: (messages: ChatMessage[], context: ChatContext, streamId: string, attachments?: ChatAttachment[]) => Promise<ChatMessage>
        cancel: (streamId: string) => Promise<void>
        save: (projectId: string, messages: ChatMessage[]) => Promise<Capture>
        extractTasks: (projectId: string, messages: ChatMessage[]) => Promise<string>
        extractDecisions: (projectId: string, messages: ChatMessage[]) => Promise<string>
        updateSummary: (projectId: string) => Promise<void>
        onStarted: (callback: (data: any) => void) => () => void
        onDelta: (callback: (data: any) => void) => () => void
        onDone: (callback: (data: any) => void) => () => void
        onToolCall: (callback: (data: any) => void) => () => void
        onToolResult: (callback: (data: any) => void) => () => void
        onError: (callback: (data: any) => void) => () => void
      }
      calendar: {
        importICS: () => Promise<string | null>
        parseICS: (icsContent: string) => Promise<any[]>
        getEventsForDate: (dateStr: string) => Promise<CalendarEvent[]>
      }
      microsoftGraph: {
        isConfigured: () => Promise<boolean>
        isConnected: () => Promise<boolean>
        connect: () => Promise<MicrosoftAuthResponse>
        disconnect: () => Promise<void>
        getUserProfile: () => Promise<MicrosoftUserProfile | null>
        syncCalendar: (startDate: string, endDate: string) => Promise<{ imported: number; updated: number }>
        getLastSyncTime: () => Promise<Date | null>
      }
      planning: {
        // Legacy (deprecated)
        generate: (dateStr: string, config?: any) => Promise<TimeBlock[]>
        save: (dateStr: string, blocks: TimeBlock[]) => Promise<string>
        get: (dateStr: string) => Promise<{ plan: DayPlan; blocks: TimeBlock[] } | null>
        updateBlock: (blockId: string, updates: any) => Promise<void>
        deleteBlock: (blockId: string) => Promise<void>
        discardDraft: (dateStr: string) => Promise<void>
        uncommitDraft: (dateStr: string) => Promise<void>
      }
      planningProfiles: {
        list: () => Promise<PlanningProfile[]>
        get: (id: string) => Promise<PlanningProfile>
        create: (name: string, instructionsText: string, constraintsJson?: string) => Promise<PlanningProfile>
        update: (id: string, name: string, instructionsText: string, constraintsJson?: string) => Promise<PlanningProfile>
        delete: (id: string) => Promise<void>
        setDefault: (id: string) => Promise<void>
      }
      settings: {
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<void>
        getAll: () => Promise<Record<string, string>>
      }
      secrets: {
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<void>
      }
      agents: {
        list: () => Promise<AgentSummary[]>
      }
      mcpServers: {
        list: () => Promise<McpServerSummary[]>
      }
      llm: {
        testConnection: (baseUrl: string, apiKey: string) => Promise<{ success: boolean; models?: string[]; error?: string }>
      }
      transcription: {
        testConnection: (baseUrl: string, apiKey: string) => Promise<{ success: boolean; message?: string; error?: string }>
      }
      links: {
        fetchTitle: (url: string) => Promise<string>
      }
      onTriggerImageUpload?: (callback: () => void) => void
      offTriggerImageUpload?: (callback: () => void) => void
      onTriggerScreenshot?: (callback: () => void) => void
      offTriggerScreenshot?: (callback: () => void) => void
      onJobUpdated?: (callback: (job: any) => void) => void
      offJobUpdated?: (callback: (job: any) => void) => void
      onCaptureCreated: (projectId: string | null, callback: (capture: Capture) => void) => void
      offCaptureCreated: (projectId: string | null, callback: any) => void
      onCaptureUpdated: (projectId: string | null, callback: (capture: Capture) => void) => void
      offCaptureUpdated: (projectId: string | null, callback: any) => void
      onCaptureDeleted: (projectId: string | null, callback: (data: { id: string }) => void) => void
      offCaptureDeleted: (projectId: string | null, callback: any) => void
      onTaskCreated: (projectId: string | null, callback: (task: Task) => void) => void
      offTaskCreated: (projectId: string | null, callback: any) => void
      onTaskUpdated: (projectId: string | null, callback: (task: Task) => void) => void
      offTaskUpdated: (projectId: string | null, callback: any) => void
      onTaskDeleted: (projectId: string | null, callback: (data: { id: string }) => void) => void
      offTaskDeleted: (projectId: string | null, callback: any) => void
      onDomainEvent: (callback: (event: any) => void) => void
      offDomainEvent: (callback: any) => void
      mcp: {
        callTool: (toolName: string, args: any) => Promise<{ content: Array<{ type: string; text: string }> }>
        http: {
          start: () => Promise<{ success: boolean }>
          stop: () => Promise<{ success: boolean }>
          status: () => Promise<{ running: boolean; port: number }>
        }
      }
    }
  }
}

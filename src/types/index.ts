export interface Project {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export interface Capture {
  id: string
  projectId: string
  type: 'text' | 'image' | 'audio'
  title: string
  bodyText?: string
  filePath?: string
  createdAt: Date
  isOpenLoop?: boolean
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

export interface TimeBlock {
  id?: string
  startDt: Date
  endDt: Date
  label: string
  linkedTaskId?: string
  notes?: string
}

export interface DayPlan {
  id: string
  date: string
  createdAt: Date
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
        getTranscription: (captureId: string) => Promise<Transcription | undefined>
      }
      files: {
        saveImage: (projectId: string, arrayBuffer: ArrayBuffer, extension: string) => Promise<string>
        saveAudio: (projectId: string, arrayBuffer: ArrayBuffer) => Promise<string>
        readImage: (filePath: string) => Promise<ArrayBuffer>
      }
      audio: {
        requestTranscription: (captureId: string, audioFilePath: string) => Promise<string>
      }
      summaries: {
        getLatest: (projectId: string) => Promise<ProjectSummary | undefined>
        generate: (projectId: string) => Promise<void>
      }
      tasks: {
        getOpen: (projectId?: string) => Promise<Task[]>
        create: (input: any) => Promise<Task>
        update: (id: string, input: any) => Promise<Task>
        delete: (id: string) => Promise<void>
      }
      calendar: {
        importICS: () => Promise<string | null>
        parseICS: (icsContent: string) => Promise<any[]>
        getEventsForDate: (dateStr: string) => Promise<CalendarEvent[]>
      }
      planning: {
        generate: (dateStr: string, config?: any) => Promise<TimeBlock[]>
        save: (dateStr: string, blocks: TimeBlock[]) => Promise<string>
        get: (dateStr: string) => Promise<{ plan: DayPlan; blocks: TimeBlock[] } | null>
        updateBlock: (blockId: string, updates: any) => Promise<void>
        deleteBlock: (blockId: string) => Promise<void>
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
      llm: {
        testConnection: (baseUrl: string, apiKey: string) => Promise<{ success: boolean; models?: string[]; error?: string }>
      }
      transcription: {
        testConnection: (baseUrl: string, apiKey: string) => Promise<{ success: boolean; message?: string; error?: string }>
      }
    }
  }
}

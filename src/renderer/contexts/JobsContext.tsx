import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export interface Job {
  id: string
  type: 'transcription' | 'summary' | 'image-description' | 'text-title-generation'
  status: 'pending' | 'processing' | 'done' | 'error'
  payload: string
  result?: string | null
  errorMessage?: string | null
  provider?: string | null
  model?: string | null
  metadata?: string | null
  createdAt: Date
  updatedAt: Date
}

interface JobsContextValue {
  jobs: Job[]
  pendingCount: number
  reload: () => Promise<void>
  clearCompleted: () => Promise<void>
  clearAll: () => Promise<void>
}

const JobsContext = createContext<JobsContextValue | null>(null)

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([])

  const loadJobs = async () => {
    const allJobs = await window.electron.jobs.getAll()
    setJobs(allJobs)
  }

  useEffect(() => {
    // Initial load
    loadJobs()

    // Subscribe to job updates from main process
    const handleJobUpdated = (updatedJob: Job) => {
      console.log('[JobsContext] Job updated:', updatedJob.id, updatedJob.status)
      setJobs(prev => {
        const index = prev.findIndex(j => j.id === updatedJob.id)
        if (index >= 0) {
          // Update existing job
          const newJobs = [...prev]
          newJobs[index] = updatedJob
          return newJobs
        } else {
          // Add new job
          return [...prev, updatedJob]
        }
      })
    }

    window.electron.onJobUpdated?.(handleJobUpdated)

    return () => {
      window.electron.offJobUpdated?.(handleJobUpdated)
    }
  }, [])

  const pendingCount = jobs.filter(j => j.status === 'pending' || j.status === 'processing').length

  const clearCompleted = async () => {
    await window.electron.jobs.clear()
    await loadJobs()
  }

  const clearAll = async () => {
    await window.electron.jobs.clearAll()
    await loadJobs()
  }

  return (
    <JobsContext.Provider value={{ jobs, pendingCount, reload: loadJobs, clearCompleted, clearAll }}>
      {children}
    </JobsContext.Provider>
  )
}

export function useJobs(filter?: { projectId?: string; type?: string; status?: string }): JobsContextValue {
  const context = useContext(JobsContext)
  if (!context) {
    throw new Error('useJobs must be used within JobsProvider')
  }

  if (!filter) {
    return context
  }

  // Filter jobs based on criteria
  let filteredJobs = context.jobs

  if (filter.type) {
    filteredJobs = filteredJobs.filter(j => j.type === filter.type)
  }

  if (filter.status) {
    filteredJobs = filteredJobs.filter(j => j.status === filter.status)
  }

  if (filter.projectId) {
    // Parse payload to filter by projectId or captureId
    filteredJobs = filteredJobs.filter(j => {
      try {
        const payload = JSON.parse(j.payload)
        return payload.projectId === filter.projectId || payload.captureId
      } catch {
        return false
      }
    })
  }

  return {
    ...context,
    jobs: filteredJobs
  }
}

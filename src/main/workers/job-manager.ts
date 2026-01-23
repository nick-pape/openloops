import { Worker } from 'worker_threads'
import path from 'path'
import { app, BrowserWindow } from 'electron'
import { repository } from '../db/repository'

export class JobManager {
  private worker: Worker | null = null
  private isProcessing = false
  private checkInterval: NodeJS.Timeout | null = null
  private mainWindow: BrowserWindow | null = null

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  start() {
    // Check for pending jobs every 5 seconds
    this.checkInterval = setInterval(() => {
      this.processPendingJobs()
    }, 5000)

    // Process immediately on start
    this.processPendingJobs()
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }

    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }

  async enqueueTranscription(captureId: string, audioFilePath: string) {
    console.log('[JobManager] Enqueueing transcription job for capture:', captureId)
    const jobId = await repository.enqueueJob('transcription', {
      captureId,
      audioFilePath
    })
    console.log('[JobManager] Transcription job enqueued with ID:', jobId)

    // Trigger immediate processing
    this.processPendingJobs()
  }

  async enqueueSummary(projectId: string, context: string, prompt: string) {
    console.log('[JobManager] Enqueueing summary job for project:', projectId)
    const jobId = await repository.enqueueJob('summary', {
      projectId,
      context,
      prompt
    })
    console.log('[JobManager] Summary job enqueued with ID:', jobId)

    // Trigger immediate processing
    this.processPendingJobs()
  }

  async enqueueImageDescription(captureId: string, imagePath: string) {
    console.log('[JobManager] Enqueueing image-description job for capture:', captureId)
    const jobId = await repository.enqueueJob('image-description', {
      captureId,
      imagePath
    })
    console.log('[JobManager] Image-description job enqueued with ID:', jobId)

    // Trigger immediate processing
    this.processPendingJobs()
  }

  private async processPendingJobs() {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    try {
      // Process transcription jobs
      await this.processJobType('transcription')

      // Process summary jobs
      await this.processJobType('summary')

      // Process image-description jobs
      await this.processJobType('image-description')
    } finally {
      this.isProcessing = false
    }
  }

  private async processJobType(type: 'transcription' | 'summary' | 'image-description') {
    const job = await repository.getNextPendingJob(type)

    if (!job) {
      console.log(`[JobManager] No pending ${type} jobs`)
      return
    }

    console.log(`[JobManager] Processing ${type} job:`, job.id)

    // Get configuration from settings
    const config = await this.getConfig()

    // Create worker if not exists
    if (!this.worker) {
      const workerPath = app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist-electron', 'job-worker.js')
        : path.join(__dirname, 'job-worker.js')
      this.worker = new Worker(workerPath)

      this.worker.on('message', async (message) => {
        console.log('[JobManager] Job completed:', message.jobId, 'success:', message.success)
        if (message.success) {
          console.log('[JobManager] Result:', message.result?.substring(0, 100))
        } else {
          console.error('[JobManager] Job failed:', message.error)
        }

        // Fetch the updated job from database and emit event to renderer
        try {
          const updatedJob = await repository.getJob(message.jobId)
          if (updatedJob && this.mainWindow) {
            this.mainWindow.webContents.send('job:updated', updatedJob)
            console.log('[JobManager] Emitted job:updated event for job:', message.jobId)
          }
        } catch (error) {
          console.error('[JobManager] Failed to fetch and emit job update:', error)
        }

        // Process next job
        setTimeout(() => this.processPendingJobs(), 100)
      })

      this.worker.on('error', (error) => {
        console.error('[JobManager] Worker error:', error)
        this.worker = null
      })

      this.worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`[JobManager] Worker stopped with exit code ${code}`)
        }
        this.worker = null
      })
    }

    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'app-data', 'loops.db')

    // Send job to worker
    this.worker.postMessage({
      type,
      jobId: job.id,
      payload: JSON.parse(job.payload),
      dbPath,
      config
    })
  }

  private async getConfig() {
    // Get settings from database
    const transcriptionType = await repository.getSetting('transcription_type') || 'remote'
    // Secrets are stored with 'secret_' prefix
    const transcriptionApiKey = await repository.getSetting('secret_transcription_api_key') || ''
    const transcriptionBaseUrl = await repository.getSetting('transcription_base_url') || 'https://api.openai.com/v1'
    const whisperBinaryPath = await repository.getSetting('whisper_binary_path') || ''
    const whisperModelPath = await repository.getSetting('whisper_model_path') || ''

    const llmType = await repository.getSetting('llm_type') || 'disabled'
    // Secrets are stored with 'secret_' prefix
    const llmApiKey = await repository.getSetting('secret_llm_api_key') || ''
    const llmBaseUrl = await repository.getSetting('llm_base_url') || 'https://api.openai.com/v1'
    const llmModel = await repository.getSetting('llm_model') || 'gpt-4o-mini'

    console.log('[JobManager] Config retrieved:', {
      transcriptionType,
      transcriptionApiKeyLength: transcriptionApiKey.length,
      llmType,
      llmApiKeyLength: llmApiKey.length,
      llmBaseUrl,
      llmModel
    })

    return {
      transcription: {
        type: transcriptionType,
        apiKey: transcriptionApiKey,
        baseUrl: transcriptionBaseUrl,
        whisperBinaryPath,
        modelPath: whisperModelPath
      },
      llm: {
        type: llmType,
        apiKey: llmApiKey,
        baseUrl: llmBaseUrl,
        model: llmModel
      }
    }
  }
}

export const jobManager = new JobManager()

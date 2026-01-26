import { parentPort } from 'worker_threads'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'
import {
  ProviderFactory,
  TranscriptionProvider,
  LLMProvider
} from '../ai/providers'
import fs from 'fs'

console.log('[Job Worker] Worker thread started')

interface JobMessage {
  type: 'transcription' | 'summary' | 'image-description' | 'text-title-generation'
  jobId: string
  payload: any
  dbPath: string
  config: any
}

let transcriptionProvider: TranscriptionProvider | null = null
let llmProvider: LLMProvider | null = null

parentPort?.on('message', async (message: JobMessage) => {
  console.log('[Job Worker] Received job:', message.type, 'ID:', message.jobId)
  const { type, jobId, payload, dbPath, config } = message

  try {
    // Initialize database connection
    const sqlite = new Database(dbPath)
    const db = drizzle(sqlite, { schema })

    // Update job status to processing
    await db.update(schema.jobQueue)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(schema.jobQueue.id, jobId))

    let result: string

    if (type === 'transcription') {
      result = await handleTranscription(payload, config, db)
    } else if (type === 'summary') {
      result = await handleSummary(payload, config, db, jobId)
    } else if (type === 'image-description') {
      result = await handleImageDescription(payload, config, db, jobId)
    } else if (type === 'text-title-generation') {
      result = await handleTextTitleGeneration(payload, config, db, jobId)
    } else {
      throw new Error(`Unknown job type: ${type}`)
    }

    // Update job status to done
    await db.update(schema.jobQueue)
      .set({ status: 'done', result, updatedAt: new Date() })
      .where(eq(schema.jobQueue.id, jobId))

    sqlite.close()

    console.log('[Job Worker] Job completed successfully:', jobId)
    parentPort?.postMessage({ success: true, jobId, result })
  } catch (error: any) {
    console.error('[Job Worker] Job failed:', jobId, error.message)
    // Update job status to error
    try {
      const sqlite = new Database(dbPath)
      const db = drizzle(sqlite, { schema })

      await db.update(schema.jobQueue)
        .set({
          status: 'error',
          errorMessage: error.message,
          updatedAt: new Date()
        })
        .where(eq(schema.jobQueue.id, jobId))

      sqlite.close()
    } catch (dbError) {
      console.error('Failed to update job error status:', dbError)
    }

    parentPort?.postMessage({ success: false, jobId, error: error.message })
  }
})

async function handleTranscription(
  payload: { captureId: string; audioFilePath: string },
  config: any,
  db: any
): Promise<string> {
  const factory = new ProviderFactory()

  if (!transcriptionProvider) {
    transcriptionProvider = factory.createTranscriptionProvider(config.transcription)
  }

  if (!fs.existsSync(payload.audioFilePath)) {
    throw new Error(`Audio file not found: ${payload.audioFilePath}`)
  }

  const text = await transcriptionProvider.transcribe(payload.audioFilePath)

  // Update transcription record
  await db.update(schema.transcriptions)
    .set({ status: 'done', text, updatedAt: new Date() })
    .where(eq(schema.transcriptions.captureId, payload.captureId))

  // Generate title from transcript if LLM is available
  if (text && text.trim()) {
    try {
      if (!llmProvider) {
        llmProvider = factory.createLLMProvider(config.llm)
      }

      if (llmProvider.name !== 'disabled') {
        console.log('[Job Worker] Generating title from transcript...')
        const titleResult = await llmProvider.generateTextTitle(text)

        if (titleResult.text && titleResult.text.trim()) {
          console.log('[Job Worker] Audio title generated:', titleResult.text)
          await db.update(schema.captures)
            .set({ title: titleResult.text.trim() })
            .where(eq(schema.captures.id, payload.captureId))
        }
      }
    } catch (titleError: any) {
      // Don't fail the transcription job if title generation fails
      console.error('[Job Worker] Title generation failed (non-fatal):', titleError.message)
    }
  }

  return text
}

async function handleSummary(
  payload: { projectId: string; context: string; prompt: string },
  config: any,
  db: any,
  jobId: string
): Promise<string> {
  console.log('[Job Worker] Handling summary job')
  console.log('[Job Worker] LLM config:', config.llm)

  const factory = new ProviderFactory()

  if (!llmProvider) {
    console.log('[Job Worker] Creating LLM provider...')
    llmProvider = factory.createLLMProvider(config.llm)
    console.log('[Job Worker] LLM provider created:', llmProvider.name)
  }

  console.log('[Job Worker] Generating summary...')
  const result = await llmProvider.generateSummary(payload.prompt, payload.context)
  console.log('[Job Worker] Summary generated, length:', result.text.length)

  // Update job with provider metadata
  await db.update(schema.jobQueue)
    .set({
      provider: llmProvider.name,
      model: llmProvider.model,
      metadata: JSON.stringify(result.metadata)
    })
    .where(eq(schema.jobQueue.id, jobId))

  // Store summary in project_summaries
  const windowEnd = new Date()
  const windowStart = new Date(windowEnd.getTime() - 14 * 24 * 60 * 60 * 1000) // 14 days ago

  const summaryId = generateUUID()
  await db.insert(schema.projectSummaries).values({
    id: summaryId,
    projectId: payload.projectId,
    summaryMd: result.text,
    provider: llmProvider.name,
    sourceWindowStart: windowStart,
    sourceWindowEnd: windowEnd,
    createdAt: new Date()
  })

  return result.text
}

async function handleImageDescription(
  payload: { captureId: string; imagePath: string },
  config: any,
  db: any,
  jobId: string
): Promise<string> {
  console.log('[Job Worker] Handling image-description job')
  console.log('[Job Worker] Image path:', payload.imagePath)

  const factory = new ProviderFactory()

  if (!llmProvider) {
    console.log('[Job Worker] Creating LLM provider for image description...')
    llmProvider = factory.createLLMProvider(config.llm)
    console.log('[Job Worker] LLM provider created:', llmProvider.name)
  }

  // Check if LLM provider is disabled
  if (llmProvider.name === 'disabled') {
    console.log('[Job Worker] LLM provider is disabled, skipping image description')

    // Update job with provider info
    await db.update(schema.jobQueue)
      .set({
        provider: 'disabled',
        model: 'none'
      })
      .where(eq(schema.jobQueue.id, jobId))

    return '' // Return empty string, will keep filename
  }

  // Read already-resized image (resizing done in main process)
  if (!fs.existsSync(payload.imagePath)) {
    throw new Error(`Image file not found: ${payload.imagePath}`)
  }

  console.log('[Job Worker] Reading resized image...')
  const imageBuffer = fs.readFileSync(payload.imagePath)
  console.log('[Job Worker] Image size:', imageBuffer.length, 'bytes')

  const base64 = imageBuffer.toString('base64')
  const mimeType = 'image/jpeg' // Resized images are always JPEG

  console.log('[Job Worker] Generating image title...')
  const result = await llmProvider.generateImageTitle(base64, mimeType)
  console.log('[Job Worker] Image title generated:', result.text)

  // Update job with provider metadata
  await db.update(schema.jobQueue)
    .set({
      provider: llmProvider.name,
      model: llmProvider.model,
      metadata: JSON.stringify(result.metadata)
    })
    .where(eq(schema.jobQueue.id, jobId))

  // Update capture title if we got a result
  if (result.text && result.text.trim()) {
    const capture = await db.select()
      .from(schema.captures)
      .where(eq(schema.captures.id, payload.captureId))
      .limit(1)

    if (capture[0]) {
      await db.update(schema.captures)
        .set({ title: result.text.trim() })
        .where(eq(schema.captures.id, payload.captureId))
    }
  }

  return result.text
}

async function handleTextTitleGeneration(
  payload: { captureId: string; bodyText: string; previousTitle?: string },
  config: any,
  db: any,
  jobId: string
): Promise<string> {
  console.log('[Job Worker] Handling text-title-generation job')
  console.log('[Job Worker] Capture ID:', payload.captureId)

  const factory = new ProviderFactory()

  if (!llmProvider) {
    console.log('[Job Worker] Creating LLM provider for text title generation...')
    llmProvider = factory.createLLMProvider(config.llm)
    console.log('[Job Worker] LLM provider created:', llmProvider.name)
  }

  // Check if LLM provider is disabled
  if (llmProvider.name === 'disabled') {
    console.log('[Job Worker] LLM provider is disabled, skipping text title generation')

    // Update job with provider info
    await db.update(schema.jobQueue)
      .set({
        provider: 'disabled',
        model: 'none'
      })
      .where(eq(schema.jobQueue.id, jobId))

    return '' // Return empty string, title stays null
  }

  console.log('[Job Worker] Generating text title...')
  const result = await llmProvider.generateTextTitle(payload.bodyText, payload.previousTitle)
  console.log('[Job Worker] Text title generated:', result.text)

  // Update job with provider metadata
  await db.update(schema.jobQueue)
    .set({
      provider: llmProvider.name,
      model: llmProvider.model,
      metadata: JSON.stringify(result.metadata)
    })
    .where(eq(schema.jobQueue.id, jobId))

  // Update capture title if we got a result
  if (result.text && result.text.trim()) {
    const capture = await db.select()
      .from(schema.captures)
      .where(eq(schema.captures.id, payload.captureId))
      .limit(1)

    if (capture[0]) {
      await db.update(schema.captures)
        .set({ title: result.text.trim() })
        .where(eq(schema.captures.id, payload.captureId))
    }
  }

  return result.text
}

// function getMimeType(ext: string): string {
//   const mimeTypes: Record<string, string> = {
//     'png': 'image/png',
//     'jpg': 'image/jpeg',
//     'jpeg': 'image/jpeg',
//     'gif': 'image/gif',
//     'webp': 'image/webp',
//     'bmp': 'image/bmp',
//     'svg': 'image/svg+xml'
//   }
//   return mimeTypes[ext] || 'image/png'
// }

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

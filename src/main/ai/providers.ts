import fs from 'fs'
import path from 'path'

export interface JobMetadata {
  baseUrl?: string
  model?: string
  requestParams?: Record<string, any>
  tokensUsed?: number
  durationMs?: number
}

export interface LLMResult {
  text: string
  metadata: JobMetadata
}

export interface TranscriptionProvider {
  name: string
  transcribe(audioFilePath: string): Promise<string>
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string  // Optional for system messages
}

export interface ImageTitleAndDescription {
  title: string
  detailedDescription: string
  metadata: JobMetadata
}

export interface TagsResult {
  tags: string[]
  metadata: JobMetadata
}

export interface LLMProvider {
  name: string
  model: string
  baseUrl?: string
  generateSummary(prompt: string, context: string): Promise<LLMResult>
  generateImageTitleAndDescription(imageBase64: string, mimeType: string): Promise<ImageTitleAndDescription>
  generateTextTitle(bodyText: string, previousTitle?: string): Promise<LLMResult>
  generateTags(captureType: string, title: string, content: string): Promise<TagsResult>
  chat(messages: ChatMessage[]): Promise<LLMResult>
}

// Remote Transcription Provider (OpenAI Whisper API)
export class RemoteTranscriptionProvider implements TranscriptionProvider {
  name = 'remote-whisper'

  constructor(
    private apiKey: string,
    private baseUrl: string = 'https://api.openai.com/v1',
    private model: string = 'whisper-1'
  ) {}

  async transcribe(audioFilePath: string): Promise<string> {
    const url = `${this.baseUrl}/audio/transcriptions`
    console.log('[Transcription] Starting transcription')
    console.log('[Transcription] URL:', url)
    console.log('[Transcription] Model:', this.model)
    console.log('[Transcription] Audio file:', audioFilePath)

    const formData = new FormData()
    const audioBuffer = fs.readFileSync(audioFilePath)
    const audioBlob = new Blob([audioBuffer])
    formData.append('file', audioBlob, path.basename(audioFilePath))
    formData.append('model', this.model)

    console.log('[Transcription] Sending request...')
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: formData
    })

    console.log('[Transcription] Response status:', response.status, response.statusText)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Transcription] Error response body:', errorText)
      throw new Error(`Transcription failed (${response.status}): ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()
    console.log('[Transcription] Success! Text length:', data.text?.length || 0)
    return data.text
  }
}

// Remote LLM Provider (OpenAI-compatible)
export class RemoteLLMProvider implements LLMProvider {
  name = 'remote-llm'
  model: string
  baseUrl: string

  constructor(
    private apiKey: string,
    baseUrl: string = 'https://api.openai.com/v1',
    model: string = 'gpt-4o-mini'
  ) {
    this.baseUrl = baseUrl
    this.model = model
  }

  async generateSummary(prompt: string, context: string): Promise<LLMResult> {
    const startTime = Date.now()
    const requestParams = {
      model: this.model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: context }
      ],
      temperature: 0.7,
      max_tokens: 1000
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestParams)
    })

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.statusText}`)
    }

    const data = await response.json()
    const durationMs = Date.now() - startTime

    return {
      text: data.choices[0].message.content,
      metadata: {
        baseUrl: this.baseUrl,
        model: this.model,
        requestParams: {
          temperature: 0.7,
          max_tokens: 1000
        },
        tokensUsed: data.usage?.total_tokens,
        durationMs
      }
    }
  }

  async generateImageTitleAndDescription(imageBase64: string, mimeType: string): Promise<ImageTitleAndDescription> {
    const startTime = Date.now()
    const requestParams = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this image and provide:
1. A concise title (5-10 words)
2. A detailed description (2-3 sentences) for someone who cannot see the image

Format your response as JSON:
{
  "title": "your title here",
  "description": "your detailed description here"
}`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 200,
      response_format: { type: 'json_object' }
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestParams)
    })

    if (!response.ok) {
      throw new Error(`Image title and description generation failed: ${response.statusText}`)
    }

    const data = await response.json()
    const durationMs = Date.now() - startTime

    // Parse JSON response
    const result = JSON.parse(data.choices[0].message.content)

    return {
      title: result.title?.trim() || '',
      detailedDescription: result.description?.trim() || '',
      metadata: {
        baseUrl: this.baseUrl,
        model: this.model,
        requestParams: {
          max_tokens: 200,
          imageSize: Math.round(imageBase64.length * 0.75)
        },
        tokensUsed: data.usage?.total_tokens,
        durationMs
      }
    }
  }

  async generateTextTitle(bodyText: string, previousTitle?: string): Promise<LLMResult> {
    const startTime = Date.now()

    let prompt: string
    if (previousTitle) {
      prompt = `The current title is: "${previousTitle}"\n\nText content: ${bodyText}\n\nGenerate an updated title (max 60 characters), or keep the current title if it still accurately represents the content. Only output the title, nothing else.`
    } else {
      prompt = `Generate a concise, descriptive title (max 60 characters) for this text note:\n\n${bodyText}\n\nOnly output the title, nothing else.`
    }

    const requestParams = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 30,
      temperature: 0.5
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestParams)
    })

    if (!response.ok) {
      throw new Error(`Text title generation failed: ${response.statusText}`)
    }

    const data = await response.json()
    const durationMs = Date.now() - startTime

    return {
      text: data.choices[0].message.content.trim(),
      metadata: {
        baseUrl: this.baseUrl,
        model: this.model,
        requestParams: {
          max_tokens: 30,
          temperature: 0.5
        },
        tokensUsed: data.usage?.total_tokens,
        durationMs
      }
    }
  }

  async generateTags(captureType: string, title: string, content: string): Promise<TagsResult> {
    const startTime = Date.now()

    const prompt = `Generate 2-10 relevant tags for this ${captureType} capture.

Title: ${title || 'Untitled'}
Content: ${content.slice(0, 500)}

Return tags as a JSON array of strings. Tags should be:
- Single words or short phrases (2-3 words max)
- Lowercase
- Relevant keywords that describe the content
- No duplicates

Example: ["meeting", "project planning", "deadline", "budget"]

Only output the JSON array, nothing else.`

    const requestParams = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 100,
      temperature: 0.3,
      response_format: { type: 'json_object' }
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestParams)
    })

    if (!response.ok) {
      throw new Error(`Tag generation failed: ${response.statusText}`)
    }

    const data = await response.json()
    const durationMs = Date.now() - startTime

    // Parse the response - could be array directly or wrapped in object
    let tags: string[] = []
    try {
      const parsed = JSON.parse(data.choices[0].message.content)
      if (Array.isArray(parsed)) {
        tags = parsed
      } else if (parsed.tags && Array.isArray(parsed.tags)) {
        tags = parsed.tags
      }
    } catch (error) {
      console.error('[LLM] Failed to parse tags JSON:', error)
      tags = []
    }

    // Validate and clean tags
    tags = tags
      .filter(tag => typeof tag === 'string' && tag.trim().length > 0)
      .map(tag => tag.toLowerCase().trim())
      .slice(0, 10) // Max 10 tags

    return {
      tags,
      metadata: {
        baseUrl: this.baseUrl,
        model: this.model,
        requestParams: {
          max_tokens: 100,
          temperature: 0.3
        },
        tokensUsed: data.usage?.total_tokens,
        durationMs
      }
    }
  }

  async chat(messages: ChatMessage[]): Promise<LLMResult> {
    const startTime = Date.now()

    // Convert ChatMessage[] to OpenAI API format (no timestamp field)
    const apiMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }))

    const requestParams = {
      model: this.model,
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: 2000
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestParams)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Chat request failed: ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()
    const durationMs = Date.now() - startTime

    return {
      text: data.choices[0].message.content,
      metadata: {
        baseUrl: this.baseUrl,
        model: this.model,
        requestParams: {
          temperature: 0.7,
          max_tokens: 2000
        },
        tokensUsed: data.usage?.total_tokens,
        durationMs
      }
    }
  }
}

// Disabled LLM Provider (local fallback)
export class DisabledLLMProvider implements LLMProvider {
  name = 'disabled'
  model = 'none'
  baseUrl = undefined

  async generateSummary(_prompt: string, context: string): Promise<LLMResult> {
    // Parse context to extract basic info
    const lines = context.split('\n')
    const captureCount = lines.filter(l => l.includes('Capture:')).length
    const taskCount = lines.filter(l => l.includes('Task:')).length

    const text = `## Project Status (Local Summary)

**Recent Activity:**
- ${captureCount} captures
- ${taskCount} open tasks

**Note:** This is a basic local summary. Enable an LLM provider in settings for AI-generated summaries.

**Recent Items:**
${lines.slice(0, 10).join('\n')}
`

    return {
      text,
      metadata: {
        model: 'none',
        durationMs: 0
      }
    }
  }

  async generateImageTitleAndDescription(_imageBase64: string, _mimeType: string): Promise<ImageTitleAndDescription> {
    // No-op: return empty strings, caller will keep the filename
    return {
      title: '',
      detailedDescription: '',
      metadata: {
        model: 'none',
        durationMs: 0
      }
    }
  }

  async generateTextTitle(_bodyText: string, _previousTitle?: string): Promise<LLMResult> {
    // No-op: return empty string, title stays null
    return {
      text: '',
      metadata: {
        model: 'none',
        durationMs: 0
      }
    }
  }

  async generateTags(_captureType: string, _title: string, _content: string): Promise<TagsResult> {
    // No-op: return empty array
    return {
      tags: [],
      metadata: {
        model: 'none',
        durationMs: 0
      }
    }
  }

  async chat(_messages: ChatMessage[]): Promise<LLMResult> {
    // Return error message
    return {
      text: 'Chat is not available. Please configure an LLM provider in Settings.',
      metadata: {
        model: 'none',
        durationMs: 0
      }
    }
  }
}

// Provider Factory
export class ProviderFactory {
  createTranscriptionProvider(config: {
    apiKey: string
    baseUrl?: string
    model?: string
  }): TranscriptionProvider {
    if (!config.apiKey) {
      throw new Error('API key required for remote transcription')
    }
    return new RemoteTranscriptionProvider(
      config.apiKey,
      config.baseUrl || 'https://api.openai.com/v1',
      config.model || 'whisper-1'
    )
  }

  createLLMProvider(config: {
    type: 'remote' | 'disabled'
    apiKey?: string
    baseUrl?: string
    model?: string
  }): LLMProvider {
    if (config.type === 'remote') {
      // For Ollama and similar local LLM endpoints, API key is optional
      // Check if it's likely an Ollama endpoint
      const isOllamaLike = config.baseUrl?.includes('localhost') ||
                          config.baseUrl?.includes('127.0.0.1') ||
                          config.baseUrl?.includes(':11434') || // Default Ollama port
                          !config.baseUrl?.includes('openai.com')

      if (!config.apiKey && !isOllamaLike) {
        console.warn('[LLM Provider] No API key provided for remote endpoint:', config.baseUrl)
        throw new Error('API key required for remote LLM')
      }

      // Use 'none' as fallback for Ollama-like endpoints without key
      const apiKey = config.apiKey || 'none'
      console.log('[LLM Provider] Creating provider with base URL:', config.baseUrl, 'model:', config.model)
      return new RemoteLLMProvider(apiKey, config.baseUrl, config.model)
    } else {
      return new DisabledLLMProvider()
    }
  }
}

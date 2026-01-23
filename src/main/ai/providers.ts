import { spawn } from 'child_process'
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

export interface LLMProvider {
  name: string
  model: string
  baseUrl?: string
  generateSummary(prompt: string, context: string): Promise<LLMResult>
  generateImageTitle(imageBase64: string, mimeType: string): Promise<LLMResult>
}

// Remote Transcription Provider (OpenAI Whisper API)
export class RemoteTranscriptionProvider implements TranscriptionProvider {
  name = 'remote-whisper'

  constructor(
    private apiKey: string,
    private baseUrl: string = 'https://api.openai.com/v1'
  ) {}

  async transcribe(audioFilePath: string): Promise<string> {
    const formData = new FormData()
    const audioBuffer = fs.readFileSync(audioFilePath)
    const audioBlob = new Blob([audioBuffer])
    formData.append('file', audioBlob, path.basename(audioFilePath))
    formData.append('model', 'whisper-1')

    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: formData
    })

    if (!response.ok) {
      throw new Error(`Transcription failed: ${response.statusText}`)
    }

    const data = await response.json()
    return data.text
  }
}

// Local Transcription Provider (whisper.cpp)
export class LocalTranscriptionProvider implements TranscriptionProvider {
  name = 'local-whisper'

  constructor(
    private whisperBinaryPath: string,
    private modelPath: string
  ) {}

  async transcribe(audioFilePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '-m', this.modelPath,
        '-f', audioFilePath,
        '--output-txt',
        '--no-timestamps'
      ]

      const process = spawn(this.whisperBinaryPath, args)
      let stdout = ''
      let stderr = ''

      process.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      process.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      process.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`whisper.cpp failed: ${stderr}`))
          return
        }

        // whisper.cpp outputs to a .txt file
        const outputFile = audioFilePath + '.txt'
        if (fs.existsSync(outputFile)) {
          const text = fs.readFileSync(outputFile, 'utf-8').trim()
          fs.unlinkSync(outputFile) // Cleanup
          resolve(text)
        } else {
          // Fallback to stdout
          resolve(stdout.trim())
        }
      })
    })
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

  async generateImageTitle(imageBase64: string, mimeType: string): Promise<LLMResult> {
    const startTime = Date.now()
    const requestParams = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Describe this image in 5-10 words as a title. Be concise and specific about what you see.'
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
      max_tokens: 50
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
      throw new Error(`Image title generation failed: ${response.statusText}`)
    }

    const data = await response.json()
    const durationMs = Date.now() - startTime

    return {
      text: data.choices[0].message.content.trim(),
      metadata: {
        baseUrl: this.baseUrl,
        model: this.model,
        requestParams: {
          max_tokens: 50,
          imageSize: Math.round(imageBase64.length * 0.75) // Approximate bytes
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

  async generateImageTitle(_imageBase64: string, _mimeType: string): Promise<LLMResult> {
    // No-op: return empty string, caller will keep the filename
    return {
      text: '',
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
    type: 'remote' | 'local'
    apiKey?: string
    baseUrl?: string
    whisperBinaryPath?: string
    modelPath?: string
  }): TranscriptionProvider {
    if (config.type === 'remote') {
      if (!config.apiKey) {
        throw new Error('API key required for remote transcription')
      }
      return new RemoteTranscriptionProvider(config.apiKey, config.baseUrl)
    } else {
      if (!config.whisperBinaryPath || !config.modelPath) {
        throw new Error('Whisper binary and model path required for local transcription')
      }
      return new LocalTranscriptionProvider(config.whisperBinaryPath, config.modelPath)
    }
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

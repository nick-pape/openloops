import { createOpenAI } from '@ai-sdk/openai'
import { LanguageModel } from 'ai'

/**
 * Create an AI SDK model client from user settings.
 *
 * Uses the OpenAI-compatible provider which works with:
 * - OpenAI API
 * - Ollama (with /v1 endpoint)
 * - Any OpenAI-compatible API
 */
export function createAiSdkModel(config: {
  baseUrl: string
  model: string
  apiKey?: string
}): LanguageModel {
  // Normalize base URL - ensure it has /v1 suffix for OpenAI compatibility
  let baseURL = config.baseUrl.trim()

  // Remove trailing slash
  if (baseURL.endsWith('/')) {
    baseURL = baseURL.slice(0, -1)
  }

  // Ensure /v1 suffix for OpenAI-compatible endpoints
  if (!baseURL.endsWith('/v1')) {
    baseURL = `${baseURL}/v1`
  }

  console.log('[AI SDK] Creating model client')
  console.log('[AI SDK] Base URL:', baseURL)
  console.log('[AI SDK] Model:', config.model)

  const openai = createOpenAI({
    baseURL,
    apiKey: config.apiKey || 'ollama', // Ollama doesn't need a real key
    compatibility: 'compatible', // Use compatible mode for Ollama/other providers
  })

  return openai(config.model)
}

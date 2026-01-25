import express from 'express'
import cors from 'cors'
import { createMCPServer } from './server.js'

/**
 * MCP HTTP Transport
 *
 * Exposes MCP server over HTTP for external agents (Claude Desktop, Goose, etc.)
 * Uses JSON-RPC 2.0 protocol over HTTP POST.
 */

export interface HTTPTransportConfig {
  port: number
  enabled: boolean
  authToken?: string
}

let httpServer: any = null
let expressApp: any = null

export async function startHTTPTransport(config: HTTPTransportConfig): Promise<void> {
  if (!config.enabled) {
    console.log('[MCP HTTP] HTTP transport is disabled in settings')
    return
  }

  if (httpServer) {
    console.log('[MCP HTTP] HTTP transport already running')
    return
  }

  console.log('[MCP HTTP] Starting HTTP transport on port', config.port)

  // Create Express app
  expressApp = express()

  // Enable CORS for all origins (can be restricted in production)
  expressApp.use(cors({
    origin: '*',
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }))

  expressApp.use(express.json())

  // Create MCP server instance
  const mcpServer = createMCPServer()

  // Health check endpoint
  expressApp.get('/health', (_req: any, res: any) => {
    res.json({ status: 'ok', transport: 'http' })
  })

  // MCP endpoint - handles JSON-RPC requests
  expressApp.post('/mcp', async (req: any, res: any) => {
    try {
      // Optional: Check auth token
      if (config.authToken) {
        const authHeader = req.headers.authorization
        const token = authHeader?.replace('Bearer ', '')

        if (token !== config.authToken) {
          console.warn('[MCP HTTP] Unauthorized request - invalid token')
          res.status(401).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Unauthorized: Invalid auth token'
            },
            id: req.body.id || null
          })
          return
        }
      }

      const request = req.body
      console.log('[MCP HTTP] Received request:', request.method)

      // Handle MCP request using the server's request handlers
      let response: any

      if (request.method === 'tools/list') {
        const listHandler = (mcpServer as any)._requestHandlers.get('tools/list')
        response = await listHandler(request)
      } else if (request.method === 'tools/call') {
        const callHandler = (mcpServer as any)._requestHandlers.get('tools/call')
        response = await callHandler(request)
      } else {
        throw new Error(`Unknown method: ${request.method}`)
      }

      // Send JSON-RPC response
      res.json({
        jsonrpc: '2.0',
        result: response,
        id: request.id
      })

      console.log('[MCP HTTP] Request completed:', request.method)
    } catch (error: any) {
      console.error('[MCP HTTP] Request error:', error.message)
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error.message || 'Internal error',
          data: error.stack
        },
        id: req.body.id || null
      })
    }
  })

  // Start HTTP server
  return new Promise((resolve, reject) => {
    httpServer = expressApp.listen(config.port, () => {
      console.log(`[MCP HTTP] HTTP transport started on http://localhost:${config.port}/mcp`)
      resolve()
    }).on('error', (err: any) => {
      console.error('[MCP HTTP] Failed to start HTTP server:', err.message)
      httpServer = null
      reject(err)
    })
  })
}

export async function stopHTTPTransport(): Promise<void> {
  if (!httpServer) {
    console.log('[MCP HTTP] HTTP transport not running')
    return
  }

  console.log('[MCP HTTP] Stopping HTTP transport...')

  return new Promise((resolve) => {
    httpServer.close(() => {
      console.log('[MCP HTTP] HTTP transport stopped')
      httpServer = null
      expressApp = null
      resolve()
    })
  })
}

export function isHTTPTransportRunning(): boolean {
  return httpServer !== null
}

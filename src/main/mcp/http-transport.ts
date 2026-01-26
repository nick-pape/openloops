import express from 'express'
import cors from 'cors'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMCPServer } from './server.js'
import { logger } from '../logger'

/**
 * MCP HTTP Transport
 *
 * Exposes MCP server over HTTP for external agents (Claude Code, Claude Desktop, Goose, etc.)
 * Uses the official MCP SDK StreamableHTTPServerTransport.
 */

export interface HTTPTransportConfig {
  port: number
  enabled: boolean
  authToken?: string
}

let httpServer: any = null
let expressApp: any = null
let transport: StreamableHTTPServerTransport | null = null

export async function startHTTPTransport(config: HTTPTransportConfig): Promise<void> {
  if (!config.enabled) {
    logger.info('[MCP HTTP] HTTP transport is disabled in settings')
    return
  }

  if (httpServer) {
    logger.info('[MCP HTTP] HTTP transport already running')
    return
  }

  logger.info('[MCP HTTP] Starting HTTP transport on port', config.port)

  // Create Express app
  expressApp = express()

  // Enable CORS for all origins (can be restricted in production)
  expressApp.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }))

  expressApp.use(express.json())

  // Create MCP server and transport using SDK
  const mcpServer = createMCPServer()
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined // Stateless mode - no session management needed
  })

  // Connect server to transport
  await mcpServer.connect(transport)

  // Health check endpoint
  expressApp.get('/health', (_req: any, res: any) => {
    res.json({ status: 'ok', transport: 'http' })
  })

  // MCP endpoint - handles all HTTP requests (GET for SSE, POST for JSON-RPC)
  expressApp.all('/mcp', async (req: any, res: any) => {
    try {
      // Optional: Check auth token
      if (config.authToken) {
        const authHeader = req.headers.authorization
        const token = authHeader?.replace('Bearer ', '')

        if (token !== config.authToken) {
          logger.warn('[MCP HTTP] Unauthorized request - invalid token')
          return res.status(401).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Unauthorized: Invalid auth token'
            },
            id: req.body?.id || null
          })
        }
      }

      // Let the SDK transport handle the request
      logger.info('[MCP HTTP] Received request:', req.method, req.body?.method || 'SSE')
      await transport!.handleRequest(req, res, req.body)
    } catch (error: any) {
      logger.error('[MCP HTTP] Request error:', error.message)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error.message || 'Internal error'
          },
          id: req.body?.id || null
        })
      }
    }
  })

  // Start HTTP server
  return new Promise((resolve, reject) => {
    httpServer = expressApp.listen(config.port, () => {
      logger.info(`[MCP HTTP] HTTP transport started on http://localhost:${config.port}/mcp`)
      resolve()
    }).on('error', (err: any) => {
      logger.error('[MCP HTTP] Failed to start HTTP server:', err.message)
      httpServer = null
      transport = null
      reject(err)
    })
  })
}

export async function stopHTTPTransport(): Promise<void> {
  if (!httpServer) {
    logger.info('[MCP HTTP] HTTP transport not running')
    return
  }

  logger.info('[MCP HTTP] Stopping HTTP transport...')

  // Close transport first
  if (transport) {
    await transport.close()
    transport = null
  }

  return new Promise((resolve) => {
    httpServer.close(() => {
      logger.info('[MCP HTTP] HTTP transport stopped')
      httpServer = null
      expressApp = null
      resolve()
    })
  })
}

export function isHTTPTransportRunning(): boolean {
  return httpServer !== null
}

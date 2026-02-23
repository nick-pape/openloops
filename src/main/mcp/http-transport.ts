import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMCPServer } from './server.js'
import { logger } from '../logger'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'

/**
 * MCP HTTP Transport
 *
 * Exposes MCP server over HTTP for external agents (Claude Code, Claude Desktop, Goose, etc.)
 * Uses the official MCP SDK StreamableHTTPServerTransport in stateful mode.
 *
 * Each MCP client session (initialize → tools/list → tools/call → ...) gets its own
 * transport instance and server, tracked by session ID.
 */

export interface HTTPTransportConfig {
  port: number
  enabled: boolean
  authToken?: string
}

let httpServer: any = null
let expressApp: any = null

// Track active sessions: sessionId → { transport, server }
const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: any }>()

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

  // Enable CORS for all origins
  expressApp.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id'],
    exposedHeaders: ['Mcp-Session-Id']
  }))

  expressApp.use(express.json())

  // Health check endpoint
  expressApp.get('/health', (_req: any, res: any) => {
    res.json({ status: 'ok', transport: 'http', sessions: sessions.size })
  })

  // MCP endpoint - handles all HTTP requests
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
            error: { code: -32000, message: 'Unauthorized: Invalid auth token' },
            id: req.body?.id || null
          })
        }
      }

      logger.info('[MCP HTTP] Received request:', req.method, req.body?.method || 'SSE')

      // Check for existing session
      const sessionId = req.headers['mcp-session-id'] as string | undefined

      if (sessionId && sessions.has(sessionId)) {
        // Existing session — route to its transport
        const session = sessions.get(sessionId)!
        await session.transport.handleRequest(req, res, req.body)
        return
      }

      // New session: only allowed for initialize requests
      if (req.method === 'POST' && isInitializeRequest(req.body)) {
        logger.info('[MCP HTTP] New session starting')

        const mcpServer = createMCPServer()
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (sid) => {
            logger.info('[MCP HTTP] Session initialized:', sid)
            sessions.set(sid, { transport, server: mcpServer })
          }
        })

        // Clean up when transport closes
        transport.onclose = () => {
          const sid = transport.sessionId
          if (sid && sessions.has(sid)) {
            logger.info('[MCP HTTP] Session closed:', sid)
            sessions.delete(sid)
            mcpServer.close().catch(() => {})
          }
        }

        await mcpServer.connect(transport)
        await transport.handleRequest(req, res, req.body)
        return
      }

      // Request without valid session and not an initialize
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session. Send an initialize request first.' },
        id: req.body?.id || null
      })
    } catch (error: any) {
      logger.error('[MCP HTTP] Request error:', error.message)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: error.message || 'Internal error' },
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

  // Close all active sessions
  for (const [sid, session] of sessions) {
    logger.info('[MCP HTTP] Closing session:', sid)
    await session.transport.close()
    await session.server.close().catch(() => {})
  }
  sessions.clear()

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

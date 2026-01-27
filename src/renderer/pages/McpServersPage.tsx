import { useState, useEffect } from 'react'
import { McpServerSummary } from '../../types'
import './McpServersPage.css'

export function McpServersPage() {
  const [servers, setServers] = useState<McpServerSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadServers()
  }, [])

  async function loadServers() {
    try {
      const data = await window.electron.mcpServers.list()
      setServers(data)
    } catch (error) {
      console.error('[MCP Servers] Error loading servers:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="mcp-servers-page">
        <div className="page-header">
          <h1>MCP Servers</h1>
        </div>
        <div className="loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="mcp-servers-page">
      <div className="page-header">
        <h1>MCP Servers</h1>
        <p className="page-description">
          MCP (Model Context Protocol) servers provide tools for agents.
        </p>
      </div>

      <div className="servers-list">
        {servers.map((server) => (
          <div
            key={server.id}
            className={`server-card ${server.isBuiltIn ? 'built-in' : ''}`}
          >
            <div className="server-header">
              <div className="server-name-row">
                <h3>{server.name}</h3>
                {server.isBuiltIn && <span className="badge built-in-badge">Built-in</span>}
              </div>
              <div className="server-status">
                <span className={`status-indicator ${server.status.connected ? 'connected' : 'disconnected'}`} />
                <span className="status-text">
                  {server.status.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            {server.description && (
              <p className="server-description">{server.description}</p>
            )}

            <div className="server-details">
              <div className="detail-row">
                <span className="detail-label">Transport:</span>
                <span className="detail-value">{server.transport.kind}</span>
              </div>
              {server.transport.url && (
                <div className="detail-row">
                  <span className="detail-label">URL:</span>
                  <span className="detail-value code">{server.transport.url}</span>
                </div>
              )}
              {server.status.error && (
                <div className="detail-row error">
                  <span className="detail-label">Error:</span>
                  <span className="detail-value">{server.status.error}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {servers.length === 0 && (
        <div className="empty-state">
          <p>No MCP servers configured</p>
        </div>
      )}
    </div>
  )
}

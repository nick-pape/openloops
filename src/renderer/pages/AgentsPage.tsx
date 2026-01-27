import { useState, useEffect } from 'react'
import { AgentSummary } from '../../types'
import './AgentsPage.css'

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAgents()
  }, [])

  async function loadAgents() {
    try {
      const data = await window.electron.agents.list()
      setAgents(data)
    } catch (error) {
      console.error('[Agents] Error loading agents:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="agents-page">
        <div className="page-header">
          <h1>Agents</h1>
        </div>
        <div className="loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="agents-page">
      <div className="page-header">
        <h1>Agents</h1>
        <p className="page-description">
          Agents combine LLM capabilities with MCP tools to perform tasks.
        </p>
      </div>

      <div className="agents-list">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className={`agent-card ${agent.isBuiltIn ? 'built-in' : ''}`}
          >
            <div className="agent-header">
              <div className="agent-name-row">
                <h3>{agent.name}</h3>
                {agent.isBuiltIn && <span className="badge built-in-badge">Built-in</span>}
                {!agent.enabled && <span className="badge disabled-badge">Disabled</span>}
              </div>
            </div>

            <p className="agent-description">{agent.description}</p>

            <div className="agent-details">
              <div className="detail-row">
                <span className="detail-label">MCP Servers:</span>
                <span className="detail-value">{agent.mcpServers.join(', ')}</span>
              </div>
              {agent.toolCount !== undefined && (
                <div className="detail-row">
                  <span className="detail-label">Tools Available:</span>
                  <span className="detail-value">{agent.toolCount}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {agents.length === 0 && (
        <div className="empty-state">
          <p>No agents configured</p>
        </div>
      )}
    </div>
  )
}

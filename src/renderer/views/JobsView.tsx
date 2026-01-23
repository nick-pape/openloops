import { useJobs } from '../contexts/JobsContext'
import './JobsView.css'

export function JobsView() {
  const { jobs, clearCompleted, clearAll } = useJobs()

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return '#4ade80'
      case 'error': return '#f87171'
      case 'processing': return '#60a5fa'
      default: return '#94a3b8'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done': return '✓'
      case 'error': return '✗'
      case 'processing': return '⟳'
      default: return '⋯'
    }
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString()
  }

  const formatDuration = (metadata: string | null) => {
    if (!metadata) return null
    try {
      const meta = JSON.parse(metadata)
      if (meta.durationMs) {
        return `${(meta.durationMs / 1000).toFixed(2)}s`
      }
    } catch {
      return null
    }
    return null
  }

  const parseMetadata = (metadata: string | null) => {
    if (!metadata) return null
    try {
      return JSON.parse(metadata)
    } catch {
      return null
    }
  }

  return (
    <div className="jobs-view">
      <div className="jobs-header">
        <h1>🤖 AI Jobs</h1>
        <div className="button-group">
          <button onClick={clearCompleted} className="clear-button">
            Clear Completed
          </button>
          <button onClick={clearAll} className="clear-all-button">
            Clear All
          </button>
        </div>
      </div>

      <div className="jobs-stats">
        <div className="stat">
          <span className="stat-label">Total:</span>
          <span className="stat-value">{jobs.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Pending:</span>
          <span className="stat-value">{jobs.filter(j => j.status === 'pending').length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Processing:</span>
          <span className="stat-value">{jobs.filter(j => j.status === 'processing').length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Done:</span>
          <span className="stat-value">{jobs.filter(j => j.status === 'done').length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Failed:</span>
          <span className="stat-value">{jobs.filter(j => j.status === 'error').length}</span>
        </div>
      </div>

      <div className="jobs-list">
        {jobs.length === 0 && (
          <div className="empty-state">
            <p>No jobs yet. AI jobs will appear here when you generate summaries or upload images.</p>
          </div>
        )}

        {jobs.map(job => {
          const meta = parseMetadata(job.metadata)
          const duration = formatDuration(job.metadata)

          return (
            <div key={job.id} className="job-card">
              <div className="job-header">
                <div className="job-type-status">
                  <span
                    className="job-status-icon"
                    style={{ color: getStatusColor(job.status) }}
                  >
                    {getStatusIcon(job.status)}
                  </span>
                  <span className="job-type">{job.type}</span>
                  <span className="job-status">{job.status}</span>
                </div>
                <span className="job-time">{formatDate(job.createdAt)}</span>
              </div>

              {job.provider && (
                <div className="job-provider">
                  <span className="label">Provider:</span>
                  <span className="value">{job.provider}</span>
                  {job.model && (
                    <>
                      <span className="separator">•</span>
                      <span className="label">Model:</span>
                      <span className="value">{job.model}</span>
                    </>
                  )}
                  {duration && (
                    <>
                      <span className="separator">•</span>
                      <span className="label">Duration:</span>
                      <span className="value">{duration}</span>
                    </>
                  )}
                </div>
              )}

              {meta && meta.baseUrl && (
                <div className="job-metadata">
                  <span className="label">API:</span>
                  <span className="value mono">{meta.baseUrl}</span>
                </div>
              )}

              {meta && meta.tokensUsed && (
                <div className="job-metadata">
                  <span className="label">Tokens:</span>
                  <span className="value">{meta.tokensUsed}</span>
                </div>
              )}

              {meta && meta.requestParams && (
                <details className="job-details">
                  <summary>Request Parameters</summary>
                  <pre>{JSON.stringify(meta.requestParams, null, 2)}</pre>
                </details>
              )}

              {job.result && (
                <details className="job-details">
                  <summary>Result</summary>
                  <div className="job-result">{job.result.substring(0, 200)}{job.result.length > 200 ? '...' : ''}</div>
                </details>
              )}

              {job.errorMessage && (
                <div className="job-error">
                  <span className="label">Error:</span>
                  <span className="value">{job.errorMessage}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

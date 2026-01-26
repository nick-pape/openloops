import { useState, useEffect } from 'react'
import './ErrorNotification.css'

interface ErrorData {
  title: string
  message: string
  details?: string
}

export function ErrorNotification() {
  const [error, setError] = useState<ErrorData | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    const handleError = (errorData: ErrorData) => {
      setError(errorData)
      setShowDetails(false)

      // Auto-dismiss after 10 seconds
      setTimeout(() => {
        setError(null)
      }, 10000)
    }

    window.electron.onAppError(handleError)

    return () => {
      window.electron.offAppError(handleError)
    }
  }, [])

  if (!error) return null

  return (
    <div className="error-notification">
      <div className="error-content">
        <div className="error-header">
          <span className="error-icon">⚠️</span>
          <h3>{error.title}</h3>
          <button
            className="error-close"
            onClick={() => setError(null)}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="error-message">{error.message}</p>
        {error.details && (
          <div className="error-details-section">
            <button
              className="error-details-toggle"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? '▼' : '▶'} Technical Details
            </button>
            {showDetails && (
              <pre className="error-details">{error.details}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

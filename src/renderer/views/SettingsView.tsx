import { useState, useEffect } from 'react'
import './SettingsView.css'

export function SettingsView() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [testingLLM, setTestingLLM] = useState(false)
  const [testingTranscription, setTestingTranscription] = useState(false)
  const [llmTestResult, setLLMTestResult] = useState<string>('')
  const [transcriptionTestResult, setTranscriptionTestResult] = useState<string>('')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [mcpHttpStatus, setMcpHttpStatus] = useState<{ running: boolean; port: number } | null>(null)
  const [mcpHttpLoading, setMcpHttpLoading] = useState(false)

  useEffect(() => {
    loadSettings()
    loadMCPHttpStatus()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const allSettings = await window.electron.settings.getAll()
      setSettings(allSettings)

      // Load secrets
      const transcriptionApiKey = await window.electron.secrets.get('transcription_api_key')
      const llmApiKey = await window.electron.secrets.get('llm_api_key')

      setSecrets({
        transcription_api_key: transcriptionApiKey || '',
        llm_api_key: llmApiKey || ''
      })
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
    setLoading(false)
  }

  const handleSettingChange = (key: string, value: string) => {
    setSettings({ ...settings, [key]: value })
  }

  const handleSecretChange = (key: string, value: string) => {
    setSecrets({ ...secrets, [key]: value })
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      // Save settings
      for (const [key, value] of Object.entries(settings)) {
        await window.electron.settings.set(key, value)
      }

      // Save secrets
      for (const [key, value] of Object.entries(secrets)) {
        await window.electron.secrets.set(key, value)
      }

      setMessage('Settings saved successfully')
    } catch (error) {
      console.error('Failed to save settings:', error)
      setMessage('Failed to save settings')
    }
    setSaving(false)
  }

  const handleTestLLMConnection = async () => {
    setTestingLLM(true)
    setLLMTestResult('')
    setAvailableModels([])
    setShowModelDropdown(false)

    const baseUrl = settings.llm_base_url || 'https://api.openai.com/v1'
    const apiKey = secrets.llm_api_key || ''

    if (!apiKey && !baseUrl.includes('localhost')) {
      setLLMTestResult('⚠️ Warning: No API key provided')
      setTestingLLM(false)
      return
    }

    try {
      const result = await window.electron.llm.testConnection(baseUrl, apiKey)

      if (result.success && result.models) {
        setLLMTestResult(`✅ Connected! Found ${result.models.length} models`)
        setAvailableModels(result.models)
        setShowModelDropdown(true)
      } else {
        setLLMTestResult(`❌ Connection failed: ${result.error}`)
      }
    } catch (error: any) {
      setLLMTestResult(`❌ Error: ${error.message}`)
    }

    setTestingLLM(false)
  }

  const handleTestTranscriptionConnection = async () => {
    setTestingTranscription(true)
    setTranscriptionTestResult('')

    const baseUrl = settings.transcription_base_url || 'https://api.openai.com/v1'
    const apiKey = secrets.transcription_api_key || ''

    if (!apiKey && !baseUrl.includes('localhost')) {
      setTranscriptionTestResult('⚠️ Warning: No API key provided')
      setTestingTranscription(false)
      return
    }

    try {
      const result = await window.electron.transcription.testConnection(baseUrl, apiKey)

      if (result.success) {
        setTranscriptionTestResult(`✅ Connected! ${result.message}`)
      } else {
        setTranscriptionTestResult(`❌ Connection failed: ${result.error}`)
      }
    } catch (error: any) {
      setTranscriptionTestResult(`❌ Error: ${error.message}`)
    }

    setTestingTranscription(false)
  }

  const loadMCPHttpStatus = async () => {
    try {
      const status = await window.electron.mcp.http.status()
      setMcpHttpStatus(status)
    } catch (error) {
      console.error('Failed to load MCP HTTP status:', error)
    }
  }

  const handleMCPHttpStart = async () => {
    setMcpHttpLoading(true)
    try {
      await window.electron.mcp.http.start()
      await loadMCPHttpStatus()
      setMessage('MCP HTTP transport started successfully')
    } catch (error: any) {
      setMessage(`Failed to start MCP HTTP transport: ${error.message}`)
    }
    setMcpHttpLoading(false)
  }

  const handleMCPHttpStop = async () => {
    setMcpHttpLoading(true)
    try {
      await window.electron.mcp.http.stop()
      await loadMCPHttpStatus()
      setMessage('MCP HTTP transport stopped successfully')
    } catch (error: any) {
      setMessage(`Failed to stop MCP HTTP transport: ${error.message}`)
    }
    setMcpHttpLoading(false)
  }

  if (loading) {
    return <div className="loading">Loading settings...</div>
  }

  return (
    <div className="settings-view">
      <h1>Settings</h1>

      {message && (
        <div className={message.includes('success') ? 'success' : 'error'}>
          {message}
        </div>
      )}

      <div className="settings-section">
        <h2>Transcription Provider (OpenAI-Compatible API)</h2>
        <div className="form-group">
          <label>API Key</label>
          <input
            type="password"
            value={secrets.transcription_api_key}
            onChange={(e) => handleSecretChange('transcription_api_key', e.target.value)}
            placeholder="sk-..."
          />
        </div>
        <div className="form-group">
          <label>Base URL (optional, for OpenAI-compatible endpoints)</label>
          <div className="input-with-button">
            <input
              type="text"
              value={settings.transcription_base_url || ''}
              onChange={(e) => handleSettingChange('transcription_base_url', e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
            <button
              onClick={handleTestTranscriptionConnection}
              disabled={testingTranscription}
              className="test-button"
            >
              {testingTranscription ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
          {transcriptionTestResult && (
            <div className={`test-result ${transcriptionTestResult.includes('✅') ? 'success' : 'error'}`}>
              {transcriptionTestResult}
            </div>
          )}
        </div>
      </div>

      <div className="settings-section">
        <h2>LLM Provider (for Summaries)</h2>
        <div className="form-group">
          <label>Provider Type</label>
          <select
            value={settings.llm_type || 'disabled'}
            onChange={(e) => handleSettingChange('llm_type', e.target.value)}
          >
            <option value="disabled">Disabled (Local Fallback)</option>
            <option value="remote">Remote (OpenAI-compatible)</option>
          </select>
        </div>

        {settings.llm_type === 'remote' && (
          <>
            <div className="form-group">
              <label>API Key</label>
              <input
                type="password"
                value={secrets.llm_api_key}
                onChange={(e) => handleSecretChange('llm_api_key', e.target.value)}
                placeholder="sk-... (or 'ollama' for local)"
              />
            </div>
            <div className="form-group">
              <label>Base URL</label>
              <div className="input-with-button">
                <input
                  type="text"
                  value={settings.llm_base_url || ''}
                  onChange={(e) => handleSettingChange('llm_base_url', e.target.value)}
                  placeholder="https://api.openai.com/v1 or http://localhost:11434/v1"
                />
                <button
                  onClick={handleTestLLMConnection}
                  disabled={testingLLM}
                  className="test-button"
                >
                  {testingLLM ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
              {llmTestResult && (
                <div className={`test-result ${llmTestResult.includes('✅') ? 'success' : 'error'}`}>
                  {llmTestResult}
                </div>
              )}
            </div>
            <div className="form-group">
              <label>Model</label>
              {showModelDropdown && availableModels.length > 0 ? (
                <div className="model-selector">
                  <select
                    value={settings.llm_model || ''}
                    onChange={(e) => {
                      handleSettingChange('llm_model', e.target.value)
                      setShowModelDropdown(false)
                    }}
                  >
                    <option value="">Select a model...</option>
                    {availableModels.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                  <button
                    className="secondary small"
                    onClick={() => setShowModelDropdown(false)}
                  >
                    Enter manually
                  </button>
                </div>
              ) : (
                <div className="model-selector">
                  <input
                    type="text"
                    value={settings.llm_model || ''}
                    onChange={(e) => handleSettingChange('llm_model', e.target.value)}
                    placeholder="gpt-4o-mini, mistral, llama2, etc."
                  />
                  {availableModels.length > 0 && (
                    <button
                      className="secondary small"
                      onClick={() => setShowModelDropdown(true)}
                    >
                      Choose from list
                    </button>
                  )}
                </div>
              )}
              <small>For Ollama: Use model name from 'ollama list' (e.g., mistral, llama2)</small>
            </div>
          </>
        )}
      </div>

      <div className="settings-section">
        <h2>Planning Settings</h2>
        <div className="form-group">
          <label>Working Hours Start (0-23)</label>
          <input
            type="number"
            value={settings.working_hours_start || '9'}
            onChange={(e) => handleSettingChange('working_hours_start', e.target.value)}
            min={0}
            max={23}
          />
        </div>
        <div className="form-group">
          <label>Working Hours End (0-23)</label>
          <input
            type="number"
            value={settings.working_hours_end || '17'}
            onChange={(e) => handleSettingChange('working_hours_end', e.target.value)}
            min={0}
            max={23}
          />
        </div>
        <div className="form-group">
          <label>Minimum Block Size (minutes)</label>
          <input
            type="number"
            value={settings.min_block_size_minutes || '30'}
            onChange={(e) => handleSettingChange('min_block_size_minutes', e.target.value)}
            min={5}
            step={5}
          />
        </div>
      </div>

      <div className="settings-section">
        <h2>Summary Settings</h2>
        <div className="form-group">
          <label>Lookback Window (days)</label>
          <input
            type="number"
            value={settings.summary_lookback_days || '14'}
            onChange={(e) => handleSettingChange('summary_lookback_days', e.target.value)}
            min={1}
            max={90}
          />
        </div>
      </div>

      <div className="settings-section">
        <h2>MCP HTTP Transport (External Agents)</h2>
        <p className="section-description">
          Enable HTTP transport to allow external agents (Claude Desktop, Goose) to connect to Open Loops.
        </p>

        <div className="form-group">
          <label>Enable HTTP Transport</label>
          <select
            value={settings['mcp.http.enabled'] || 'false'}
            onChange={(e) => handleSettingChange('mcp.http.enabled', e.target.value)}
          >
            <option value="false">Disabled</option>
            <option value="true">Enabled</option>
          </select>
        </div>

        {settings['mcp.http.enabled'] === 'true' && (
          <>
            <div className="form-group">
              <label>Port</label>
              <input
                type="number"
                value={settings['mcp.http.port'] || '3000'}
                onChange={(e) => handleSettingChange('mcp.http.port', e.target.value)}
                min={1024}
                max={65535}
              />
              <small>Port for HTTP server (default: 3000)</small>
            </div>

            <div className="form-group">
              <label>Auth Token (optional)</label>
              <input
                type="password"
                value={settings['mcp.http.authToken'] || ''}
                onChange={(e) => handleSettingChange('mcp.http.authToken', e.target.value)}
                placeholder="Leave empty for no authentication"
              />
              <small>Token for Bearer authentication (recommended for security)</small>
            </div>

            <div className="form-group">
              <label>Status</label>
              <div className="mcp-status">
                {mcpHttpStatus ? (
                  <div className={mcpHttpStatus.running ? 'status-running' : 'status-stopped'}>
                    {mcpHttpStatus.running ? (
                      <>
                        <span>✅ Running on port {mcpHttpStatus.port}</span>
                        <button onClick={handleMCPHttpStop} disabled={mcpHttpLoading}>
                          {mcpHttpLoading ? 'Stopping...' : 'Stop'}
                        </button>
                      </>
                    ) : (
                      <>
                        <span>⭕ Stopped</span>
                        <button onClick={handleMCPHttpStart} disabled={mcpHttpLoading}>
                          {mcpHttpLoading ? 'Starting...' : 'Start'}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <span>Loading status...</span>
                )}
              </div>
              <small>
                Save settings first, then start the HTTP transport.
                Connection URL: http://localhost:{settings['mcp.http.port'] || '3000'}/mcp
              </small>
            </div>
          </>
        )}
      </div>

      <div className="settings-actions">
        <button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

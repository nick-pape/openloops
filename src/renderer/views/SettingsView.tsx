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
  const [availableLLMModels, setAvailableLLMModels] = useState<string[]>([])
  const [availableTranscriptionModels, setAvailableTranscriptionModels] = useState<string[]>([])
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [mcpHttpStatus, setMcpHttpStatus] = useState<{ running: boolean; port: number } | null>(null)
  const [mcpHttpLoading, setMcpHttpLoading] = useState(false)
  const [msGraphConfigured, setMsGraphConfigured] = useState(false)
  const [msGraphConnected, setMsGraphConnected] = useState(false)
  const [msGraphProfile, setMsGraphProfile] = useState<{ displayName: string; mail: string } | null>(null)
  const [msGraphLastSync, setMsGraphLastSync] = useState<Date | null>(null)
  const [msGraphConnecting, setMsGraphConnecting] = useState(false)
  const [msGraphClientId, setMsGraphClientId] = useState('')
  const [msGraphClientIdSaving, setMsGraphClientIdSaving] = useState(false)
  const [msGraphShowInstructions, setMsGraphShowInstructions] = useState(false)
  const [msGraphCalendars, setMsGraphCalendars] = useState<any[]>([])
  const [msGraphSelectedCalendars, setMsGraphSelectedCalendars] = useState<string[]>([])
  const [msGraphLoadingCalendars, setMsGraphLoadingCalendars] = useState(false)

  useEffect(() => {
    loadSettings()
    loadMCPHttpStatus()
    loadMsGraphStatus()
  }, [])

  const loadMsGraphStatus = async () => {
    try {
      // Load client ID
      const clientId = await window.electron.microsoftGraph.getClientId()
      setMsGraphClientId(clientId || '')

      const configured = await window.electron.microsoftGraph.isConfigured()
      setMsGraphConfigured(configured)

      if (configured) {
        const connected = await window.electron.microsoftGraph.isConnected()
        setMsGraphConnected(connected)

        if (connected) {
          const profile = await window.electron.microsoftGraph.getUserProfile()
          setMsGraphProfile(profile)

          const lastSync = await window.electron.microsoftGraph.getLastSyncTime()
          setMsGraphLastSync(lastSync)

          // Load calendars and selected calendars
          await loadMsGraphCalendars()
        }
      }
    } catch (error) {
      console.error('Failed to load Microsoft Graph status:', error)
    }
  }

  const loadMsGraphCalendars = async () => {
    setMsGraphLoadingCalendars(true)
    try {
      const calendars = await window.electron.microsoftGraph.listCalendars()
      setMsGraphCalendars(calendars)

      const selected = await window.electron.microsoftGraph.getSelectedCalendars()
      setMsGraphSelectedCalendars(selected)

      console.log('[Settings] Loaded calendars:', calendars.length, 'selected:', selected.length)
    } catch (error: any) {
      console.error('Failed to load calendars:', error)

      // If account not in cache, user needs to reconnect
      if (error.message && error.message.includes('Account not found in cache')) {
        setMessage('Session expired. Please reconnect your Microsoft account.')
        setMsGraphConnected(false)
        setMsGraphProfile(null)
      }
    }
    setMsGraphLoadingCalendars(false)
  }

  const handleToggleCalendar = async (calendarId: string) => {
    const newSelection = msGraphSelectedCalendars.includes(calendarId)
      ? msGraphSelectedCalendars.filter(id => id !== calendarId)
      : [...msGraphSelectedCalendars, calendarId]

    setMsGraphSelectedCalendars(newSelection)

    try {
      await window.electron.microsoftGraph.setSelectedCalendars(newSelection)
      console.log('[Settings] Updated selected calendars:', newSelection)
    } catch (error) {
      console.error('Failed to save selected calendars:', error)
      setMessage('Failed to save calendar selection')
    }
  }

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

  const handleConnectMicrosoft = async () => {
    setMsGraphConnecting(true)
    try {
      await window.electron.microsoftGraph.connect()
      await loadMsGraphStatus()
      setMessage('Microsoft account connected successfully')
    } catch (error: any) {
      console.error('Failed to connect Microsoft account:', error)
      setMessage(`Failed to connect: ${error.message || 'Unknown error'}`)
    }
    setMsGraphConnecting(false)
  }

  const handleDisconnectMicrosoft = async () => {
    if (!confirm('Disconnect Microsoft account? You will need to reconnect to sync calendar events.')) {
      return
    }

    try {
      await window.electron.microsoftGraph.disconnect()
      await loadMsGraphStatus()
      setMessage('Microsoft account disconnected')
    } catch (error: any) {
      console.error('Failed to disconnect Microsoft account:', error)
      setMessage(`Failed to disconnect: ${error.message || 'Unknown error'}`)
    }
  }

  const handleSaveClientId = async () => {
    if (!msGraphClientId.trim()) {
      setMessage('Please enter a valid Client ID')
      return
    }

    setMsGraphClientIdSaving(true)
    try {
      await window.electron.microsoftGraph.setClientId(msGraphClientId.trim())
      await loadMsGraphStatus()
      setMessage('Client ID saved successfully. You can now connect your Microsoft account.')
    } catch (error: any) {
      console.error('Failed to save Client ID:', error)
      setMessage(`Failed to save Client ID: ${error.message || 'Unknown error'}`)
    }
    setMsGraphClientIdSaving(false)
  }

  const handleTestLLMConnection = async () => {
    setTestingLLM(true)
    setLLMTestResult('')
    setAvailableLLMModels([])
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
        setAvailableLLMModels(result.models)
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
        if (result.models && result.models.length > 0) {
          setAvailableTranscriptionModels(result.models)
          setTranscriptionTestResult(`✅ Connected! Found ${result.models.length} models`)
        } else {
          setTranscriptionTestResult(`✅ Connected! ${result.message}`)
        }
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
        <h2>Microsoft Calendar Sync</h2>

        {!msGraphConfigured ? (
          <div>
            <button
              onClick={() => setMsGraphShowInstructions(!msGraphShowInstructions)}
              className="collapse-button"
              style={{ marginBottom: '1rem' }}
            >
              {msGraphShowInstructions ? '▼' : '▶'} Azure Setup Instructions
            </button>

            {msGraphShowInstructions && (
              <div className="info-box" style={{ marginBottom: '1rem' }}>
                <p><strong>Setup Instructions:</strong></p>
                <ol style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                  <li>Go to <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer">Azure Portal</a></li>
                  <li>Search for "App registrations" → Click "+ New registration"</li>
                  <li>Name: "Open Loops Calendar Sync"</li>
                  <li>Account types: "Accounts in any organizational directory and personal Microsoft accounts"</li>
                  <li>Redirect URI: Select "Public client/native" → Enter: <code>http://localhost:3001/auth/callback</code></li>
                  <li>Click "Register" and copy the <strong>Application (client) ID</strong></li>
                  <li>Go to Authentication → Enable "Allow public client flows" → Save</li>
                  <li>Go to API permissions → Add permission → Microsoft Graph → Delegated → <code>Calendars.Read</code></li>
                  <li>Paste your Client ID below</li>
                </ol>
                <p style={{ marginTop: '1rem' }}>See <code>docs/MICROSOFT_GRAPH_SETUP.md</code> for detailed instructions.</p>
              </div>
            )}

            <div className="form-group">
              <label><strong>Azure Application (client) ID</strong></label>
              <div className="input-with-button">
                <input
                  type="text"
                  value={msGraphClientId}
                  onChange={(e) => setMsGraphClientId(e.target.value)}
                  placeholder="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                  style={{ fontFamily: 'monospace' }}
                />
                <button
                  onClick={handleSaveClientId}
                  disabled={msGraphClientIdSaving || !msGraphClientId.trim()}
                  className="test-button"
                >
                  {msGraphClientIdSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
              <small className="help-text">
                Paste the Application (client) ID from Azure Portal
              </small>
            </div>
          </div>
        ) : !msGraphConnected ? (
          <div>
            <div className="form-group">
              <label><strong>Azure Application (client) ID</strong></label>
              <div className="input-with-button">
                <input
                  type="text"
                  value={msGraphClientId}
                  onChange={(e) => setMsGraphClientId(e.target.value)}
                  placeholder="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                  style={{ fontFamily: 'monospace' }}
                />
                <button
                  onClick={handleSaveClientId}
                  disabled={msGraphClientIdSaving || !msGraphClientId.trim()}
                  className="test-button"
                >
                  {msGraphClientIdSaving ? 'Saving...' : 'Update'}
                </button>
              </div>
              <small className="help-text">
                Your Azure Client ID is configured
              </small>
            </div>

            <p style={{ marginTop: '1rem' }}>Connect your Microsoft account to sync calendar events from Outlook or Microsoft 365.</p>
            <button
              onClick={handleConnectMicrosoft}
              disabled={msGraphConnecting}
              className="primary-button"
            >
              {msGraphConnecting ? 'Connecting...' : 'Connect Microsoft Account'}
            </button>
          </div>
        ) : (
          <div>
            <div className="connection-info">
              <p><strong>Status:</strong> Connected</p>
              {msGraphProfile && (
                <>
                  <p><strong>Account:</strong> {msGraphProfile.displayName} ({msGraphProfile.mail})</p>
                </>
              )}
              {msGraphLastSync && (
                <p><strong>Last synced:</strong> {new Date(msGraphLastSync).toLocaleString()}</p>
              )}
            </div>

            <div className="calendar-selection" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Calendars to Sync</h3>
              {msGraphLoadingCalendars ? (
                <p style={{ color: '#666', fontSize: '0.875rem' }}>Loading calendars...</p>
              ) : msGraphCalendars.length === 0 ? (
                <p style={{ color: '#666', fontSize: '0.875rem' }}>
                  No calendars found. <button onClick={loadMsGraphCalendars} style={{ textDecoration: 'underline', background: 'none', border: 'none', color: '#2196f3', cursor: 'pointer' }}>Reload</button>
                </p>
              ) : (
                <div className="calendar-list">
                  {msGraphCalendars.map(calendar => (
                    <label key={calendar.id} className="calendar-item">
                      <input
                        type="checkbox"
                        checked={msGraphSelectedCalendars.includes(calendar.id)}
                        onChange={() => handleToggleCalendar(calendar.id)}
                      />
                      <span className="calendar-name">
                        {calendar.name}
                        {calendar.isDefaultCalendar && <span className="calendar-badge">Default</span>}
                        {calendar.owner && calendar.owner.address !== msGraphProfile?.mail && (
                          <span className="calendar-badge shared">Shared by {calendar.owner.name}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                {msGraphSelectedCalendars.length === 0 ? 'All calendars selected by default (primary calendar only)' : `${msGraphSelectedCalendars.length} calendar(s) selected`}
              </p>
            </div>

            <button onClick={handleDisconnectMicrosoft} className="danger-button">
              Disconnect Account
            </button>
          </div>
        )}
      </div>

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
        <div className="form-group">
          <label>Model</label>
          {availableTranscriptionModels.length > 0 ? (
            <select
              value={settings.transcription_model || ''}
              onChange={(e) => handleSettingChange('transcription_model', e.target.value)}
            >
              <option value="">Select a model...</option>
              {availableTranscriptionModels.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={settings.transcription_model || ''}
              onChange={(e) => handleSettingChange('transcription_model', e.target.value)}
              placeholder="whisper-1"
            />
          )}
          <small className="help-text">
            Test connection to populate model list from API
          </small>
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
            <option value="claude-code">Claude Code (uses Claude subscription)</option>
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
              {showModelDropdown && availableLLMModels.length > 0 ? (
                <div className="model-selector">
                  <select
                    value={settings.llm_model || ''}
                    onChange={(e) => {
                      handleSettingChange('llm_model', e.target.value)
                      setShowModelDropdown(false)
                    }}
                  >
                    <option value="">Select a model...</option>
                    {availableLLMModels.map(model => (
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
                  {availableLLMModels.length > 0 && (
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

        {settings.llm_type === 'claude-code' && (
          <>
            <div className="form-group">
              <label>Model</label>
              <select
                value={settings.llm_model || 'sonnet'}
                onChange={(e) => handleSettingChange('llm_model', e.target.value)}
              >
                <option value="sonnet">Sonnet (balanced)</option>
                <option value="opus">Opus (most capable)</option>
                <option value="haiku">Haiku (fastest)</option>
              </select>
              <small>Uses your existing Claude subscription. No API key needed.</small>
            </div>
            <div className="info-box">
              <p><strong>Setup:</strong> Run <code>claude auth login</code> in your terminal to authenticate.
              The MCP HTTP transport will be auto-started when you chat.</p>
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

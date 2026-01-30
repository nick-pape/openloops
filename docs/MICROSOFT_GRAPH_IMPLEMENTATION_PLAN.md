# Microsoft Graph Calendar Sync - Implementation Plan

**Based on:** [Specification Document](./MICROSOFT_GRAPH_CALENDAR_SYNC_SPEC.md)
**Version:** 1.0
**Estimated Total Time:** 12-16 hours

## Phase 1: Foundation & Dependencies (2-3 hours)

### 1.1 Install NPM Packages
**Time:** 15 minutes

```bash
npm install @azure/msal-node @microsoft/microsoft-graph-client isomorphic-fetch
```

**Verification:**
- Packages appear in `package.json`
- No build errors after install
- TypeScript types available

### 1.2 Create Configuration Module
**Time:** 30 minutes

**File:** `src/main/config/microsoft-graph.ts`

```typescript
export interface MSGraphConfig {
  clientId: string
  authority: string
  redirectUri: string
  scopes: string[]
}

export const getMSGraphConfig = (): MSGraphConfig => {
  return {
    clientId: process.env.MS_GRAPH_CLIENT_ID || 'YOUR_CLIENT_ID_HERE',
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: 'http://localhost:3001/auth/callback',
    scopes: [
      'openid',
      'profile',
      'offline_access',
      'User.Read',
      'Calendars.Read'
    ]
  }
}
```

**Tasks:**
- Create config file
- Add TypeScript interfaces
- Add env variable support
- Add validation for required config

**Verification:**
- Config exports without errors
- Can import config in other files

### 1.3 Update Database Schema
**Time:** 45 minutes

**File:** `src/main/db/migrations.ts`

Add migration for Microsoft account settings:

```typescript
{
  version: 10,
  name: 'add-microsoft-graph-settings',
  up: (db) => {
    db.exec(`
      -- Add settings for Microsoft Graph connection
      INSERT OR IGNORE INTO settings (key, value) VALUES ('ms_graph_connected', 'false');
      INSERT OR IGNORE INTO settings (key, value) VALUES ('ms_graph_user_email', NULL);
      INSERT OR IGNORE INTO settings (key, value) VALUES ('ms_graph_user_name', NULL);
      INSERT OR IGNORE INTO settings (key, value) VALUES ('ms_graph_last_sync', NULL);

      -- Note: Refresh token will be stored via keytar or encrypted in 'secret_ms_graph_refresh_token'
    `)
  }
}
```

**Tasks:**
- Create migration v10
- Add settings keys
- Test migration runs successfully
- Verify settings table has new rows

**Verification:**
- Migration runs without errors
- `SELECT * FROM settings WHERE key LIKE 'ms_graph%'` returns 4 rows

### 1.4 Add Type Definitions
**Time:** 30 minutes

**File:** `src/types/index.ts`

```typescript
export interface MSGraphConnection {
  connected: boolean
  userEmail: string | null
  userName: string | null
  lastSync: Date | null
}

export interface MSGraphEvent {
  id: string
  subject: string
  start: {
    dateTime: string
    timeZone: string
  }
  end: {
    dateTime: string
    timeZone: string
  }
  location?: {
    displayName: string
  }
  isAllDay: boolean
  isCancelled: boolean
  organizer?: {
    emailAddress: {
      name: string
      address: string
    }
  }
}
```

**Tasks:**
- Add MS Graph type definitions
- Add connection status type
- Export all types

**Verification:**
- Types available for import
- No TypeScript errors

---

## Phase 2: Authentication Service (3-4 hours)

### 2.1 Create MSAL Authentication Service
**Time:** 2 hours

**File:** `src/main/auth/microsoft-auth.ts`

**Key Components:**
- `PublicClientApplication` initialization
- `getAuthCodeUrl()` - Generate login URL with PKCE
- `acquireTokenByCode()` - Exchange code for tokens
- `acquireTokenSilent()` - Refresh expired tokens
- Token cache management

**Tasks:**
- Initialize MSAL PublicClientApplication
- Implement PKCE flow (code verifier/challenge)
- Add token acquisition methods
- Add token refresh logic
- Add error handling for common auth errors

**Code Structure:**
```typescript
export class MicrosoftAuthService {
  private msalClient: PublicClientApplication

  constructor(config: MSGraphConfig) {
    this.msalClient = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: config.authority
      }
    })
  }

  async getAuthCodeUrl(state: string): Promise<string> {
    // Generate PKCE verifier/challenge
    // Build authorization URL
    // Return URL for browser
  }

  async acquireTokenByCode(code: string, codeVerifier: string): Promise<AuthenticationResult> {
    // Exchange authorization code for tokens
  }

  async acquireTokenSilent(account: AccountInfo): Promise<AuthenticationResult> {
    // Refresh token if needed
  }
}
```

**Verification:**
- Service instantiates without errors
- Can generate auth URLs
- Can acquire tokens (with test credentials)

### 2.2 Create Local Redirect Server
**Time:** 1 hour

**File:** `src/main/auth/redirect-server.ts`

**Purpose:** Temporary HTTP server to capture OAuth callback

**Tasks:**
- Create Express server on port 3001
- Handle GET /auth/callback route
- Parse authorization code from query params
- Send success page to browser
- Auto-shutdown after capturing code
- Handle timeout (user doesn't complete auth)

**Code Structure:**
```typescript
export class RedirectServer {
  private server: http.Server | null = null

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      // Create HTTP server
      // Listen on /auth/callback
      // Resolve with authorization code
      // Reject on timeout (60 seconds)
    })
  }

  stop() {
    // Close server
  }
}
```

**Verification:**
- Server starts on port 3001
- Can visit http://localhost:3001/auth/callback?code=test
- Returns authorization code
- Auto-shuts down after success

### 2.3 Create Token Storage Service
**Time:** 1 hour

**File:** `src/main/auth/token-storage.ts`

**Two Implementations:**

**Option A: Keytar (OS-level secure storage)**
```typescript
import keytar from 'keytar'

export async function storeRefreshToken(email: string, token: string): Promise<void> {
  await keytar.setPassword('OpenLoops', email, token)
}

export async function getRefreshToken(email: string): Promise<string | null> {
  return await keytar.getPassword('OpenLoops', email)
}

export async function deleteRefreshToken(email: string): Promise<void> {
  await keytar.deletePassword('OpenLoops', email)
}
```

**Option B: Encrypted DB Storage (fallback)**
```typescript
import crypto from 'crypto'

const ENCRYPTION_KEY = crypto.randomBytes(32) // Store in env
const IV_LENGTH = 16

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

function decrypt(text: string): string {
  const parts = text.split(':')
  const iv = Buffer.from(parts[0], 'hex')
  const encryptedText = parts[1]
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
```

**Tasks:**
- Implement token storage interface
- Add encryption for DB storage
- Add keytar support (try/catch, fallback to DB)
- Add repository methods for token CRUD

**Verification:**
- Can store and retrieve tokens
- Tokens are encrypted in DB (if using DB storage)
- Delete token removes it completely

---

## Phase 3: Microsoft Graph API Client (2-3 hours)

### 3.1 Create Graph Client Wrapper
**Time:** 1.5 hours

**File:** `src/main/graph/graph-client.ts`

**Tasks:**
- Initialize Microsoft Graph Client
- Add authentication provider that uses MSAL tokens
- Implement `getCalendarEvents()` method
- Implement `getUserProfile()` method
- Add error handling and retry logic

**Code Structure:**
```typescript
import { Client } from '@microsoft/microsoft-graph-client'
import 'isomorphic-fetch'

export class MSGraphClient {
  private client: Client

  constructor(private authService: MicrosoftAuthService, private account: AccountInfo) {
    this.client = Client.init({
      authProvider: async (done) => {
        try {
          const result = await this.authService.acquireTokenSilent(this.account)
          done(null, result.accessToken)
        } catch (error) {
          done(error, null)
        }
      }
    })
  }

  async getCalendarEvents(startDate: Date, endDate: Date): Promise<MSGraphEvent[]> {
    const response = await this.client
      .api('/me/calendarView')
      .query({
        startDateTime: startDate.toISOString(),
        endDateTime: endDate.toISOString(),
        $select: 'subject,start,end,location,isAllDay,isCancelled,organizer',
        $orderby: 'start/dateTime',
        $top: 100
      })
      .get()

    return response.value
  }

  async getUserProfile(): Promise<{ email: string; name: string }> {
    const user = await this.client.api('/me').select('mail,displayName').get()
    return {
      email: user.mail || user.userPrincipalName,
      name: user.displayName
    }
  }
}
```

**Verification:**
- Client initializes without errors
- Can fetch user profile (with test auth)
- Can fetch calendar events (with test auth)

### 3.2 Create Calendar Sync Service
**Time:** 1.5 hours

**File:** `src/main/graph/calendar-sync.ts`

**Tasks:**
- Implement sync logic
- Parse MS Graph events
- Convert timezones to UTC
- Map to Open Loops schema
- Upsert calendar events by `externalUid`
- Filter out cancelled events
- Handle pagination (if >100 events)

**Code Structure:**
```typescript
export class CalendarSyncService {
  constructor(
    private graphClient: MSGraphClient,
    private repository: Repository
  ) {}

  async syncCalendar(): Promise<{ syncedCount: number; errors: string[] }> {
    // Calculate date range (today -1 to today +6)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 1)
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + 6)

    // Fetch events from Graph API
    const events = await this.graphClient.getCalendarEvents(startDate, endDate)

    // Filter out cancelled events
    const activeEvents = events.filter(e => !e.isCancelled)

    let syncedCount = 0
    const errors: string[] = []

    for (const event of activeEvents) {
      try {
        await this.upsertCalendarEvent(event)
        syncedCount++
      } catch (error) {
        errors.push(`Failed to sync event "${event.subject}": ${error.message}`)
      }
    }

    // Update last sync timestamp
    await this.repository.setSetting('ms_graph_last_sync', new Date().toISOString())

    return { syncedCount, errors }
  }

  private async upsertCalendarEvent(event: MSGraphEvent) {
    const externalUid = `ms-graph-${event.id}`

    // Check if event exists
    const existing = await this.repository.getCalendarEventByExternalUid(externalUid)

    const eventData = {
      externalUid,
      title: event.subject,
      startDt: this.parseDateTime(event.start),
      endDt: this.parseDateTime(event.end),
      rawJson: JSON.stringify(event)
    }

    if (existing) {
      await this.repository.updateCalendarEvent(existing.id, eventData)
    } else {
      await this.repository.createCalendarEvent(
        eventData.title,
        eventData.startDt,
        eventData.endDt,
        eventData.externalUid,
        eventData.rawJson
      )
    }
  }

  private parseDateTime(dt: { dateTime: string; timeZone: string }): Date {
    // Parse ISO datetime with timezone
    // Convert to UTC
    return new Date(dt.dateTime + 'Z') // Simplified - may need luxon/date-fns-tz
  }
}
```

**Verification:**
- Can sync test events
- Events appear in calendar_events table
- Duplicate events are updated (not inserted twice)
- Timestamps are correct in UTC

---

## Phase 4: IPC Handlers & Repository (1-2 hours)

### 4.1 Add Repository Methods
**Time:** 30 minutes

**File:** `src/main/db/repository.ts`

```typescript
async getCalendarEventByExternalUid(externalUid: string) {
  const db = getDatabase()
  return db.select()
    .from(schema.calendarEvents)
    .where(eq(schema.calendarEvents.externalUid, externalUid))
    .limit(1)
    .then(rows => rows[0] || null)
}

async updateCalendarEvent(id: string, data: Partial<CalendarEvent>) {
  const db = getDatabase()
  return db.update(schema.calendarEvents)
    .set(data)
    .where(eq(schema.calendarEvents.id, id))
}

async getMSGraphSettings(): Promise<MSGraphConnection> {
  return {
    connected: await this.getSetting('ms_graph_connected') === 'true',
    userEmail: await this.getSetting('ms_graph_user_email'),
    userName: await this.getSetting('ms_graph_user_name'),
    lastSync: await this.getSetting('ms_graph_last_sync')
      ? new Date(await this.getSetting('ms_graph_last_sync')!)
      : null
  }
}
```

**Tasks:**
- Add getCalendarEventByExternalUid method
- Add updateCalendarEvent method
- Add getMSGraphSettings helper
- Add setMSGraphSettings helper

**Verification:**
- Methods compile without errors
- Can query events by externalUid
- Can update event by ID

### 4.2 Create IPC Handlers
**Time:** 1 hour

**File:** `src/main/main.ts`

```typescript
// Microsoft Graph - Connection
ipcMain.handle('msgraph:getStatus', async () => {
  return await repository.getMSGraphSettings()
})

ipcMain.handle('msgraph:connect', async () => {
  const authService = new MicrosoftAuthService(getMSGraphConfig())
  const redirectServer = new RedirectServer()

  // Start local server
  const codePromise = redirectServer.start()

  // Generate auth URL
  const authUrl = await authService.getAuthCodeUrl(generateRandomState())

  // Open browser
  shell.openExternal(authUrl)

  // Wait for redirect callback
  const code = await codePromise

  // Exchange code for tokens
  const result = await authService.acquireTokenByCode(code, codeVerifier)

  // Store refresh token
  await storeRefreshToken(result.account.username, result.refreshToken)

  // Get user profile
  const graphClient = new MSGraphClient(authService, result.account)
  const profile = await graphClient.getUserProfile()

  // Save connection settings
  await repository.setSetting('ms_graph_connected', 'true')
  await repository.setSetting('ms_graph_user_email', profile.email)
  await repository.setSetting('ms_graph_user_name', profile.name)

  // Auto-trigger first sync
  await syncCalendar()

  return { success: true, email: profile.email }
})

ipcMain.handle('msgraph:disconnect', async () => {
  const email = await repository.getSetting('ms_graph_user_email')

  if (email) {
    await deleteRefreshToken(email)
  }

  await repository.setSetting('ms_graph_connected', 'false')
  await repository.setSetting('ms_graph_user_email', null)
  await repository.setSetting('ms_graph_user_name', null)
  await repository.setSetting('ms_graph_last_sync', null)

  return { success: true }
})

ipcMain.handle('msgraph:sync', async () => {
  const settings = await repository.getMSGraphSettings()

  if (!settings.connected || !settings.userEmail) {
    throw new Error('Microsoft account not connected')
  }

  // Get refresh token
  const refreshToken = await getRefreshToken(settings.userEmail)

  if (!refreshToken) {
    throw new Error('Refresh token not found. Please reconnect your account.')
  }

  // Initialize services
  const authService = new MicrosoftAuthService(getMSGraphConfig())
  const account = { username: settings.userEmail } as AccountInfo
  const graphClient = new MSGraphClient(authService, account)
  const syncService = new CalendarSyncService(graphClient, repository)

  // Perform sync
  const result = await syncService.syncCalendar()

  return result
})
```

**Tasks:**
- Add msgraph:getStatus handler
- Add msgraph:connect handler
- Add msgraph:disconnect handler
- Add msgraph:sync handler
- Add error handling for each handler

**Verification:**
- Can call handlers from renderer
- Handlers return expected data structures
- Errors are caught and returned to renderer

---

## Phase 5: Frontend UI (3-4 hours)

### 5.1 Add Preload Bindings
**Time:** 15 minutes

**File:** `src/main/preload.ts`

```typescript
msGraph: {
  getStatus: () => ipcRenderer.invoke('msgraph:getStatus'),
  connect: () => ipcRenderer.invoke('msgraph:connect'),
  disconnect: () => ipcRenderer.invoke('msgraph:disconnect'),
  sync: () => ipcRenderer.invoke('msgraph:sync')
}
```

**Verification:**
- TypeScript recognizes new methods
- No compile errors

### 5.2 Create Settings UI Component
**Time:** 2 hours

**File:** `src/renderer/views/SettingsView.tsx`

**Tasks:**
- Add "Microsoft Calendar Sync" section
- Add connection status display
- Add "Connect Account" button
- Add "Disconnect Account" button
- Add loading states
- Add error handling
- Show last sync timestamp

**UI Code:**
```tsx
const [msGraphStatus, setMSGraphStatus] = useState<MSGraphConnection | null>(null)
const [connecting, setConnecting] = useState(false)

useEffect(() => {
  loadMSGraphStatus()
}, [])

const loadMSGraphStatus = async () => {
  const status = await window.electron.msGraph.getStatus()
  setMSGraphStatus(status)
}

const handleConnect = async () => {
  setConnecting(true)
  try {
    await window.electron.msGraph.connect()
    await loadMSGraphStatus()
    alert('Microsoft account connected successfully!')
  } catch (error) {
    alert(`Failed to connect: ${error.message}`)
  } finally {
    setConnecting(false)
  }
}

const handleDisconnect = async () => {
  if (!confirm('Disconnect Microsoft account? You can reconnect anytime.')) {
    return
  }

  try {
    await window.electron.msGraph.disconnect()
    await loadMSGraphStatus()
  } catch (error) {
    alert(`Failed to disconnect: ${error.message}`)
  }
}

// ... JSX rendering
```

**Verification:**
- Settings section appears
- Can connect account (opens browser)
- Shows "Connected as [email]" after connection
- Can disconnect account
- UI updates correctly

### 5.3 Update Planner View with Sync Button
**Time:** 1.5 hours

**File:** `src/renderer/views/PlannerView.tsx`

**Tasks:**
- Replace .ics upload button with "Sync Calendar" button
- Add sync in progress state
- Show last sync time
- Handle not connected state (prompt to connect)
- Show success/error toasts
- Refresh calendar events after sync

**UI Code:**
```tsx
const [syncing, setSyncing] = useState(false)
const [lastSync, setLastSync] = useState<Date | null>(null)

const handleSyncCalendar = async () => {
  setSyncing(true)
  try {
    const result = await window.electron.msGraph.sync()
    setLastSync(new Date())

    // Refresh calendar events
    await loadCalendarEvents()

    alert(`Synced ${result.syncedCount} events from Microsoft Calendar`)
  } catch (error) {
    if (error.message.includes('not connected')) {
      if (confirm('Microsoft account not connected. Go to Settings to connect?')) {
        // Navigate to settings
      }
    } else {
      alert(`Sync failed: ${error.message}`)
    }
  } finally {
    setSyncing(false)
  }
}

// JSX:
<button onClick={handleSyncCalendar} disabled={syncing}>
  {syncing ? '⟳ Syncing...' : '⟳ Sync Microsoft Calendar'}
</button>
{lastSync && (
  <span className="last-sync">
    Last synced: {formatDistanceToNow(lastSync)} ago
  </span>
)}
```

**Tasks:**
- Add sync button
- Add loading spinner
- Add last sync display
- Handle errors
- Refresh events after sync
- Optional: Keep .ics import as fallback

**Verification:**
- Sync button appears
- Button disabled while syncing
- Events refresh after sync
- Last sync time displays correctly
- Error messages shown on failure

### 5.4 Add CSS Styling
**Time:** 30 minutes

**Files:**
- `src/renderer/views/SettingsView.css`
- `src/renderer/views/PlannerView.css`

**Tasks:**
- Style Microsoft sync section
- Style sync button (similar to existing buttons)
- Style connection status badge
- Style last sync timestamp
- Add loading spinner animation

---

## Phase 6: Testing & Polish (1-2 hours)

### 6.1 Manual Testing Checklist

**Connection Flow:**
- [ ] Fresh install - no account connected
- [ ] Click "Connect Account" - browser opens
- [ ] Sign in with Microsoft account
- [ ] Consent to permissions
- [ ] Redirects to localhost successfully
- [ ] UI shows "Connected as [email]"
- [ ] Auto-sync triggers after connection

**Sync Flow:**
- [ ] Click "Sync Calendar" button
- [ ] Button shows loading state
- [ ] Events appear in planner view
- [ ] Last sync timestamp updates
- [ ] Sync again - no duplicate events
- [ ] Change event in Outlook - sync updates it

**Disconnect Flow:**
- [ ] Click "Disconnect Account"
- [ ] Confirmation dialog appears
- [ ] UI shows "Not Connected" after disconnect
- [ ] Tokens removed from storage
- [ ] Sync button prompts to reconnect

**Error Scenarios:**
- [ ] Network offline - shows error message
- [ ] Token expired - auto-refreshes
- [ ] Refresh token expired - prompts to reconnect
- [ ] Calendar API error - shows friendly error

### 6.2 Edge Case Testing

**Timezones:**
- [ ] Event in PST syncs correctly to EST user
- [ ] All-day events show correct dates
- [ ] Events spanning midnight handled correctly

**Cancelled Events:**
- [ ] Cancelled events not imported
- [ ] Previously synced event later cancelled - removed on next sync

**Multiple Calendars:**
- [ ] Only default calendar synced (expected behavior for V1)

### 6.3 Polish & UX Improvements

**Tasks:**
- Add helpful error messages
- Add loading states everywhere
- Add tooltips for buttons
- Add keyboard shortcuts (optional)
- Improve visual feedback

---

## Phase 7: Documentation (1 hour)

### 7.1 Update User Documentation

**File:** `README.md`

Add section:
```markdown
### Microsoft Calendar Sync

Open Loops can sync your calendar events directly from Microsoft Outlook or Microsoft 365.

#### Setup
1. Go to Settings → Microsoft Calendar Sync
2. Click "Connect Microsoft Account"
3. Sign in with your Microsoft credentials
4. Approve the requested permissions
5. Your calendar will sync automatically

#### Usage
- In the Planner view, click "Sync Microsoft Calendar" to refresh events
- Events are synced from 1 day ago to 6 days in the future
- Sync as often as you like - duplicate events are handled automatically

#### Disconnect
- Go to Settings → Microsoft Calendar Sync
- Click "Disconnect Account"
- Your synced events will remain, but new syncs won't happen
```

**Tasks:**
- Update README
- Add screenshots (optional)
- Add troubleshooting section

### 7.2 Update Developer Documentation

**File:** `docs/DEVELOPMENT.md`

Add section:
```markdown
### Microsoft Graph Integration

#### Required Environment Variables
```
MS_GRAPH_CLIENT_ID=your-azure-app-client-id
```

#### Azure App Setup
See [MICROSOFT_GRAPH_SETUP.md](./MICROSOFT_GRAPH_SETUP.md) for detailed instructions.

#### Testing Locally
1. Register Azure AD app (see setup guide)
2. Add Client ID to `.env`
3. Run `npm run dev`
4. Go to Settings → Connect Account
```

---

## Rollout Plan

### Week 1: Foundation (Phase 1-2)
- Install dependencies
- Set up authentication service
- Create redirect server
- Test OAuth flow manually

### Week 2: Integration (Phase 3-4)
- Build Graph API client
- Implement sync service
- Add IPC handlers
- Test end-to-end sync

### Week 3: UI & Testing (Phase 5-6)
- Build Settings UI
- Update Planner UI
- Manual testing
- Bug fixes

### Week 4: Polish & Ship (Phase 7)
- Documentation
- Final testing
- Release v1.1.0

---

## Success Criteria

**Must Have (V1):**
- ✅ Users can connect Microsoft account via OAuth
- ✅ Users can sync calendar events on demand
- ✅ Events appear in planner view correctly
- ✅ Timezone handling works correctly
- ✅ Tokens stored securely
- ✅ Users can disconnect account
- ✅ No duplicate events on re-sync

**Nice to Have (V1.5):**
- Auto-sync on app launch
- Background sync every 15 minutes
- Sync multiple calendars
- Delete events removed from Outlook

**Future (V2):**
- Two-way sync (create events from Open Loops)
- Google Calendar support
- Apple Calendar support

---

## Risk Mitigation

### Risk: Token Security Breach
**Mitigation:** Use keytar for OS-level storage, encrypt DB tokens, never log tokens

### Risk: OAuth Flow Fails
**Mitigation:** Extensive error handling, fallback to .ics import, clear error messages

### Risk: Microsoft API Rate Limits
**Mitigation:** Implement exponential backoff, limit sync frequency, cache tokens

### Risk: Timezone Bugs
**Mitigation:** Extensive testing with multiple timezones, use proven date libraries

---

## Next Steps

1. **Review this plan** - Get approval from maintainers
2. **Set up Azure app** - Follow MICROSOFT_GRAPH_SETUP.md guide
3. **Create implementation branch** - `git checkout -b feature/microsoft-graph-sync`
4. **Start Phase 1** - Install dependencies and create config
5. **Iterate** - Build, test, refine, repeat

**Questions?** See the [spec document](./MICROSOFT_GRAPH_CALENDAR_SYNC_SPEC.md) or file an issue.

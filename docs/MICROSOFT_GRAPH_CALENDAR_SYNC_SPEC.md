# Microsoft Graph Calendar Sync - Feature Specification

**Version:** 1.0
**Date:** 2026-01-29
**Status:** Draft

## Overview

Add Microsoft Graph integration to sync calendar events from Outlook/Microsoft 365 directly into Open Loops, replacing the manual .ics file import workflow with automatic OAuth-based sync.

## Business Goals

1. **Eliminate Manual ICS Import**: Replace file-based calendar import with seamless Microsoft account integration
2. **Real-Time Calendar Data**: Enable users to sync their latest calendar events on demand
3. **Professional Integration**: Support enterprise Microsoft 365 accounts (most common calendar platform)
4. **Privacy & Security**: Use OAuth 2.0 with user consent, store minimal credentials

## User Stories

### Primary User Story
**As a** Open Loops user with a Microsoft 365 or Outlook.com account
**I want to** sync my calendar events directly from Microsoft
**So that** I can plan my day without manually exporting/importing .ics files

### Secondary User Stories
- **As a user**, I want to connect my Microsoft account once and reuse the connection for future syncs
- **As a user**, I want to see which Microsoft account is connected in Settings
- **As a user**, I want to disconnect my Microsoft account if I no longer want to use sync
- **As a user**, I want to know when my calendar was last synced

## Technical Architecture

### Authentication Flow

**OAuth 2.0 Authorization Code Flow with PKCE**
- Best practice for desktop/public client applications
- No client secret required (public client)
- User signs in via browser, app receives authorization code
- MSAL Node library handles token refresh automatically

### Required Microsoft Azure Setup

1. **Azure AD App Registration**
   - Application Type: Public client (Desktop)
   - Redirect URI: `http://localhost:3000/auth/callback` (local redirect server)
   - Allow public client flows: Yes
   - API Permissions:
     - `Calendars.Read` (Delegated) - Read user calendars
     - `User.Read` (Delegated) - Basic user profile
   - Supported account types: Personal Microsoft accounts and organizational accounts

2. **Scopes Required**
   ```
   openid profile offline_access Calendars.Read User.Read
   ```
   - `offline_access`: Enables refresh tokens for long-term access
   - `Calendars.Read`: Read-only access to calendar events
   - `User.Read`: Get basic user info (email, name)

### Microsoft Graph API Endpoints

**Primary Endpoint:** `/me/calendarView`
```
GET https://graph.microsoft.com/v1.0/me/calendarView
  ?startDateTime=2026-01-27T00:00:00Z
  &endDateTime=2026-02-03T00:00:00Z
  &$select=subject,start,end,location,isAllDay,isCancelled,organizer
  &$orderby=start/dateTime
  &$top=100
```

**Response Shape:**
```json
{
  "value": [
    {
      "id": "AAMkAGI...",
      "subject": "Team Standup",
      "start": {
        "dateTime": "2026-01-29T10:00:00.0000000",
        "timeZone": "Pacific Standard Time"
      },
      "end": {
        "dateTime": "2026-01-29T10:30:00.0000000",
        "timeZone": "Pacific Standard Time"
      },
      "location": {
        "displayName": "Conference Room A"
      },
      "isAllDay": false,
      "isCancelled": false,
      "organizer": {
        "emailAddress": {
          "name": "John Doe",
          "address": "john@company.com"
        }
      }
    }
  ]
}
```

### Token Storage Strategy

**Secure Storage Requirements:**
- Access token (expires in 1 hour): Store in memory only
- Refresh token (long-lived): Store encrypted in database
- User email/name: Store in settings table
- Do NOT store client ID/secret in code (use environment variables or separate config)

**Recommended:**
- Use Node.js `keytar` library for OS-level credential storage (macOS Keychain, Windows Credential Vault, Linux Secret Service)
- Fallback to encrypted database storage with `crypto` module

### Data Mapping

**Microsoft Graph Event → Open Loops Calendar Event**

| MS Graph Field | Open Loops Field | Mapping Logic |
|---------------|------------------|---------------|
| `id` | `externalUid` | Direct mapping (for deduplication) |
| `subject` | `title` | Direct mapping |
| `start.dateTime` | `startDt` | Convert to UTC Date |
| `end.dateTime` | `endDt` | Convert to UTC Date |
| `location.displayName` | Extract from `rawJson` | Store full location object in rawJson |
| `isAllDay` | Store in `rawJson` | Not currently used but preserve |
| `isCancelled` | Filter out | Don't import cancelled events |
| Full event JSON | `rawJson` | Store complete event for future use |

**Timezone Handling:**
- Microsoft Graph returns events in the user's calendar timezone
- Parse timezone from `start.timeZone` and `end.timeZone`
- Convert to UTC for storage using `date-fns-tz` or `luxon`
- Display in user's local timezone (existing UI behavior)

## User Interface Changes

### Settings View

**New Section: "Microsoft Calendar Sync"**

```
┌─────────────────────────────────────────────┐
│ Microsoft Calendar Sync                     │
├─────────────────────────────────────────────┤
│                                             │
│ Status: Not Connected                       │
│                                             │
│ [Connect Microsoft Account]                 │
│                                             │
│ OR (when connected):                        │
│                                             │
│ Connected as: john@company.com              │
│ Last synced: 2026-01-29 9:45 AM             │
│                                             │
│ [Disconnect Account]                        │
│                                             │
└─────────────────────────────────────────────┘
```

**Settings Schema:**
```typescript
{
  ms_graph_connected: boolean
  ms_graph_user_email: string | null
  ms_graph_user_name: string | null
  ms_graph_last_sync: Date | null
  // Refresh token stored separately via keytar or encrypted
}
```

### Planner View

**Replace .ics Upload Buttons with Sync Button**

**Before:**
```
[ Import .ics File ]
```

**After:**
```
┌─────────────────────────────────────────────┐
│ [ ⟳ Sync Microsoft Calendar ]               │
│                                             │
│ Last synced: 10 minutes ago                 │
└─────────────────────────────────────────────┘

OR (if not connected):

[ Connect Microsoft Account to Sync Calendar ]
  → Opens Settings to connect account
```

**Sync Behavior:**
- Button shows spinner while syncing
- Fetches events for current week (today -1 day to today +6 days)
- Deduplicates by `externalUid` (upsert, don't duplicate)
- Shows toast notification: "Synced 15 events from Microsoft Calendar"
- If error: "Failed to sync calendar. Please reconnect your account."

## Data Flow

### Initial Connection Flow

```
User clicks "Connect Microsoft Account"
  ↓
Electron opens browser to Microsoft login
  ↓
User authenticates & consents to permissions
  ↓
Microsoft redirects to http://localhost:3000/auth/callback?code=...
  ↓
Local redirect server (Electron) captures code
  ↓
MSAL exchanges code for access_token + refresh_token
  ↓
Store refresh_token securely (keytar or encrypted DB)
  ↓
Fetch /me to get user email/name
  ↓
Store user info in settings
  ↓
Update UI: "Connected as john@company.com"
  ↓
Automatically trigger first sync
```

### Sync Flow

```
User clicks "Sync Microsoft Calendar"
  ↓
Check if connected (have refresh_token)
  ↓ (not connected)
  Prompt to connect account
  ↓ (connected)
Check token expiry
  ↓ (expired)
  Use MSAL to refresh access_token
  ↓
Calculate date range (today -1 to today +6)
  ↓
Call GET /me/calendarView?startDateTime=...&endDateTime=...
  ↓
Parse response events
  ↓
For each event:
  - Check if externalUid exists in calendar_events table
  - If exists: Update (title, startDt, endDt may have changed)
  - If not: Insert new calendar_event
  ↓
Update last_sync timestamp in settings
  ↓
Refresh Planner UI to show new events
  ↓
Show success toast
```

### Disconnect Flow

```
User clicks "Disconnect Account"
  ↓
Delete refresh_token from keytar/DB
  ↓
Clear settings: ms_graph_user_email, ms_graph_user_name, ms_graph_last_sync
  ↓
Set ms_graph_connected = false
  ↓
Update UI: "Not Connected"
  ↓
Optional: Ask user if they want to delete synced calendar events
  ↓ (yes)
  Delete all calendar_events with externalUid prefix "ms-graph-"
```

## Implementation Packages

### Required NPM Packages

```json
{
  "@azure/msal-node": "^2.15.0",
  "@microsoft/microsoft-graph-client": "^3.0.7",
  "isomorphic-fetch": "^3.0.0",
  "keytar": "^7.9.0"
}
```

**Package Purposes:**
- `@azure/msal-node`: OAuth authentication, token management
- `@microsoft/microsoft-graph-client`: Type-safe Microsoft Graph API client
- `isomorphic-fetch`: Required polyfill for Graph client in Node.js
- `keytar`: Secure OS-level credential storage

### Alternative: Lighter Implementation

If avoiding native dependencies like `keytar`, use:
- `node:crypto` for encrypting refresh tokens
- Store encrypted tokens in SQLite `settings` table with prefix `secret_`
- Use `fetch` API directly instead of Graph client (reduce bundle size)

## Security Considerations

### Credential Storage
- **NEVER** commit client ID or any secrets to git
- Store client ID in environment variable or separate config file
- Add config file to `.gitignore`
- Encrypt refresh tokens before storing in database

### Token Security
- Access tokens valid for 1 hour only
- Refresh tokens valid for 90 days (Microsoft default)
- If refresh fails (token expired/revoked), prompt user to reconnect
- Clear tokens on disconnect

### Permissions Scope
- Request minimum permissions: `Calendars.Read` only
- Avoid `Calendars.ReadWrite` unless future features need write access
- User can revoke access at any time via Microsoft account settings

### Error Handling
- Handle token expiry gracefully (auto-refresh)
- Handle network errors (retry with exponential backoff)
- Handle Microsoft API rate limits (429 responses)
- Handle account disconnection (user revoked app access)

## Edge Cases & Error Scenarios

### Token Refresh Failure
**Scenario:** Refresh token expired or revoked
**Handling:** Clear stored credentials, show "Please reconnect your Microsoft account" message

### Network Failure During Sync
**Scenario:** No internet connection
**Handling:** Show error toast "Unable to sync. Check your internet connection." Don't clear tokens.

### Microsoft API Rate Limit
**Scenario:** Too many sync requests (429 response)
**Handling:** Implement exponential backoff, show "Sync temporarily unavailable. Please try again in a few minutes."

### Duplicate Events
**Scenario:** Event exists in DB from .ics import AND from Graph sync
**Handling:** Use `externalUid` to detect duplicates. Microsoft Graph events have unique IDs. Add prefix `ms-graph-` to distinguish from .ics events.

### Timezone Mismatches
**Scenario:** User's calendar is in PST but computer timezone is EST
**Handling:** Always convert Graph API times (which include timezone info) to UTC for storage. Display in user's local timezone (existing behavior).

### Calendar Event Updates
**Scenario:** User reschedules a meeting in Outlook after syncing
**Handling:** Next sync will update existing event by `externalUid`. Update `startDt`, `endDt`, `title`, `rawJson`.

### Cancelled Events
**Scenario:** Microsoft sends `isCancelled: true` for an event
**Handling:** Filter out cancelled events during sync. Optionally delete from DB if previously synced.

## Testing Strategy

### Manual Testing Scenarios

1. **Fresh Connection**
   - Clean database, no Microsoft account connected
   - Click "Connect Microsoft Account"
   - Verify browser opens, user logs in successfully
   - Verify UI shows "Connected as [email]"
   - Verify auto-sync triggers and imports events

2. **Sync with Existing Events**
   - Connect account and sync
   - Modify event in Outlook (change time)
   - Sync again
   - Verify event updated in DB (not duplicated)

3. **Disconnect & Reconnect**
   - Disconnect account
   - Verify tokens cleared
   - Reconnect same account
   - Verify events sync correctly

4. **Token Expiry**
   - Force token expiry (manually delete access token)
   - Trigger sync
   - Verify MSAL auto-refreshes token
   - Verify sync succeeds

5. **No Internet Connection**
   - Disconnect internet
   - Click sync
   - Verify error message shown
   - Reconnect internet
   - Verify sync works

### Future: Automated Tests

- Unit tests for token refresh logic
- Integration tests for Graph API calls (mock responses)
- E2E tests for OAuth flow (difficult, may skip)

## Migration & Rollout

### Phase 1: Azure Setup Documentation
- Create Markdown guide for Azure app registration
- Include screenshots and step-by-step instructions
- Document how to get Client ID

### Phase 2: Backend Implementation
- Add MSAL authentication service
- Add Graph API client wrapper
- Add token storage (keytar or encrypted DB)
- Add settings schema for Microsoft account

### Phase 3: Frontend Implementation
- Add Microsoft sync section to Settings view
- Add "Connect Account" button + OAuth flow
- Replace .ics upload with "Sync Calendar" button in Planner
- Add sync status indicators

### Phase 4: Testing & Refinement
- Test with multiple Microsoft account types (personal, work)
- Test timezone edge cases
- Test token refresh after 1+ hour
- Polish error messages and loading states

### Phase 5: Documentation & Deployment
- Update README with Microsoft sync instructions
- Create user guide for connecting Microsoft account
- Optional: Video tutorial for Azure app setup

## Future Enhancements (Out of Scope for V1)

- **Two-way sync**: Create/edit calendar events from Open Loops
- **Multiple calendar support**: Sync work + personal calendars
- **Selective sync**: Choose which calendars to sync
- **Auto-sync on schedule**: Background sync every 15 minutes
- **Conflict resolution**: Handle events modified in both systems
- **Google Calendar support**: Similar OAuth flow for Google
- **Apple Calendar support**: Use macOS EventKit API

## Success Metrics

### User Experience Metrics
- % of users who connect Microsoft account (target: 40%+)
- Average time to complete first sync (target: <60 seconds)
- Sync failure rate (target: <5%)

### Technical Metrics
- Token refresh success rate (target: 99%+)
- API call latency (target: <2 seconds for sync)
- Zero credential leaks or security incidents

## Open Questions

1. **Client ID Distribution**: How should we distribute the Azure app Client ID? Environment variable? User enters it? Embed in code?
   - **Recommendation**: Embed in code (it's public info anyway for public clients). Add to `.env.example` for developers who fork.

2. **Sync Frequency**: Should we add auto-sync or keep it manual-only?
   - **Recommendation**: Manual-only for V1. Add auto-sync in V2 if users request it.

3. **Keep .ics Import?**: Should we keep the .ics import option for non-Microsoft users?
   - **Recommendation**: Yes, keep it as fallback. Some users may have Google Calendar, Apple Calendar, etc.

4. **Event Deletion**: If an event is deleted in Outlook, should we delete from Open Loops on next sync?
   - **Recommendation**: Yes, but only for events with `externalUid` prefix `ms-graph-`. Don't touch manually added events.

## References

### Microsoft Documentation
- [Tutorial: Electron Desktop App with Microsoft Graph](https://learn.microsoft.com/en-us/entra/identity-platform/tutorial-v2-nodejs-desktop)
- [Microsoft Graph Calendar API Overview](https://learn.microsoft.com/en-us/graph/outlook-calendar-concept-overview)
- [List calendarView API Reference](https://learn.microsoft.com/en-us/graph/api/user-list-calendarview?view=graph-rest-1.0)
- [Microsoft Graph Permissions Reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [MSAL Node Documentation](https://learn.microsoft.com/en-us/entra/identity-platform/msal-overview)
- [OAuth 2.0 Authorization Code Flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Desktop App Configuration Guide](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration)

### NPM Packages
- [@azure/msal-node on npm](https://www.npmjs.com/package/@azure/msal-node)
- [@microsoft/microsoft-graph-client on npm](https://www.npmjs.com/package/@microsoft/microsoft-graph-client)

### Related Resources
- [Calendars.Read Permission Details](https://graphpermissions.merill.net/permission/Calendars.Read)
- [Microsoft Graph Toolkit for Electron](https://learn.microsoft.com/en-us/graph/toolkit/get-started/build-an-electron-app) (Note: Retiring Aug 2026)

---

**Next Steps:**
1. Review and approve this specification
2. Create Azure app registration guide (MICROSOFT_GRAPH_SETUP.md)
3. Create implementation plan with task breakdown
4. Begin Phase 1 development

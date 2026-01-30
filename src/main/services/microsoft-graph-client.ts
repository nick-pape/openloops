/**
 * Microsoft Graph API Client
 *
 * Handles calendar sync and other Microsoft Graph API operations.
 * Requires authentication via MicrosoftAuthService.
 */

import { Client } from '@microsoft/microsoft-graph-client'
import 'isomorphic-fetch'
import { getMicrosoftAuthService } from './microsoft-auth'
import { AccountInfo } from '@azure/msal-node'

export interface GraphCalendarEvent {
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

export interface UserProfile {
  id: string
  displayName: string
  mail: string
  userPrincipalName: string
}

export interface Calendar {
  id: string
  name: string
  color: string
  isDefaultCalendar: boolean
  canEdit: boolean
  canShare: boolean
  canViewPrivateItems: boolean
  owner?: {
    name: string
    address: string
  }
}

export class MicrosoftGraphClient {
  private client: Client | null = null

  /**
   * Initialize the Graph client with an access token
   */
  async initialize(account: AccountInfo): Promise<void> {

    // Get fresh access token
    const authService = getMicrosoftAuthService()
    const tokens = await authService.refreshAccessToken(account)

    this.client = Client.init({
      authProvider: (done) => {
        done(null, tokens.accessToken)
      }
    })

    console.log('[MS Graph] Client initialized for user:', account.username)
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.client !== null
  }

  /**
   * Get user profile information
   */
  async getUserProfile(): Promise<UserProfile> {
    if (!this.client) {
      throw new Error('Graph client not initialized')
    }

    try {
      const user = await this.client
        .api('/me')
        .select('id,displayName,mail,userPrincipalName')
        .get()

      return {
        id: user.id,
        displayName: user.displayName,
        mail: user.mail || user.userPrincipalName,
        userPrincipalName: user.userPrincipalName
      }
    } catch (error: any) {
      console.error('[MS Graph] Failed to get user profile:', error)
      throw new Error(`Failed to get user profile: ${error.message}`)
    }
  }

  /**
   * List all calendars (including shared calendars)
   */
  async listCalendars(): Promise<Calendar[]> {
    if (!this.client) {
      throw new Error('Graph client not initialized')
    }

    try {
      console.log('[MS Graph] Fetching calendars...')

      const response = await this.client
        .api('/me/calendars')
        .select('id,name,color,isDefaultCalendar,canEdit,canShare,canViewPrivateItems,owner')
        .get()

      const calendars: Calendar[] = (response.value || []).map((cal: any) => ({
        id: cal.id,
        name: cal.name,
        color: cal.color || 'auto',
        isDefaultCalendar: cal.isDefaultCalendar || false,
        canEdit: cal.canEdit !== false,
        canShare: cal.canShare !== false,
        canViewPrivateItems: cal.canViewPrivateItems !== false,
        owner: cal.owner ? {
          name: cal.owner.name,
          address: cal.owner.address
        } : undefined
      }))

      console.log('[MS Graph] Found calendars:', calendars.length)
      return calendars
    } catch (error: any) {
      console.error('[MS Graph] Failed to list calendars:', error)
      throw new Error(`Failed to list calendars: ${error.message}`)
    }
  }

  /**
   * Get calendar events for a date range from specific calendar(s)
   *
   * @param startDate ISO date string (YYYY-MM-DD)
   * @param endDate ISO date string (YYYY-MM-DD)
   * @param calendarIds Optional array of calendar IDs (if empty, uses default calendar)
   * @returns Array of calendar events
   */
  async getCalendarEvents(startDate: string, endDate: string, calendarIds?: string[]): Promise<GraphCalendarEvent[]> {
    if (!this.client) {
      throw new Error('Graph client not initialized')
    }

    // Convert YYYY-MM-DD to ISO 8601 datetime for Graph API
    const startDateTime = `${startDate}T00:00:00Z`
    const endDateTime = `${endDate}T23:59:59Z`

    try {
      let allEvents: GraphCalendarEvent[] = []

      // If calendar IDs specified, fetch from each calendar
      if (calendarIds && calendarIds.length > 0) {
        console.log('[MS Graph] Fetching events from', calendarIds.length, 'calendars')

        for (const calendarId of calendarIds) {
          try {
            const response = await this.client
              .api(`/me/calendars/${calendarId}/calendarView`)
              .query({
                startDateTime,
                endDateTime
              })
              .select('id,subject,start,end,location,isAllDay,isCancelled,organizer')
              .orderby('start/dateTime')
              .top(250)
              .get()

            const events: GraphCalendarEvent[] = response.value || []
            allEvents = allEvents.concat(events)
            console.log('[MS Graph] Fetched', events.length, 'events from calendar', calendarId)
          } catch (error: any) {
            console.error('[MS Graph] Failed to fetch from calendar', calendarId, ':', error.message)
            // Continue with other calendars even if one fails
          }
        }
      } else {
        // No calendar IDs specified, use default calendar
        console.log('[MS Graph] Fetching events from default calendar')

        const response = await this.client
          .api('/me/calendarView')
          .query({
            startDateTime,
            endDateTime
          })
          .select('id,subject,start,end,location,isAllDay,isCancelled,organizer')
          .orderby('start/dateTime')
          .top(250)
          .get()

        allEvents = response.value || []
      }

      // Filter out cancelled events and sort by start time
      const activeEvents = allEvents
        .filter(e => !e.isCancelled)
        .sort((a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime())

      console.log('[MS Graph] Fetched calendar events:', {
        total: allEvents.length,
        active: activeEvents.length,
        cancelled: allEvents.length - activeEvents.length
      })

      return activeEvents
    } catch (error: any) {
      console.error('[MS Graph] Failed to fetch calendar events:', error)

      // Check for token expiry
      if (error.statusCode === 401) {
        throw new Error('Access token expired. Please reconnect your Microsoft account.')
      }

      throw new Error(`Failed to fetch calendar events: ${error.message}`)
    }
  }

  /**
   * Sync calendar events to local database
   *
   * @param startDate ISO date string (YYYY-MM-DD)
   * @param endDate ISO date string (YYYY-MM-DD)
   * @param onEvent Callback for each event (for progress tracking)
   * @returns Sync statistics
   */
  async syncCalendarEvents(
    startDate: string,
    endDate: string,
    onEvent?: (event: GraphCalendarEvent) => void
  ): Promise<{ imported: number; total: number }> {
    const events = await this.getCalendarEvents(startDate, endDate)

    let imported = 0

    for (const event of events) {
      if (onEvent) {
        onEvent(event)
      }

      // This will be implemented in the repository layer
      // For now, just count
      imported++
    }

    return {
      imported,
      total: events.length
    }
  }

  /**
   * Parse Graph API datetime to JavaScript Date
   * Handles timezone conversion
   */
  static parseDateTime(dateTime: string): Date {
    // Graph API returns times in the calendar's timezone
    // For simplicity, treat as UTC and let JavaScript handle conversion
    // TODO: Consider using date-fns-tz for proper timezone handling
    return new Date(dateTime)
  }
}

// Singleton instance
let graphClientInstance: MicrosoftGraphClient | null = null

export function getMicrosoftGraphClient(): MicrosoftGraphClient {
  if (!graphClientInstance) {
    graphClientInstance = new MicrosoftGraphClient()
  }
  return graphClientInstance
}

export function resetMicrosoftGraphClient(): void {
  graphClientInstance = null
}

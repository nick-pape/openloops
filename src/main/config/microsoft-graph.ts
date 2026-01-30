/**
 * Microsoft Graph API Configuration
 *
 * This file contains the configuration for Microsoft Graph authentication and API access.
 *
 * Setup Instructions:
 * 1. Register an app in Azure Portal: https://portal.azure.com
 * 2. Navigate to "App registrations" -> "New registration"
 * 3. Set up according to docs/MICROSOFT_GRAPH_SETUP.md
 * 4. Copy your Client ID to .env file
 *
 * Security Notes:
 * - Client ID is public information (safe to embed in code for public clients)
 * - DO NOT add Client Secret (not needed for desktop apps)
 * - Refresh tokens are stored securely via keytar or encrypted DB
 */

export interface MicrosoftGraphConfig {
  clientId: string
  redirectUri: string
  authority: string
  scopes: string[]
}

/**
 * Get Microsoft Graph configuration from settings or environment variables
 * Priority: Database settings > Environment variables > Defaults
 */
export function getMicrosoftGraphConfig(settingsClientId?: string): MicrosoftGraphConfig {
  return {
    clientId: settingsClientId || process.env.MS_GRAPH_CLIENT_ID || '',
    redirectUri: process.env.MS_GRAPH_REDIRECT_URI || 'http://localhost:3001/auth/callback',
    authority: 'https://login.microsoftonline.com/common',
    scopes: [
      'openid',
      'profile',
      'offline_access',
      'Calendars.Read',
      'User.Read'
    ]
  }
}

/**
 * Check if Microsoft Graph is configured
 */
export function isMicrosoftGraphConfigured(settingsClientId?: string): boolean {
  const config = getMicrosoftGraphConfig(settingsClientId)
  return config.clientId.length > 0 && config.clientId !== 'your-client-id-here'
}

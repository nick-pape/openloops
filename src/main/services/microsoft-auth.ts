/**
 * Microsoft Graph Authentication Service
 *
 * Handles OAuth 2.0 authentication flow with PKCE for Microsoft Graph API access.
 * Uses MSAL Node library for token management and automatic refresh.
 */

import {
  PublicClientApplication,
  AuthenticationResult,
  SilentFlowRequest,
  AccountInfo
} from '@azure/msal-node'
import { getMicrosoftGraphConfig } from '../config/microsoft-graph'
import * as http from 'http'
import * as url from 'url'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresOn: Date
  account: {
    username: string
    name: string
    homeAccountId: string
  }
}

export class MicrosoftAuthService {
  private pca: PublicClientApplication | null = null
  private redirectServer: http.Server | null = null

  constructor() {
    this.initializeIfConfigured()
  }

  /**
   * Initialize MSAL client if configuration is available
   */
  private initializeIfConfigured() {
    const config = getMicrosoftGraphConfig()
    if (!config.clientId || config.clientId === 'your-client-id-here') {
      console.log('[MS Auth] Client ID not configured, skipping initialization')
      return
    }

    this.pca = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: config.authority
      }
    })

    console.log('[MS Auth] MSAL client initialized')
  }

  /**
   * Check if authentication service is configured and ready
   */
  isConfigured(): boolean {
    return this.pca !== null
  }

  /**
   * Start local redirect server to capture OAuth callback
   * Returns the authorization code from the callback
   */
  private startRedirectServer(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
      this.redirectServer = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url || '', true)

        if (parsedUrl.pathname === '/auth/callback') {
          const code = parsedUrl.query.code as string
          const error = parsedUrl.query.error as string

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' })
            res.end(`
              <html>
                <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                  <h1>Authentication Failed</h1>
                  <p>${error}</p>
                  <p>You can close this window and try again.</p>
                </body>
              </html>
            `)
            this.stopRedirectServer()
            reject(new Error(`Authentication failed: ${error}`))
            return
          }

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(`
              <html>
                <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                  <h1>✓ Authentication Successful</h1>
                  <p>You can close this window and return to Open Loops.</p>
                  <script>window.close();</script>
                </body>
              </html>
            `)
            this.stopRedirectServer()
            resolve(code)
            return
          }
        }

        res.writeHead(404)
        res.end('Not found')
      })

      this.redirectServer.on('error', (err) => {
        console.error('[MS Auth] Redirect server error:', err)
        this.stopRedirectServer()
        reject(err)
      })

      this.redirectServer.listen(port, () => {
        console.log(`[MS Auth] Redirect server listening on port ${port}`)
      })

      // Timeout after 5 minutes
      setTimeout(() => {
        this.stopRedirectServer()
        reject(new Error('Authentication timeout - no response received'))
      }, 5 * 60 * 1000)
    })
  }

  /**
   * Stop the local redirect server
   */
  private stopRedirectServer() {
    if (this.redirectServer) {
      this.redirectServer.close()
      this.redirectServer = null
      console.log('[MS Auth] Redirect server stopped')
    }
  }

  /**
   * Authenticate user via browser OAuth flow
   * Opens browser, waits for user to authenticate, returns tokens
   */
  async authenticate(): Promise<AuthTokens> {
    if (!this.pca) {
      throw new Error('Microsoft Graph authentication not configured. Please set MS_GRAPH_CLIENT_ID in .env file.')
    }

    const config = getMicrosoftGraphConfig()

    // Start local redirect server
    const redirectUrl = new URL(config.redirectUri)
    const port = parseInt(redirectUrl.port) || 3000
    const authCodePromise = this.startRedirectServer(port)

    // Build authorization URL
    const authCodeUrlParameters = {
      scopes: config.scopes,
      redirectUri: config.redirectUri,
      prompt: 'select_account'
    }

    try {
      const authUrl = await this.pca.getAuthCodeUrl(authCodeUrlParameters)
      console.log('[MS Auth] Opening browser for authentication...')

      // Open browser (Electron will provide shell.openExternal)
      const { shell } = require('electron')
      await shell.openExternal(authUrl)

      // Wait for authorization code
      const authCode = await authCodePromise

      // Exchange code for tokens
      const tokenRequest = {
        code: authCode,
        scopes: config.scopes,
        redirectUri: config.redirectUri
      }

      const response = await this.pca.acquireTokenByCode(tokenRequest)

      if (!response) {
        throw new Error('Failed to acquire token - no response from MSAL')
      }

      console.log('[MS Auth] Successfully authenticated:', response.account?.username)

      return this.formatAuthResult(response)
    } catch (error) {
      this.stopRedirectServer()
      console.error('[MS Auth] Authentication failed:', error)
      throw error
    }
  }

  /**
   * Refresh access token using refresh token
   * MSAL handles refresh tokens automatically via the token cache
   */
  async refreshAccessToken(account: AccountInfo): Promise<AuthTokens> {
    if (!this.pca) {
      throw new Error('Microsoft Graph authentication not configured')
    }

    const config = getMicrosoftGraphConfig()

    const silentRequest: SilentFlowRequest = {
      account: account,
      scopes: config.scopes
    }

    try {
      const response = await this.pca.acquireTokenSilent(silentRequest)

      if (!response) {
        throw new Error('Failed to refresh token - no response from MSAL')
      }

      console.log('[MS Auth] Token refreshed successfully')
      return this.formatAuthResult(response)
    } catch (error) {
      console.error('[MS Auth] Token refresh failed:', error)
      throw new Error('Token refresh failed. Please reconnect your Microsoft account.')
    }
  }

  /**
   * Format MSAL authentication result into our AuthTokens interface
   */
  private formatAuthResult(result: AuthenticationResult): AuthTokens {
    if (!result.account) {
      throw new Error('No account information in authentication result')
    }

    // MSAL Node doesn't directly expose refresh tokens in v2.x+ for security reasons
    // The refresh token is stored in the cache and used automatically by acquireTokenSilent
    // For our purposes, we'll store the account info and use MSAL's cache
    return {
      accessToken: result.accessToken,
      refreshToken: result.account.homeAccountId, // Store account ID instead
      expiresOn: result.expiresOn || new Date(Date.now() + 3600 * 1000),
      account: {
        username: result.account.username,
        name: result.account.name || result.account.username,
        homeAccountId: result.account.homeAccountId
      }
    }
  }

  /**
   * Get cached account by home account ID
   */
  async getAccountByHomeAccountId(homeAccountId: string): Promise<AccountInfo | null> {
    if (!this.pca) {
      return null
    }

    const cache = this.pca.getTokenCache()
    const accounts = await cache.getAllAccounts()
    return accounts.find((acc: AccountInfo) => acc.homeAccountId === homeAccountId) || null
  }

  /**
   * Clear all cached tokens (sign out)
   */
  async signOut(account: AccountInfo): Promise<void> {
    if (!this.pca) {
      return
    }

    const cache = this.pca.getTokenCache()
    await cache.removeAccount(account)
    console.log('[MS Auth] Account removed from cache')
  }
}

// Singleton instance
let authServiceInstance: MicrosoftAuthService | null = null

export function getMicrosoftAuthService(): MicrosoftAuthService {
  if (!authServiceInstance) {
    authServiceInstance = new MicrosoftAuthService()
  }
  return authServiceInstance
}

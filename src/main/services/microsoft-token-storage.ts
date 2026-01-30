/**
 * Microsoft Graph Token Storage
 *
 * Securely stores refresh tokens and account information.
 * Prefers OS-level keychain (via keytar), falls back to encrypted database storage.
 */

import * as crypto from 'crypto'

// Try to import keytar, but don't fail if it's not available
let keytar: any = null
try {
  keytar = require('keytar')
  console.log('[Token Storage] keytar loaded successfully')
} catch (error) {
  console.warn('[Token Storage] keytar not available, using encrypted DB storage')
}

const SERVICE_NAME = 'OpenLoops-MicrosoftGraph'
const ENCRYPTION_ALGORITHM = 'aes-256-cbc'

export interface StoredAccount {
  homeAccountId: string
  username: string
  name: string
}

export class MicrosoftTokenStorage {
  private encryptionKey: Buffer

  constructor(
    private settingsStore: {
      get: (key: string) => Promise<string | null>
      set: (key: string, value: string) => Promise<void>
    }
  ) {
    // Generate or load encryption key for fallback storage
    this.encryptionKey = this.getOrCreateEncryptionKey()
  }

  /**
   * Get or create encryption key for database storage
   */
  private getOrCreateEncryptionKey(): Buffer {
    // In a real app, this should be stored securely (e.g., in OS keychain)
    // For now, derive from machine-specific data
    const machineId = require('os').hostname() + require('os').userInfo().username
    return crypto.scryptSync(machineId, 'openloops-salt', 32)
  }

  /**
   * Encrypt data for database storage
   */
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return iv.toString('hex') + ':' + encrypted
  }

  /**
   * Decrypt data from database storage
   */
  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':')
    const iv = Buffer.from(parts[0], 'hex')
    const encrypted = parts[1]
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }

  /**
   * Store account information and home account ID
   */
  async storeAccount(account: StoredAccount): Promise<void> {
    const accountJson = JSON.stringify(account)

    if (keytar) {
      try {
        // Use OS keychain if available
        await keytar.setPassword(SERVICE_NAME, 'account', accountJson)
        console.log('[Token Storage] Account stored in OS keychain')
        return
      } catch (error) {
        console.warn('[Token Storage] Failed to store in keychain, falling back to DB:', error)
      }
    }

    // Fallback: encrypted database storage
    const encrypted = this.encrypt(accountJson)
    await this.settingsStore.set('ms_graph_account_encrypted', encrypted)
    console.log('[Token Storage] Account stored in encrypted DB')
  }

  /**
   * Retrieve stored account information
   */
  async getAccount(): Promise<StoredAccount | null> {
    if (keytar) {
      try {
        const accountJson = await keytar.getPassword(SERVICE_NAME, 'account')
        if (accountJson) {
          console.log('[Token Storage] Account retrieved from OS keychain')
          return JSON.parse(accountJson)
        }
      } catch (error) {
        console.warn('[Token Storage] Failed to retrieve from keychain, trying DB:', error)
      }
    }

    // Fallback: encrypted database storage
    const encrypted = await this.settingsStore.get('ms_graph_account_encrypted')
    if (encrypted) {
      try {
        const accountJson = this.decrypt(encrypted)
        console.log('[Token Storage] Account retrieved from encrypted DB')
        return JSON.parse(accountJson)
      } catch (error) {
        console.error('[Token Storage] Failed to decrypt account from DB:', error)
        return null
      }
    }

    return null
  }

  /**
   * Delete stored account and tokens
   */
  async deleteAccount(): Promise<void> {
    if (keytar) {
      try {
        await keytar.deletePassword(SERVICE_NAME, 'account')
        console.log('[Token Storage] Account deleted from OS keychain')
      } catch (error) {
        console.warn('[Token Storage] Failed to delete from keychain:', error)
      }
    }

    // Also delete from DB if present
    await this.settingsStore.set('ms_graph_account_encrypted', '')
    console.log('[Token Storage] Account deleted from DB')
  }

  /**
   * Store last sync time
   */
  async storeLastSyncTime(timestamp: Date): Promise<void> {
    await this.settingsStore.set('ms_graph_last_sync', timestamp.toISOString())
  }

  /**
   * Get last sync time
   */
  async getLastSyncTime(): Promise<Date | null> {
    const isoString = await this.settingsStore.get('ms_graph_last_sync')
    if (!isoString) return null

    try {
      return new Date(isoString)
    } catch {
      return null
    }
  }
}

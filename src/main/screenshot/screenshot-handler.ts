import { clipboard, desktopCapturer } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';

const execAsync = promisify(exec);

interface ScreenshotResult {
  buffer: Buffer;
  extension: string;
  metadata: {
    source: string;
    captureMethod: 'native-snipping-tool' | 'desktop-capturer';
    screenshotType?: 'snipping-tool' | 'full-screen' | 'window' | 'region';
    timestamp: string;
  };
}

interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;
  type: 'screen' | 'window';
  display_id?: string;
  appIcon?: string;
}

class ScreenshotHandler {
  private isMonitoring = false;
  private monitoringTimer: NodeJS.Timeout | null = null;
  private lastClipboardHash: string | null = null;

  /**
   * Launches Windows Snipping Tool and monitors clipboard for screenshot
   * Returns the screenshot buffer when detected, or null if cancelled/timeout
   */
  async captureWithSnippingTool(): Promise<ScreenshotResult | null> {
    console.log('[Screenshot] Launching Snipping Tool...');

    // Store current clipboard hash to detect new screenshots
    this.lastClipboardHash = this.getClipboardImageHash();

    // Try modern Windows 11 Snipping Tool first
    let launched = false;
    try {
      await execAsync('start ms-screenclip:');
      launched = true;
      console.log('[Screenshot] Launched modern Snipping Tool (ms-screenclip:)');
    } catch (error) {
      console.log('[Screenshot] Modern Snipping Tool unavailable, trying legacy...');

      // Fall back to legacy Snipping Tool
      try {
        await execAsync('snippingtool.exe /clip');
        launched = true;
        console.log('[Screenshot] Launched legacy Snipping Tool');
      } catch (legacyError) {
        console.error('[Screenshot] Failed to launch Snipping Tool:', legacyError);
        return null;
      }
    }

    if (!launched) {
      return null;
    }

    // Monitor clipboard for new screenshot (60 second timeout)
    return this.monitorClipboardForScreenshot(60000);
  }

  /**
   * Monitors clipboard every 500ms for a new image
   * Returns screenshot buffer when detected, or null on timeout/cancel
   */
  private async monitorClipboardForScreenshot(timeoutMs: number): Promise<ScreenshotResult | null> {
    const checkInterval = 500; // Check every 500ms
    const maxChecks = Math.floor(timeoutMs / checkInterval);
    let checkCount = 0;

    this.isMonitoring = true;

    return new Promise((resolve) => {
      const checkClipboard = () => {
        if (!this.isMonitoring) {
          console.log('[Screenshot] Monitoring stopped');
          resolve(null);
          return;
        }

        checkCount++;

        // Check if we've exceeded timeout
        if (checkCount > maxChecks) {
          console.log('[Screenshot] Clipboard monitoring timed out after 60 seconds');
          this.isMonitoring = false;
          resolve(null);
          return;
        }

        // Get current clipboard image
        const currentHash = this.getClipboardImageHash();

        // Check if clipboard has a new image
        if (currentHash && currentHash !== this.lastClipboardHash) {
          console.log('[Screenshot] New screenshot detected in clipboard');
          this.isMonitoring = false;

          // Extract image from clipboard
          const image = clipboard.readImage();
          if (!image.isEmpty()) {
            const buffer = image.toPNG();

            const result: ScreenshotResult = {
              buffer,
              extension: 'png',
              metadata: {
                source: 'screenshot',
                captureMethod: 'native-snipping-tool',
                screenshotType: 'snipping-tool',
                timestamp: new Date().toISOString()
              }
            };

            resolve(result);
            return;
          }
        }

        // Schedule next check
        this.monitoringTimer = setTimeout(checkClipboard, checkInterval);
      };

      // Start monitoring
      checkClipboard();
    });
  }

  /**
   * Generates a hash of the current clipboard image to detect changes
   */
  private getClipboardImageHash(): string | null {
    try {
      const image = clipboard.readImage();
      if (image.isEmpty()) {
        return null;
      }

      const buffer = image.toPNG();
      return crypto.createHash('md5').update(buffer).digest('hex');
    } catch (error) {
      console.error('[Screenshot] Error reading clipboard:', error);
      return null;
    }
  }

  /**
   * Gets available desktop sources (screens and windows) for manual selection
   * Used on macOS/Linux or as fallback on Windows
   */
  async getDesktopSources(): Promise<DesktopSource[]> {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 300, height: 200 }
      });

      return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        type: source.id.startsWith('screen') ? 'screen' : 'window',
        display_id: source.display_id,
        appIcon: source.appIcon ? source.appIcon.toDataURL() : undefined
      }));
    } catch (error) {
      console.error('[Screenshot] Error getting desktop sources:', error);
      throw error;
    }
  }

  /**
   * Stops clipboard monitoring (called when user cancels or app quits)
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
    if (this.monitoringTimer) {
      clearTimeout(this.monitoringTimer);
      this.monitoringTimer = null;
    }
  }

  /**
   * Cleanup method to be called on app quit
   */
  cleanup(): void {
    this.stopMonitoring();
  }
}

// Singleton instance
export const screenshotHandler = new ScreenshotHandler();

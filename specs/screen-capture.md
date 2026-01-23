# Screen Capture - Spec

**Status:** ✅ Completed
**Phase:** 2
**Completed:** 2026-01-23

## Overview

Add ergonomic screen capture capabilities: full screen, window capture, and region selection (snipping tool style).

## Goals

1. **Multiple Capture Modes**: Full screen, specific window, or region
2. **Native Tool Integration**: Use Windows Snipping Tool where possible
3. **Cross-Platform**: Fallback to Electron APIs on Mac/Linux
4. **Rich Metadata**: Capture window info (app name, title) for context

## User Flow

### Option A: Native Snipping Tool (Windows)

1. User clicks "📸 Screenshot" button
2. App detects OS is Windows
3. Launches Windows Snipping Tool (`ms-screenclip:` URI or `snippingtool.exe`)
4. User captures region/window using native tool (can draw boxes, annotate)
5. User clicks "Copy" in Snipping Tool (copies to clipboard)
6. **App monitors clipboard** for new image (hash comparison)
7. When new image detected → auto-save as capture
8. LLM vision generates title (same as Phase 1)

**Pros:**
- Users can annotate/draw with familiar tool
- No need to build custom region selector
- Professional screenshot experience

**Cons:**
- Windows-only
- Clipboard monitoring is hacky
- Race conditions if user copies something else
- Requires polling

### Option B: Electron desktopCapturer (Cross-Platform)

1. User clicks "📸 Screenshot" button
2. App calls `desktopCapturer.getSources()` to enumerate screens/windows
3. Show modal with thumbnail previews of available sources
4. User selects:
   - **Screen** → Capture entire screen
   - **Window** → Capture specific window
   - **Region** → Show fullscreen overlay with drag-to-select
5. Capture image from selected source
6. Save as image capture with metadata (source type, window title, app name)
7. LLM vision generates title

**Pros:**
- Cross-platform (Windows, Mac, Linux)
- Built-in Electron API
- Can capture window metadata

**Cons:**
- No annotation tools (would need separate feature)
- Need to build custom region selector overlay
- More complex UI

### Hybrid Approach (Recommended)

```typescript
if (process.platform === 'win32') {
  // Try native Snipping Tool
  launchSnippingTool()
  startClipboardMonitoring()
} else {
  // Use Electron desktopCapturer
  showSourcePicker()
}
```

## Technical Design

### Option A: Native Snipping Tool

**Launch Snipping Tool:**
```typescript
import { exec } from 'child_process'
import { clipboard } from 'electron'

ipcMain.handle('screenshot:snip', async () => {
  if (process.platform !== 'win32') {
    return { error: 'Snipping Tool only available on Windows' }
  }

  // Launch Snipping Tool
  // Windows 11: ms-screenclip: URI
  exec('start ms-screenclip:', (error) => {
    if (error) {
      // Fallback to legacy Snipping Tool
      exec('snippingtool.exe')
    }
  })

  // Start monitoring clipboard
  const initialHash = hashClipboard()
  const pollInterval = setInterval(async () => {
    const currentHash = hashClipboard()

    if (currentHash !== initialHash) {
      // New clipboard content detected
      const image = clipboard.readImage()

      if (!image.isEmpty()) {
        clearInterval(pollInterval)

        // Save image as capture
        const buffer = image.toPNG()
        const timestamp = Date.now()
        const filePath = await saveImageCapture(buffer, 'png', timestamp)

        // Create capture
        await createImageCapture(filePath, `Screenshot ${new Date().toLocaleString()}`)

        return { success: true, filePath }
      }
    }
  }, 500) // Poll every 500ms

  // Timeout after 60 seconds
  setTimeout(() => {
    clearInterval(pollInterval)
  }, 60000)
})
```

**Clipboard Hashing:**
```typescript
function hashClipboard(): string {
  const image = clipboard.readImage()
  if (image.isEmpty()) return ''

  const buffer = image.toPNG()
  return crypto.createHash('md5').update(buffer).digest('hex')
}
```

### Option B: desktopCapturer

**Get Available Sources:**
```typescript
import { desktopCapturer } from 'electron'

ipcMain.handle('screenshot:getSources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 320, height: 180 }
  })

  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(), // For preview
    appIcon: source.appIcon?.toDataURL()
  }))
})
```

**Capture Source:**
```typescript
ipcMain.handle('screenshot:capture', async (_, sourceId: string) => {
  // This would be done in renderer using getUserMedia
  // Send sourceId back to renderer, which captures via:
  // navigator.mediaDevices.getUserMedia({
  //   audio: false,
  //   video: {
  //     mandatory: {
  //       chromeMediaSource: 'desktop',
  //       chromeMediaSourceId: sourceId
  //     }
  //   }
  // })
  // Then draw to canvas and get image data
})
```

**Region Selector (Advanced):**
```typescript
// Create transparent fullscreen window
const overlayWindow = new BrowserWindow({
  fullscreen: true,
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  webPreferences: { nodeIntegration: false }
})

// Load region selector UI
overlayWindow.loadFile('region-selector.html')

// User drags to select region → sends coordinates back
// Capture that region from screen source
```

### Capture Metadata

**Enhanced Capture Schema:**
```typescript
interface ImageCaptureMetadata {
  source?: 'file-upload' | 'screenshot'
  screenshotType?: 'full-screen' | 'window' | 'region'
  windowTitle?: string     // e.g., "Visual Studio Code"
  appName?: string         // e.g., "Code.exe"
  displayName?: string     // e.g., "Display 1"
}

// Store as JSON in capture bodyText or new metadata field
```

### UI Components

**Screenshot Button:**
```tsx
<button onClick={handleScreenshot}>📸 Screenshot</button>
```

**Source Picker Modal (Option B):**
```tsx
<div className="source-picker-modal">
  <h2>Select a window or screen</h2>
  <div className="source-grid">
    {sources.map(source => (
      <div
        key={source.id}
        className="source-item"
        onClick={() => captureSource(source.id)}
      >
        <img src={source.thumbnail} alt={source.name} />
        <span>{source.name}</span>
      </div>
    ))}
  </div>
</div>
```

## Implementation Checklist

### Backend
- [ ] Add `screenshot:snip` IPC handler (Option A)
- [ ] Add `screenshot:getSources` IPC handler (Option B)
- [ ] Implement clipboard monitoring with hash comparison
- [ ] Add metadata field to capture schema (or use bodyText as JSON)
- [ ] Launch Snipping Tool with proper error handling
- [ ] Implement fallback for non-Windows platforms

### Frontend
- [ ] Add "📸 Screenshot" button
- [ ] Create source picker modal (Option B)
- [ ] Show loading state while monitoring clipboard
- [ ] Display capture metadata in UI (optional)

### Testing
- [ ] Test on Windows 10/11 with Snipping Tool
- [ ] Test clipboard monitoring race conditions
- [ ] Test timeout scenarios (user cancels)
- [ ] Test with multiple monitors
- [ ] Test cross-platform fallback

## Edge Cases

1. **User cancels Snipping Tool**: Timeout after 60s, cleanup polling
2. **User copies something else**: Hash check prevents false positives
3. **Multiple monitors**: Snipping Tool handles this natively
4. **Snipping Tool not available**: Fall back to desktopCapturer
5. **Mac/Linux**: Always use desktopCapturer

## Alternative: Simple Approach

**Just Add a "Snip" Button** that:
1. Minimizes app window
2. Waits 500ms (for animation)
3. Calls OS screenshot shortcut:
   - Windows: `Win+Shift+S` (triggers Snipping Tool)
   - Mac: `Cmd+Shift+4` (region capture)
4. Monitors clipboard for 60s
5. Auto-saves when image detected

This is simpler but less elegant (relies on OS shortcuts, user might not know about them).

## Future Enhancements

- [ ] Video recording (use same desktopCapturer API)
- [ ] Annotation tools (built-in, not relying on native)
- [ ] Delayed capture (countdown timer)
- [ ] OCR on captured text (extract text from screenshots)
- [ ] Auto-crop white borders

---

**Dependencies:**
- Windows Snipping Tool (Windows 10+)
- Electron desktopCapturer API (cross-platform)
- Clipboard monitoring (Electron clipboard module)

# Image Upload & Global Hotkey - Spec

**Status:** ✅ Ready for Implementation
**Phase:** 1
**Last Updated:** 2026-01-22

## Overview

Add ergonomic image upload via file picker with AI-generated titles, plus a global hotkey for quick capture.

## Goals

1. **Easy Image Upload**: Single button to select image from filesystem
2. **Smart Titles**: Use LLM vision to auto-generate descriptive titles
3. **Global Hotkey**: Trigger image upload even when app is not focused
4. **Editable**: User can edit generated titles later

## User Flow

### Image Upload Flow
1. User clicks "📷 Image" button in Captures tab
2. Native file picker opens (filtered to image types)
3. User selects image file
4. Image immediately appears as new capture with filename as temp title
5. **Background:** LLM vision job generates better title
6. Title updates in UI when generation completes (if LLM configured)
7. User can click ✏️ to edit title anytime

### Global Hotkey Flow
1. User presses `Ctrl+Shift+U` (or `Cmd+Shift+U` on Mac) anywhere in OS
2. App window comes to foreground (if minimized/background)
3. File picker opens immediately
4. Rest of flow same as above

## Technical Design

### UI Changes

**ProjectView.tsx - Captures Header**
```tsx
<div className="captures-header">
  <div className="captures-controls">
    <select>...</select>
  </div>
  <div className="capture-actions">
    <button onClick={handleUploadImage}>📷 Image</button>  // NEW
    <button onClick={handleCreateText}>+ Text</button>
    <button onClick={handleRecord}>🎤 Record</button>
  </div>
</div>
```

### IPC Methods

**New Handler:** `files:selectImage`
```typescript
ipcMain.handle('files:selectImage', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{
      name: 'Images',
      extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
    }]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})
```

**Preload API:**
```typescript
files: {
  selectImage: () => ipcRenderer.invoke('files:selectImage'),
  saveImage: (projectId, arrayBuffer, ext) => ...,
  readImage: (filePath) => ...
}
```

### Job Queue

**New Job Type:** `image-description`

```typescript
interface ImageDescriptionJob {
  type: 'image-description'
  captureId: string
  imagePath: string
}
```

**Job Manager:**
```typescript
async enqueueImageDescription(captureId: string, imagePath: string): Promise<string> {
  const jobId = uuidv4()
  await repository.createJob(jobId, 'image-description', { captureId, imagePath })
  return jobId
}
```

**Job Worker Logic:**
```typescript
case 'image-description': {
  const { captureId, imagePath } = jobData

  // Read image as base64
  const imageBuffer = fs.readFileSync(imagePath)
  const base64 = imageBuffer.toString('base64')
  const mimeType = getMimeType(imagePath) // e.g., 'image/png'

  // Call LLM vision API
  const title = await llmProvider.generateImageTitle(base64, mimeType)

  // Update capture title
  await repository.updateCapture(captureId, title, capture.bodyText)

  return { captureId, title }
}
```

### LLM Provider

**Add Vision Method:**
```typescript
interface LLMProvider {
  generateSummary(context: string, prompt: string): Promise<string>
  generateImageTitle(imageBase64: string, mimeType: string): Promise<string>  // NEW
}

class RemoteLLMProvider implements LLMProvider {
  async generateImageTitle(imageBase64: string, mimeType: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Describe this image in 5-10 words as a title. Be concise and specific about what you see.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`
              }
            }
          ]
        }],
        max_tokens: 50
      })
    })

    const data = await response.json()
    return data.choices[0].message.content.trim()
  }
}

class DisabledLLMProvider implements LLMProvider {
  async generateImageTitle(imageBase64: string, mimeType: string): Promise<string> {
    // No-op: just keep the filename
    return ''
  }
}
```

### Global Hotkey

**Registration in main.ts:**
```typescript
import { globalShortcut } from 'electron'

app.whenReady().then(() => {
  // Register global hotkey
  const success = globalShortcut.register('CommandOrControl+Shift+I', () => {
    console.log('[Global Hotkey] Image capture triggered')

    // Bring app to foreground
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()

      // Trigger image upload via IPC
      mainWindow.webContents.send('trigger-image-upload')
    }
  })

  if (!success) {
    console.error('[Global Hotkey] Failed to register')
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
```

**Renderer Listener (ProjectView.tsx):**
```typescript
useEffect(() => {
  const handleTriggerUpload = () => {
    handleUploadImage()
  }

  window.electron.onTriggerImageUpload?.(handleTriggerUpload)

  return () => {
    window.electron.offTriggerImageUpload?.(handleTriggerUpload)
  }
}, [])
```

**Preload API:**
```typescript
// Add event listeners for main-to-renderer communication
onTriggerImageUpload: (callback: () => void) => {
  ipcRenderer.on('trigger-image-upload', callback)
},
offTriggerImageUpload: (callback: () => void) => {
  ipcRenderer.removeListener('trigger-image-upload', callback)
}
```

## Implementation Checklist

### Backend
- [ ] Add `files:selectImage` IPC handler
- [ ] Add `image-description` job type to schema/repository
- [ ] Implement `enqueueImageDescription` in job-manager
- [ ] Handle `image-description` jobs in job-worker
- [ ] Add `generateImageTitle` method to LLM providers
- [ ] Register global hotkey in main process
- [ ] Add IPC event `trigger-image-upload` (main → renderer)

### Frontend
- [ ] Add "📷 Image" button in ProjectView captures header
- [ ] Implement `handleUploadImage` function
- [ ] Add event listener for `trigger-image-upload`
- [ ] Expose file selection and event methods in preload
- [ ] Update capture title in UI when job completes (polling or refresh)

### Testing
- [ ] Test image upload with various file types
- [ ] Test LLM title generation (with Ollama vision model)
- [ ] Test with LLM disabled (should keep filename)
- [ ] Test global hotkey (Ctrl+Shift+I)
- [ ] Test app coming to foreground
- [ ] Test editing generated titles

## Edge Cases

1. **No LLM configured**: Skip vision job, keep filename as title
2. **Vision API fails**: Log error, keep filename as title
3. **User cancels file picker**: No-op, no capture created
4. **App already focused**: Hotkey just opens file picker
5. **Hotkey conflict**: Log warning, allow user to customize later (future)

## Future Enhancements

- [ ] Configurable hotkey in Settings
- [ ] Progress indicator while title generating
- [ ] Support for multiple image selection
- [ ] Image preview in file picker
- [ ] Drag-from-desktop (already works via existing drag/drop)

---

**Dependencies:**
- Vision-capable LLM (e.g., qwen3-vl, gpt-4-vision)
- Ollama running locally or OpenAI API key

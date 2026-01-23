# Image Drag & Drop / Paste - Spec

**Status:** ✅ Completed
**Phase:** Core
**Completed:** 2026-01-23

## Overview

Enable quick image capture through drag-and-drop from file explorer and paste from clipboard.

## Goals

1. **Frictionless Image Capture**: No file picker needed for common workflows
2. **Multi-Image Support**: Handle multiple files at once
3. **Clipboard Integration**: Paste screenshots directly from clipboard
4. **AI Titles**: Automatic descriptive titles via LLM vision

## User Flow

### Drag & Drop from File Explorer

1. User drags image file(s) from file explorer
2. Hovers over app window (anywhere in ProjectView)
3. Drops file(s)
4. For each image:
   - Immediately saved to project directory
   - Capture created with filename as title
   - Image description job enqueued
   - LLM generates better title in background
5. Captures appear in accordion list

### Paste from Clipboard

1. User takes screenshot (Win+Shift+S, Snipping Tool, etc.)
2. Or copies image from browser/app (Ctrl+C)
3. Focuses on Open Loops window
4. Presses Ctrl+V (or Cmd+V on Mac)
5. Image extracted from clipboard
6. Saved with title "Pasted image [timestamp]"
7. Image description job enqueued
8. Capture appears in list

## Technical Implementation

### Drag & Drop Handler

**Event Listeners:**
```tsx
<div
  className="project-view"
  onDrop={handleImageDrop}
  onDragOver={(e) => e.preventDefault()}
  onPaste={handleImagePaste}
>
  {/* Project content */}
</div>
```

**Drop Handler:**
```typescript
const handleImageDrop = async (e: React.DragEvent) => {
  e.preventDefault()

  // Filter for image files only
  const files = Array.from(e.dataTransfer.files).filter(f =>
    f.type.startsWith('image/')
  )

  for (const file of files) {
    try {
      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer()
      const extension = file.name.split('.').pop() || 'png'

      // Save to project directory
      const filePath = await window.electron.files.saveImage(
        projectId,
        arrayBuffer,
        extension
      )

      // Create capture
      const capture = await window.electron.captures.create({
        projectId,
        type: 'image',
        title: file.name,
        filePath
      })

      // Enqueue image description job
      await window.electron.images.requestDescription(capture.id, filePath)

      console.log('[Drop] Image description job enqueued for:', file.name)
    } catch (error) {
      console.error('Failed to save dropped image:', error)
    }
  }

  // Reload captures list
  await loadCaptures()
}
```

### Paste Handler

**Clipboard Event:**
```typescript
const handleImagePaste = async (e: React.ClipboardEvent) => {
  // Don't intercept paste in text inputs
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
    return
  }

  // Get clipboard items
  const items = Array.from(e.clipboardData.items)
  const imageItems = items.filter(item => item.type.startsWith('image/'))

  // Only handle if there are actually images
  if (imageItems.length === 0) {
    return
  }

  e.preventDefault() // Prevent default paste behavior

  for (const item of imageItems) {
    const file = item.getAsFile()
    if (!file) continue

    try {
      // Process similar to drag & drop
      const arrayBuffer = await file.arrayBuffer()
      const extension = file.type.split('/')[1] || 'png'

      const filePath = await window.electron.files.saveImage(
        projectId,
        arrayBuffer,
        extension
      )

      const capture = await window.electron.captures.create({
        projectId,
        type: 'image',
        title: `Pasted image ${new Date().toLocaleString()}`,
        filePath
      })

      await window.electron.images.requestDescription(capture.id, filePath)

      console.log('[Paste] Image description job enqueued')
    } catch (error) {
      console.error('Failed to save pasted image:', error)
    }
  }

  await loadCaptures()
}
```

### Image Storage

**File Path Structure:**
```
app-data/images/{projectId}/{timestamp}-{random}.{ext}
```

**IPC Handler:**
```typescript
ipcMain.handle('files:saveImage', async (_,
  projectId: string,
  arrayBuffer: ArrayBuffer,
  extension: string
) => {
  const userDataPath = app.getPath('userData')
  const imagesDir = path.join(userDataPath, 'app-data', 'images', projectId)

  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true })
  }

  const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`
  const filePath = path.join(imagesDir, filename)

  fs.writeFileSync(filePath, Buffer.from(arrayBuffer))

  return filePath
})
```

### Image Description Job

**Job Enqueueing:**
```typescript
ipcMain.handle('images:requestDescription', async (_,
  captureId: string,
  imagePath: string
) => {
  console.log('[Images] Requesting description for capture:', captureId)

  try {
    const sharp = require('sharp')

    // Resize image to 768x768 max (optimize for LLM)
    const resizedBuffer = await sharp(imagePath)
      .resize(768, 768, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .toFormat('jpeg', { quality: 85 })
      .toBuffer()

    // Save resized image to temp location
    const resizedPath = imagePath.replace(/\.[^.]+$/, '_resized.jpg')
    fs.writeFileSync(resizedPath, resizedBuffer)

    // Enqueue job with resized image path
    const jobId = await jobManager.enqueueImageDescription(captureId, resizedPath)
    console.log('[Images] Image description job enqueued')

    // Emit job event to renderer
    const job = await repository.getJob(jobId)
    if (job && mainWindow) {
      mainWindow.webContents.send('job:updated', job)
    }
  } catch (error) {
    console.error('[Images] Failed to resize image:', error)
    throw new Error(`Failed to prepare image for description: ${error.message}`)
  }
})
```

**Job Worker:**
```typescript
case 'image-description': {
  const { captureId, imagePath } = jobData

  // Read image as base64
  const imageBuffer = fs.readFileSync(imagePath)
  const base64 = imageBuffer.toString('base64')
  const mimeType = 'image/jpeg' // Resized to JPEG

  // Call LLM vision API
  const title = await llmProvider.generateImageTitle(base64, mimeType)

  // Update capture title
  const capture = await repository.getCapture(captureId)
  await repository.updateCapture(captureId, title, capture.bodyText)

  return { captureId, title }
}
```

### LLM Vision Integration

**Vision API Call:**
```typescript
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
            text: 'Describe this image in 5-10 words as a title. Be concise and specific.'
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
```

## Features Implemented

✅ Drag and drop multiple images simultaneously
✅ Paste images from clipboard
✅ Detect image MIME types
✅ Filter non-image clipboard/drop content
✅ Don't intercept paste in text inputs
✅ Automatic image resizing (768x768 max)
✅ JPEG optimization for LLM processing
✅ Unique filename generation
✅ Per-project image directories
✅ Background job for title generation
✅ Real-time UI updates when jobs complete
✅ Error handling for unsupported formats

## Supported Image Formats

- PNG (.png)
- JPEG (.jpg, .jpeg)
- GIF (.gif)
- WebP (.webp)
- BMP (.bmp)
- SVG (.svg)

All formats converted to JPEG during processing for consistency.

## Edge Cases

1. **Non-image files dropped**: Filtered out, ignored
2. **Paste in text field**: Not intercepted, normal paste behavior
3. **Clipboard contains text only**: No-op, normal paste
4. **Multiple images pasted**: All processed sequentially
5. **Large images**: Automatically resized to 768x768 max
6. **LLM unavailable**: Keeps filename as title
7. **Vision model doesn't support images**: Job fails gracefully

## Performance Optimization

**Image Resizing:**
- Original images kept at full resolution
- Resized copies created only for LLM processing
- Sharp library used for fast, high-quality resizing
- Reduces API payload size and costs

**Batch Processing:**
- Multiple dropped images processed in parallel
- Each gets individual capture and job
- UI updates once after all processed

## Integration Points

- **Job Queue**: Image descriptions use background job system
- **Settings**: Uses configured LLM provider and model
- **Captures List**: Auto-refreshes when jobs complete
- **Project View**: Drop zone covers entire view for convenience

## Future Enhancements

- [ ] Drop zone visual indicator on drag over
- [ ] Image preview before saving
- [ ] Batch title generation (single LLM call for multiple images)
- [ ] OCR text extraction from images
- [ ] Image annotation tools
- [ ] Automatic tagging based on content

---

**Dependencies:**
- React drag/drop events
- Clipboard API (browser)
- sharp (image processing)
- LLM with vision support (e.g., gpt-4-vision, qwen3-vl)

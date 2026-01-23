# Audio Recording & Transcription - Spec

**Status:** ✅ Completed
**Phase:** Core
**Completed:** 2026-01-23

## Overview

Record audio directly in the app and automatically transcribe it using OpenAI Whisper API or local whisper.cpp.

## Goals

1. **Browser-Based Recording**: Use Web Audio API for in-app recording
2. **Automatic Transcription**: Background job processes audio after recording
3. **Multiple Providers**: Support both remote API and local processing
4. **Status Tracking**: Show transcription progress and errors

## User Flow

### Recording Audio

1. User clicks "🎤 Record" button in Captures tab
2. Browser requests microphone permission (first time only)
3. Button changes to "⏹ Stop" with recording indicator
4. User speaks into microphone
5. User clicks "⏹ Stop" when finished
6. Audio file saved as WebM format
7. Capture created with title "Recording [timestamp]"
8. Transcription job automatically enqueued
9. Capture shows "Transcribing..." status

### Viewing Transcription

1. When job completes, capture updates automatically
2. User expands capture in accordion
3. Transcription appears below title with "Transcription:" label
4. If transcription fails, error message displayed

## Technical Implementation

### Audio Recording

**MediaRecorder Setup:**
```typescript
const handleStartRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mediaRecorder = new MediaRecorder(stream)

  const audioChunks: Blob[] = []

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data)
    }
  }

  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
    const arrayBuffer = await audioBlob.arrayBuffer()

    // Save audio file
    const filePath = await window.electron.files.saveAudio(projectId, arrayBuffer)

    // Create capture
    const capture = await window.electron.captures.create({
      projectId,
      type: 'audio',
      title: `Recording ${new Date().toLocaleString()}`,
      filePath
    })

    // Request transcription
    await window.electron.audio.requestTranscription(capture.id, filePath)

    // Cleanup
    stream.getTracks().forEach(track => track.stop())
  }

  mediaRecorder.start()
  setIsRecording(true)
}
```

**Stop Recording:**
```typescript
const handleStopRecording = () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
    setIsRecording(false)
  }
}
```

### File Storage

**Audio File Naming:**
```
app-data/audio/{projectId}/{timestamp}.webm
```

**IPC Handler:**
```typescript
ipcMain.handle('files:saveAudio', async (_, projectId: string, arrayBuffer: ArrayBuffer) => {
  const userDataPath = app.getPath('userData')
  const audioDir = path.join(userDataPath, 'app-data', 'audio', projectId)

  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true })
  }

  const filename = `${Date.now()}.webm`
  const filePath = path.join(audioDir, filename)

  fs.writeFileSync(filePath, Buffer.from(arrayBuffer))

  return filePath
})
```

### Transcription System

**Database Schema:**
```typescript
interface Transcription {
  id: string              // UUID
  captureId: string       // Foreign key to capture
  status: 'pending' | 'done' | 'error'
  text?: string           // Transcribed text
  errorMessage?: string   // Error details if failed
  provider: string        // 'openai' | 'whisper-cpp'
  createdAt: Date
  updatedAt: Date
}
```

**Job Creation:**
```typescript
ipcMain.handle('audio:requestTranscription', async (_, captureId: string, audioFilePath: string) => {
  // Create transcription record
  const transcriptionId = await repository.createTranscription(captureId, 'pending')

  // Enqueue background job
  const jobId = await jobManager.enqueueTranscription(captureId, audioFilePath)

  // Emit job event for UI
  const job = await repository.getJob(jobId)
  if (job && mainWindow) {
    mainWindow.webContents.send('job:updated', job)
  }

  return transcriptionId
})
```

**Job Worker Processing:**
```typescript
case 'transcription': {
  const { captureId, audioFilePath } = jobData

  // Get transcription provider from settings
  const transcriptionType = await repository.getSetting('transcription_type')

  let transcriptionText: string

  if (transcriptionType === 'openai') {
    // Remote API transcription
    const baseUrl = await repository.getSetting('transcription_base_url')
    const apiKey = await repository.getSetting('secret_openai_api_key')

    transcriptionText = await transcribeWithOpenAI(audioFilePath, baseUrl, apiKey)
  } else {
    // Local whisper.cpp transcription
    const binaryPath = await repository.getSetting('whisper_binary_path')
    const modelPath = await repository.getSetting('whisper_model_path')

    transcriptionText = await transcribeWithWhisperCpp(audioFilePath, binaryPath, modelPath)
  }

  // Update transcription record
  await repository.updateTranscriptionText(captureId, transcriptionText)

  return { captureId, text: transcriptionText }
}
```

### Transcription Providers

**OpenAI Whisper API:**
```typescript
async function transcribeWithOpenAI(audioFilePath: string, baseUrl: string, apiKey: string): Promise<string> {
  const formData = new FormData()
  const audioFile = fs.createReadStream(audioFilePath)

  formData.append('file', audioFile)
  formData.append('model', 'whisper-1')

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  })

  const data = await response.json()
  return data.text
}
```

**Local whisper.cpp:**
```typescript
async function transcribeWithWhisperCpp(audioFilePath: string, binaryPath: string, modelPath: string): Promise<string> {
  const { stdout, stderr } = await execAsync(
    `"${binaryPath}" -m "${modelPath}" -f "${audioFilePath}" --output-txt`
  )

  // Read output file (whisper.cpp writes to .txt)
  const outputPath = audioFilePath.replace('.webm', '.txt')
  const transcription = fs.readFileSync(outputPath, 'utf-8')

  return transcription.trim()
}
```

### UI Integration

**Transcription Display:**
```tsx
{capture.type === 'audio' && transcription && (
  <div className="transcription">
    <strong>Transcription:</strong>
    <p className={`transcription-${transcription.status}`}>
      {transcription.status === 'done' && transcription.text}
      {transcription.status === 'pending' && 'Transcribing...'}
      {transcription.status === 'error' &&
        `Error: ${transcription.errorMessage || 'Unknown error'}`}
    </p>
  </div>
)}
```

**Loading Transcription:**
```typescript
const [transcription, setTranscription] = useState<Transcription | null>(null)

useEffect(() => {
  if (capture.type === 'audio') {
    loadTranscription()
  }
}, [capture])

const loadTranscription = async () => {
  const trans = await window.electron.captures.getTranscription(capture.id)
  setTranscription(trans || null)
}
```

## Configuration

### Settings Page Options

**Transcription Provider:**
- Remote (OpenAI Whisper API)
  - Base URL: `https://api.openai.com/v1`
  - API Key: Stored securely
- Local (whisper.cpp)
  - Binary Path: `/path/to/whisper`
  - Model Path: `/path/to/ggml-base.en.bin`

**Model Selection (Local):**
- tiny.en (39 MB) - Fast, less accurate
- base.en (74 MB) - Balanced (recommended)
- small.en (244 MB) - More accurate
- medium.en (769 MB) - High accuracy

## Features Implemented

✅ Browser-based audio recording with MediaRecorder API
✅ Microphone permission handling
✅ WebM audio format storage
✅ Automatic transcription job enqueueing
✅ OpenAI Whisper API integration
✅ Local whisper.cpp support
✅ Transcription status tracking (pending/done/error)
✅ Real-time UI updates via job events
✅ Error handling and display
✅ Settings configuration for providers

## Edge Cases

1. **Microphone permission denied**: Show alert, prevent recording
2. **Recording stops unexpectedly**: Gracefully handle stream end
3. **Transcription API timeout**: Mark as error with message
4. **Invalid audio format**: Catch and log conversion errors
5. **Missing whisper.cpp binary**: Show configuration error
6. **Network failure**: Retry with exponential backoff (future)

## Integration Points

- **Job Queue**: Transcription uses background job system
- **Settings**: Provider configuration stored in database
- **Project Summaries**: Transcriptions included in AI-generated summaries
- **Captures List**: Auto-refreshes when transcription completes

## Performance Considerations

- **File Size**: WebM format provides good compression
- **Processing Time**: Transcription happens in background, UI remains responsive
- **Memory**: MediaRecorder chunks prevent memory buildup during long recordings
- **Local Processing**: whisper.cpp runs in separate process, doesn't block main thread

## Future Enhancements

- [ ] Audio playback controls in UI
- [ ] Waveform visualization
- [ ] Pause/resume recording
- [ ] Audio quality settings
- [ ] Speaker diarization (identify multiple speakers)
- [ ] Timestamp markers in transcription
- [ ] Export transcription as text file

---

**Dependencies:**
- Web Audio API (browser)
- MediaRecorder API (browser)
- OpenAI Whisper API (optional)
- whisper.cpp binary (optional)
- Background job system

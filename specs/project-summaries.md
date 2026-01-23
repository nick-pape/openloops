# Project Summaries - Spec

**Status:** ✅ Completed
**Phase:** Core
**Completed:** 2026-01-23

## Overview

AI-generated summaries of project activity based on recent captures and open tasks.

## Goals

1. **Quick Context**: Get up to speed on project status at a glance
2. **AI-Powered**: LLM analyzes captures and tasks to generate insights
3. **Markdown Format**: Rich formatting for readability
4. **Regeneration**: Update summary on demand

## User Flow

### Generating a Summary

1. User navigates to project
2. Clicks "Summary" tab (default view)
3. If no summary exists, sees "No summary yet" message
4. Clicks "Regenerate" button
5. Button shows "Generating..." state
6. Background job processes captures and tasks
7. Summary appears when complete (auto-refreshes via job events)

### Viewing a Summary

1. Summary displays in markdown format with sections:
   - **What's going on**: Brief project overview
   - **Current open loops**: Active work items
   - **Recent decisions or notes**: Key takeaways
   - **Next 3 likely actions**: Suggested next steps
2. User can scroll through formatted content
3. Headers, lists, code blocks all render properly

## Technical Implementation

### Summary Generation Trigger

**UI Button:**
```tsx
<div className="summary-header">
  <h2>Project Summary</h2>
  <button onClick={handleGenerateSummary} disabled={generatingSummary}>
    {generatingSummary ? 'Generating...' : 'Regenerate'}
  </button>
</div>
```

**Handler:**
```typescript
const handleGenerateSummary = async () => {
  setGeneratingSummary(true)

  try {
    console.log('Requesting summary generation for project:', projectId)
    await window.electron.summaries.generate(projectId)
    console.log('Summary generation enqueued')
    // Job events will handle reloading when complete
  } catch (error) {
    console.error('Failed to enqueue summary generation:', error)
    alert(`Failed to generate summary: ${error}`)
    setGeneratingSummary(false)
  }
}
```

### IPC Handler

```typescript
ipcMain.handle('summaries:generate', async (_, projectId: string) => {
  console.log('=== Summary Generation Started ===')
  console.log('Project ID:', projectId)

  try {
    // Get captures from last 14 days (configurable)
    const captures = await repository.getCapturesByProject(projectId)
    const tasks = await repository.getOpenTasks(projectId)

    console.log(`Found ${captures.length} captures and ${tasks.length} tasks`)

    // Build context from captures and tasks
    let context = `Project captures from last 14 days:\n\n`

    for (const capture of captures.slice(0, 20)) {
      context += `- Capture: ${capture.title} (${capture.type})\n`
      if (capture.bodyText) {
        context += `  ${capture.bodyText.substring(0, 200)}\n`
      }
    }

    context += `\n\nOpen tasks:\n\n`

    for (const task of tasks) {
      context += `- Task: ${task.title} (Priority: ${task.priority}, Estimate: ${task.estimateMinutes}min)\n`
      if (task.notes) {
        context += `  ${task.notes.substring(0, 200)}\n`
      }
    }

    console.log('Context length:', context.length, 'characters')

    // Build prompt for LLM
    const prompt = `You are helping summarize a project. Based on the recent captures and open tasks, create a markdown summary with:
1. What's going on (brief overview)
2. Current open loops (active work items)
3. Recent decisions or notes
4. Next 3 likely actions

Keep it concise and actionable.`

    console.log('Enqueueing summary job...')
    const jobId = await jobManager.enqueueSummary(projectId, context, prompt)
    console.log('Summary job enqueued successfully')

    // Emit job event
    const job = await repository.getJob(jobId)
    if (job && mainWindow) {
      mainWindow.webContents.send('job:updated', job)
    }
  } catch (error) {
    console.error('Error in summaries:generate handler:', error)
    throw error
  }
})
```

### Job Worker Processing

```typescript
case 'summary': {
  const { projectId, context, prompt } = jobData

  // Call LLM to generate summary
  const summaryMd = await llmProvider.generateSummary(context, prompt)

  // Calculate source window (last 14 days by default)
  const lookbackDays = parseInt(
    await repository.getSetting('summary_lookback_days') || '14'
  )

  const sourceWindowEnd = new Date()
  const sourceWindowStart = new Date()
  sourceWindowStart.setDate(sourceWindowStart.getDate() - lookbackDays)

  // Save summary to database
  await repository.createProjectSummary(
    projectId,
    summaryMd,
    llmProvider.name,
    sourceWindowStart,
    sourceWindowEnd
  )

  return { projectId, summaryMd }
}
```

### LLM Integration

**Summary Generation:**
```typescript
async generateSummary(context: string, prompt: string): Promise<string> {
  const response = await fetch(`${this.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: prompt
        },
        {
          role: 'user',
          content: context
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    })
  })

  const data = await response.json()
  return data.choices[0].message.content.trim()
}
```

### Database Schema

```typescript
interface ProjectSummary {
  id: string               // UUID
  projectId: string        // Foreign key to project
  summaryMd: string        // Markdown content
  provider: string         // 'openai' | 'ollama' | 'disabled'
  sourceWindowStart: Date  // Start of data window
  sourceWindowEnd: Date    // End of data window
  createdAt: Date
}
```

### UI Display

**Markdown Rendering:**
```tsx
{summary ? (
  <div className="summary-content">
    <ReactMarkdown>{summary.summaryMd}</ReactMarkdown>
  </div>
) : (
  <div className="summary-empty">
    No summary yet. Click Regenerate to create one.
  </div>
)}
```

**Styling:**
```css
.summary-content h1 { font-size: 1.5rem; margin: 1rem 0; }
.summary-content h2 { font-size: 1.25rem; margin: 1rem 0; }
.summary-content h3 { font-size: 1.1rem; margin: 0.75rem 0; }
.summary-content ul { padding-left: 1.5rem; }
.summary-content code { background: #f0f0f0; padding: 0.125rem 0.25rem; }
.summary-content pre { background: #f0f0f0; padding: 1rem; }
.summary-content blockquote { border-left: 3px solid #ddd; padding-left: 1rem; }
```

## Configuration

### Settings

**Summary Lookback Days:**
- Default: 14 days
- Configurable in Settings page
- Controls how far back to include captures/tasks

**LLM Provider:**
- OpenAI (remote)
- Ollama (local)
- Disabled (no AI summaries)

**Model Selection:**
- gpt-4o-mini (OpenAI)
- llama2, mistral, etc. (Ollama)

## Features Implemented

✅ On-demand summary generation
✅ Context building from captures and tasks
✅ Configurable lookback window
✅ LLM-generated markdown summaries
✅ Multiple provider support (OpenAI, Ollama, disabled)
✅ Background job processing
✅ Real-time UI updates via job events
✅ Empty state handling
✅ Error handling with user feedback
✅ Markdown rendering with react-markdown

## Summary Structure

Typical AI-generated summary includes:

1. **Overview Section**: High-level project status
2. **Open Loops**: Active items requiring attention
3. **Recent Activity**: Key decisions and notes
4. **Next Actions**: Recommended 3-5 next steps

Example:
```markdown
## What's going on

Working on image upload feature with AI-generated titles. Recently
implemented drag & drop and clipboard paste functionality.

## Current open loops

- Complete image description job integration
- Test with Ollama vision model
- Add error handling for failed transcriptions

## Recent decisions

- Using sharp library for image resizing
- Resizing to 768x768 before sending to LLM to reduce costs
- Storing both original and resized images

## Next actions

1. Test with various image formats (PNG, JPEG, WebP)
2. Add progress indicator during title generation
3. Implement batch image processing
```

## Edge Cases

1. **No captures or tasks**: Summary still generated with "No recent activity"
2. **LLM unavailable**: Job fails with error message
3. **Very long captures**: Truncated to 200 chars in context
4. **Special characters in markdown**: Properly escaped
5. **Summary already exists**: Overwrites with new version
6. **Network timeout**: Job marked as error

## Performance Considerations

- **Context Size**: Limited to 20 most recent captures
- **Truncation**: Capture bodies truncated to 200 chars
- **Token Limits**: LLM max_tokens set to 1000
- **Background Processing**: Doesn't block UI
- **Caching**: Latest summary stored, not regenerated on view

## Integration Points

- **Job Queue**: Uses background job system
- **Settings**: Configurable lookback days and LLM provider
- **Captures**: Includes text, image titles, transcriptions
- **Tasks**: Includes open tasks with priorities
- **Tab System**: Summary is default tab in ProjectView

## Future Enhancements

- [ ] Auto-regenerate summaries daily
- [ ] Summary diff view (show changes over time)
- [ ] Export summary as markdown file
- [ ] Email summary digest
- [ ] Custom summary prompts/templates
- [ ] Include completed tasks in context
- [ ] Trend analysis (velocity, completion rate)

---

**Dependencies:**
- LLM with chat completion API
- react-markdown for rendering
- Background job system
- SQLite for summary storage

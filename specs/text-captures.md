# Text Captures - Spec

**Status:** ✅ Completed
**Phase:** Core
**Completed:** 2026-01-23

## Overview

Create and manage quick text notes within projects with markdown rendering support.

## Goals

1. **Quick Entry**: Simple modal for capturing thoughts and notes
2. **Markdown Support**: Rich text formatting via markdown
3. **Editability**: Full CRUD operations on text captures
4. **Context Storage**: Title + optional body text for details

## User Flow

### Creating a Text Capture

1. User clicks "+ Text" button in Captures tab
2. Modal opens with two fields:
   - Title (required)
   - Notes/Body (optional)
3. User enters text (markdown supported in body)
4. Clicks "Create" button
5. Modal closes, capture appears in accordion list
6. Capture displays with type badge, title, and timestamp

### Viewing a Text Capture

1. User clicks on collapsed capture in accordion
2. Capture expands to show full body text
3. Body text renders with markdown formatting:
   - Headers (h1, h2, h3)
   - Lists (ordered and unordered)
   - Code blocks with syntax highlighting
   - Blockquotes
   - Inline formatting (bold, italic, code)

### Editing a Text Capture

1. User clicks ✏️ edit button on text capture
2. Edit modal opens with current title and body
3. User modifies text
4. Clicks "Save" button
5. Capture updates in accordion view
6. Markdown re-renders with new content

### Deleting a Text Capture

1. User clicks 🗑️ delete button on capture
2. Browser confirmation dialog appears
3. User confirms deletion
4. Capture removed from list

## Technical Implementation

### UI Components

**Modal Structure:**
```tsx
<div className="modal-overlay" onClick={closeModal}>
  <div className="modal" onClick={stopPropagation}>
    <h2>New Text Capture</h2>
    <div className="form-group">
      <label>Title</label>
      <input
        type="text"
        value={textTitle}
        onChange={(e) => setTextTitle(e.target.value)}
        placeholder="Enter title"
        autoFocus
      />
    </div>
    <div className="form-group">
      <label>Notes (optional)</label>
      <textarea
        value={textBody}
        onChange={(e) => setTextBody(e.target.value)}
        placeholder="Enter details"
      />
    </div>
    <div className="modal-actions">
      <button className="secondary" onClick={closeModal}>Cancel</button>
      <button onClick={handleCreate} disabled={!textTitle.trim()}>
        Create
      </button>
    </div>
  </div>
</div>
```

**Accordion Display:**
```tsx
<div className="capture-accordion">
  <div className="accordion-header" onClick={toggleExpand}>
    <div className="accordion-title">
      <span className="capture-type capture-type-text">text</span>
      <h3>{capture.title}</h3>
      <span className="capture-date">
        {new Date(capture.createdAt).toLocaleString()}
      </span>
    </div>
    <div className="accordion-controls">
      <button onClick={handleEdit}>✏️</button>
      <button onClick={handleDelete}>🗑️</button>
      <span className="accordion-icon">{isExpanded ? '▼' : '▶'}</span>
    </div>
  </div>
  {isExpanded && (
    <div className="accordion-content">
      <div className="capture-body">
        <ReactMarkdown>{capture.bodyText}</ReactMarkdown>
      </div>
    </div>
  )}
</div>
```

### Database Schema

```typescript
interface Capture {
  id: string              // UUID
  projectId: string       // Foreign key to project
  type: 'text' | 'image' | 'audio'
  title: string           // Capture title
  bodyText?: string       // Markdown content
  filePath?: string       // Null for text captures
  metadata?: string       // JSON metadata (unused for text)
  createdAt: Date
  isOpenLoop?: boolean    // Flag for tracking
}
```

### IPC Methods

**Create:**
```typescript
ipcMain.handle('captures:create', async (_, input: {
  projectId: string
  type: 'text'
  title: string
  bodyText: string
}) => {
  return repository.createCapture(input)
})
```

**Update:**
```typescript
ipcMain.handle('captures:update', async (_,
  id: string,
  title: string,
  bodyText: string
) => {
  return repository.updateCapture(id, title, bodyText)
})
```

**Delete:**
```typescript
ipcMain.handle('captures:delete', async (_, id: string) => {
  await repository.deleteCapture(id)
})
```

### Markdown Rendering

Uses `react-markdown` with custom styling:

```css
.capture-body h1 { font-size: 1.2rem; margin: 0.75rem 0; }
.capture-body h2 { font-size: 1.1rem; margin: 0.75rem 0; }
.capture-body h3 { font-size: 1rem; margin: 0.5rem 0; }
.capture-body ul, .capture-body ol { padding-left: 1.5rem; }
.capture-body code { background: #f0f0f0; padding: 0.125rem 0.25rem; }
.capture-body pre { background: #f0f0f0; padding: 0.75rem; }
.capture-body blockquote { border-left: 3px solid #ddd; padding-left: 0.75rem; }
```

## Features Implemented

✅ Create text captures with title and body
✅ Markdown rendering with react-markdown
✅ Edit existing text captures
✅ Delete with confirmation dialog
✅ Accordion UI for space efficiency
✅ Timestamp display in local format
✅ Type badge for visual distinction
✅ Empty state handling
✅ Form validation (title required)

## Edge Cases

1. **Empty body text**: Allowed, capture saves with title only
2. **Long titles**: Displayed inline, may wrap
3. **Markdown syntax errors**: react-markdown handles gracefully
4. **Special characters**: Properly escaped in database
5. **Empty project**: Shows "No captures yet" message

## Integration Points

- **Open Loop Flag**: Text captures can be flagged (separate feature)
- **Project Summaries**: Text capture content included in AI summaries
- **Type Filter**: Can filter to show only text captures
- **Accordion State**: Maintains expanded/collapsed state per capture

## Future Enhancements

- [ ] Rich text editor (WYSIWYG alternative to markdown)
- [ ] Tag system for categorization
- [ ] Search within capture body text
- [ ] Export to markdown file
- [ ] Duplicate capture function
- [ ] Capture templates

---

**Dependencies:**
- react-markdown (markdown rendering)
- SQLite database with captures table
- IPC bridge for secure communication

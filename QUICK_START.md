# Quick Start Guide

Get Open Loops running in 5 minutes.

## Installation

```bash
npm install
```

## Run Development Mode

```bash
npm run dev
```

The app will open automatically. If it doesn't, check the terminal for errors.

## First Steps

### 1. Create Your First Project

1. Click the **+** button next to "Projects" in the sidebar
2. Name your project (e.g., "Work Notes")
3. Click **Create**

### 2. Add Some Captures

**Quick Text Note:**
1. Click **+ Text**
2. Enter a title like "Meeting notes"
3. Add details in the body
4. Click **Create**

**Drag & Drop an Image:**
1. Find an image file on your computer
2. Drag it onto the project view
3. It's automatically saved!

**Try Audio Recording:**
1. Click **🎤 Record**
2. Say something
3. Click **⏹ Stop**
4. The audio is saved (transcription requires API key - see Settings)

### 3. Generate a Project Summary

1. Click **Regenerate** in the Project Summary panel
2. Wait a few seconds
3. You'll see a basic summary (or configure AI in Settings for better summaries)

### 4. Plan Your Day

**Import a Calendar:**
1. Click **Today Planner** in sidebar
2. Click **Import .ics File** and select your calendar export
3. Or use the sample: `sample.ics` in the project root

**Add a Task:**
1. Click **+ Task**
2. Title: "Review code"
3. Estimate: 60 minutes
4. Priority: 4
5. Click **Create**

**Generate Your Plan:**
1. Click **Generate Plan**
2. Review the suggested time blocks
3. Edit any block by clicking **Edit**
4. Click **Commit Plan** to save

## Configure AI (Optional)

For transcription and smart summaries, add your API key:

1. Click **Settings** in sidebar
2. Under **Transcription Provider**, select "Remote"
3. Enter your OpenAI API key (starts with `sk-`)
4. Under **LLM Provider**, select "Remote"
5. Enter the same or different API key
6. Click **Save Settings**

Now audio transcriptions will work automatically!

## Tips

- **Open Loops**: Click the ⚪ next to any capture to mark it as an open loop 🔴
- **Filter Captures**: Use the dropdown to filter by type (text/image/audio) or show only open loops
- **Paste Images**: Copy an image anywhere and paste (Ctrl/Cmd+V) in a project view
- **Edit Plans**: Plans can be edited after generation - adjust times, labels, or delete blocks
- **Working Hours**: Change your working hours in Settings to customize plan generation

## Troubleshooting

**App won't start:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install
npm run dev
```

**Database issues:**
- Database is stored in your user data folder (see README for location)
- Delete `loops.db` to reset (loses all data)

**Audio not recording:**
- Grant microphone permission when prompted
- Check browser/OS mic settings

**Transcription not working:**
- Verify API key in Settings
- Check console for errors (View > Toggle Developer Tools)

## Next Steps

- Read the full [README.md](README.md) for architecture details
- Configure working hours and planning preferences in Settings
- Set up local whisper.cpp for offline transcription (see README)
- Export your calendar from Google/Outlook and import into Loops

## Sample Workflow

1. **Morning**: Import today's calendar, review open tasks, generate plan
2. **During the day**: Capture notes, images, and voice memos in relevant projects
3. **End of day**: Mark completed tasks, flag important items as open loops
4. **Weekly**: Generate project summaries to review progress

---

Need help? Check the [README.md](README.md) or open an issue on GitHub.

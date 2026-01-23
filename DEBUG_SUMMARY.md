# Debugging Summary Generation

## What I Just Fixed

Added comprehensive logging throughout the entire summary generation pipeline so you can see exactly what's happening (or not happening).

## How to Debug

1. **Open Developer Tools in the app**:
   - Menu: View > Toggle Developer Tools
   - Or press: Ctrl+Shift+I

2. **Open the Console tab** (should be the default)

3. **Click "Regenerate" on a project summary**

4. **Watch the console output**

You should see logs like:
```
=== Summary Generation Started ===
Project ID: abc-123-def
Found 5 captures and 3 tasks
Context length: 1234 characters
Enqueueing summary job...
[JobManager] Enqueueing summary job for project: abc-123-def
[JobManager] Summary job enqueued with ID: job-456
[JobManager] Processing summary job: job-456
[Job Worker] Received job: summary ID: job-456
[Job Worker] Handling summary job
[Job Worker] LLM config: { type: 'remote', apiKey: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'mistral' }
[Job Worker] Creating LLM provider...
[Job Worker] LLM provider created: remote-llm
[Job Worker] Generating summary...
[Job Worker] Summary generated, length: 456
[Job Worker] Job completed successfully: job-456
[JobManager] Job completed: job-456 success: true
Polling attempt 1/15
Summary received: { ... }
```

## Common Issues

### Issue 1: Worker Not Starting
**Symptom**: No `[Job Worker]` logs at all

**Solution**:
```bash
# Rebuild to include worker
npm run build
npm run dev
```

Check that `dist-electron/job-worker.js` exists.

### Issue 2: LLM Provider Creation Fails
**Symptom**: Error when creating LLM provider

**Possible causes**:
- Ollama not running: `ollama serve`
- Wrong base URL in settings
- No API key set (even for Ollama, put something like "ollama")

**Check Ollama**:
```bash
# Test Ollama endpoint
curl http://localhost:11434/v1/models

# Should return JSON with model list
```

### Issue 3: Summary Generation Times Out
**Symptom**: "Summary generation is taking longer than expected"

**Possible causes**:
- Ollama model not loaded
- Model too large for your hardware
- Context too large

**Solutions**:
- Use a smaller model: `ollama pull llama3.2` or `ollama pull phi3`
- Check Ollama logs for errors
- Reduce summary lookback days in Settings

### Issue 4: Empty Context
**Symptom**: `Found 0 captures and 0 tasks`

**Solution**: Add some content to your project first!
- Create a few text captures
- Or create some tasks
- The summary needs data to work with

### Issue 5: Settings Not Saved
**Symptom**: Config shows empty or wrong values

**Solution**:
1. Open Settings
2. Fill in ALL fields (even if using defaults)
3. Click Save Settings
4. Check console for "Settings saved successfully"

## Test with Minimal Config

If nothing works, try the "Disabled" mode first:

1. **Settings**:
   - LLM Provider: `Disabled`
   - (Leave other fields empty)
   - Save Settings

2. **Test**:
   - Go to a project with some captures
   - Click Regenerate
   - You should get a basic local summary (no AI)

If even this doesn't work, there's a fundamental issue with the job system.

## Full Debug Checklist

- [ ] `dist-electron/job-worker.js` exists
- [ ] Dev tools console is open
- [ ] Settings saved with LLM config
- [ ] Ollama is running (if using Ollama)
- [ ] Project has some captures or tasks
- [ ] Click Regenerate
- [ ] See logs in console
- [ ] Summary appears within 30 seconds

## What to Report

If it still doesn't work, copy:
1. All console output from clicking Regenerate
2. Your Settings values (Base URL, Model)
3. Output of: `curl http://localhost:11434/v1/models`

---

**The logs will tell us exactly where it's failing!**

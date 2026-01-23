# Connection Testing Feature

New in Open Loops! You can now test your Ollama/OpenAI connections directly from the Settings UI.

## Features

### 1. **Test Connection Button**

For both LLM and Transcription providers, there's now a "Test Connection" button next to the Base URL field.

**What it does:**
- Calls the `/models` endpoint to verify the connection
- Shows success/failure message with details
- For LLM providers, fetches the list of available models

### 2. **Automatic Model Discovery**

When you test an LLM connection successfully:
- The app fetches all available models from the endpoint
- Shows a dropdown with all models to choose from
- Works with both OpenAI and Ollama endpoints

**No more guessing model names!**

### 3. **Visual Feedback**

- ✅ Green message: Connection successful
- ❌ Red message: Connection failed with error details
- ⚠️ Yellow warning: Missing API key (when required)

## How to Use

### Setting Up Ollama

1. **Start Ollama** (if not running):
   ```bash
   ollama serve
   ```

2. **In Loops Settings**:
   - LLM Provider Type: Select "Remote"
   - API Key: Type "ollama" (or any string)
   - Base URL: `http://localhost:11434/v1`
   - Click **"Test Connection"**

3. **Result**:
   - Should show: "✅ Connected! Found X models"
   - A dropdown appears with all your Ollama models
   - Select your model from the dropdown (e.g., mistral, llama2)

4. **Click Save Settings**

### Setting Up OpenAI

1. **In Loops Settings**:
   - LLM Provider Type: Select "Remote"
   - API Key: Your OpenAI key (`sk-...`)
   - Base URL: Leave as `https://api.openai.com/v1`
   - Click **"Test Connection"**

2. **Result**:
   - Should show: "✅ Connected! Found X models"
   - Dropdown shows OpenAI models (gpt-4, gpt-3.5-turbo, etc.)
   - Select your preferred model

3. **Click Save Settings**

## Troubleshooting

### "Connection failed: fetch failed"

**For Ollama:**
```bash
# Check if Ollama is running
ollama list

# If not, start it
ollama serve

# Test the endpoint manually
curl http://localhost:11434/v1/models
```

**For OpenAI:**
- Check your API key is valid
- Check your internet connection
- Verify the base URL is correct

### "No models found"

**For Ollama:**
```bash
# Pull a model if you don't have any
ollama pull mistral
ollama pull llama2

# Verify
ollama list
```

### "Unexpected API response format"

The endpoint returned data, but not in expected format. Check:
- Are you using the correct base URL?
- For Ollama: Must use `http://localhost:11434/v1` (note the `/v1`)
- For OpenAI: Must use `https://api.openai.com/v1`

## API Compatibility

### Supported Formats

**OpenAI Format:**
```json
{
  "data": [
    { "id": "gpt-4" },
    { "id": "gpt-3.5-turbo" }
  ]
}
```

**Ollama Format:**
```json
{
  "models": [
    { "name": "mistral" },
    { "name": "llama2" }
  ]
}
```

Both formats are automatically detected and handled.

## Benefits

- ✅ **Instant validation**: Know immediately if your config works
- ✅ **No typos**: Select models from dropdown instead of typing
- ✅ **Clear errors**: See exactly what went wrong
- ✅ **Faster setup**: Test before saving, iterate quickly

## Example Workflow

1. Enter Ollama base URL: `http://localhost:11434/v1`
2. Enter API key: `ollama`
3. Click **Test Connection**
4. See: "✅ Connected! Found 3 models"
5. Dropdown appears with: mistral, llama2, phi3
6. Select "mistral"
7. Click **Save Settings**
8. Done! Ready to generate summaries

---

**No more guessing if your connection works!**

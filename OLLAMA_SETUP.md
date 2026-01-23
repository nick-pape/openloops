# Using Open Loops with Ollama (Local LLM)

Ollama provides local LLM inference, perfect for privacy-focused AI summaries without API costs.

## Prerequisites

- Ollama installed and running: https://ollama.ai
- A model pulled (e.g., `ollama pull llama2`, `ollama pull mistral`)

## Configuration

1. **Start Ollama** (if not already running):
```bash
ollama serve
```

2. **In Open Loops Settings**:
   - **LLM Provider Type**: Select "Remote"
   - **Base URL**: `http://localhost:11434/v1`
   - **Model**: Your model name (e.g., `llama2`, `mistral`, `llama3.2`)
   - **API Key**: Any non-empty string (Ollama doesn't require a key, but put "ollama" or "local")

3. Click **Save Settings**

## How It Works

Ollama provides an OpenAI-compatible API endpoint at `/v1/chat/completions`, which Open Loops uses for generating summaries.

## Recommended Models

- **For Speed**: `llama3.2` or `phi3` (smaller, faster)
- **For Quality**: `llama2` or `mistral` (better reasoning)
- **For Code**: `codellama` or `deepseek-coder`

## Troubleshooting

### "Failed to generate summary"

**Check Ollama is running:**
```bash
ollama list  # Should show your installed models
```

**Check the endpoint:**
```bash
curl http://localhost:11434/v1/models
```

Should return a list of models.

### Slow summaries

- Use a smaller model (`phi3`, `llama3.2`)
- Reduce summary lookback days in Settings (default 14)
- Ensure you have enough RAM (8GB minimum for smaller models)

## Whisper for Audio Transcription

For local audio transcription, you need `whisper.cpp`:

### Windows Setup

1. **Download whisper.cpp**:
   - Pre-built: https://github.com/ggerganov/whisper.cpp/releases
   - Or build from source

2. **Download a model**:
```bash
# Small model (fast, good quality)
curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin -o ggml-base.en.bin
```

3. **In Loops Settings**:
   - **Transcription Provider**: Select "Local"
   - **Binary Path**: `C:\path\to\whisper.exe` (or `main.exe`)
   - **Model Path**: `C:\path\to\ggml-base.en.bin`

4. Click **Save Settings**

### Test It

1. Create a project
2. Click **🎤 Record**
3. Speak for a few seconds
4. Click **⏹ Stop**
5. Wait ~5-10 seconds
6. Transcription should appear under the audio capture

## Full Local Setup (No API Keys)

With Ollama + whisper.cpp:
- ✅ Audio transcription (local)
- ✅ AI summaries (local)
- ✅ No API costs
- ✅ Complete privacy
- ✅ Works offline

## Alternative: Remote Transcription + Local LLM

If whisper.cpp setup is difficult:
- Use OpenAI Whisper API for transcription ($0.006/minute)
- Use Ollama for free, unlimited summaries
- Best of both worlds: accuracy + privacy

## Performance Tips

1. **GPU Acceleration** (if you have NVIDIA GPU):
   - Use Ollama with CUDA support (automatic on Windows/Linux)
   - For whisper.cpp, build with CUDA support

2. **Model Selection**:
   - Summary quality matters more than speed (runs infrequently)
   - Use larger model for summaries: `mistral`, `llama2`
   - Use smaller model for transcription: `base.en` or `small.en`

3. **Resource Usage**:
   - Ollama will use GPU if available
   - whisper.cpp can use CPU efficiently
   - Both can run simultaneously

## Example Settings

### Option 1: Full Local (Privacy First)
```
Transcription Provider: Local
  Binary Path: C:\whisper\main.exe
  Model Path: C:\whisper\ggml-base.en.bin

LLM Provider: Remote (Ollama)
  Base URL: http://localhost:11434/v1
  Model: mistral
  API Key: ollama
```

### Option 2: Hybrid (Ease + Privacy)
```
Transcription Provider: Remote
  Base URL: https://api.openai.com/v1
  API Key: sk-...

LLM Provider: Remote (Ollama)
  Base URL: http://localhost:11434/v1
  Model: llama2
  API Key: ollama
```

---

**Ready?** Configure your settings and try generating a project summary!

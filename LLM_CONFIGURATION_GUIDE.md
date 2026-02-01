# 🔄 LLM Configuration Guide - Switching from Ollama to Gemini/OpenAI/Claude

## 📍 Configuration Locations

### 1. **Environment Variables** (`.env` file)
```
OLLAMA_URL=http://localhost:11434
```

**Change to:**
```
# For OpenAI
OPENAI_API_KEY=sk-xxx...
OPENAI_MODEL=gpt-4-turbo

# For Gemini
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-1.5-pro

# For Claude
CLAUDE_API_KEY=sk-ant-xxx...
CLAUDE_MODEL=claude-3-opus
```

---

### 2. **Worker LLM Integration** 
**File:** `apps/worker/src/worker.js` (Lines 105-145)

Current Ollama code:
```javascript
async function callLLM(prompt, context = {}) {
  if (!OLLAMA_URL) {
    console.log('[ADAPTER] Ollama URL not configured');
    return null;
  }

  const operation = async () => {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: 'llama3.2',
      prompt: `Context: ${JSON.stringify(context)}\n\nUser: ${prompt}\n\nAssistant:`,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 500
      }
    }, {
      timeout: 60000
    });
    return response.data.response;
  };
  // ... circuit breaker logic
}
```

---

## 🔄 How to Switch LLMs

### Option 1: OpenAI (GPT-4)

**1. Update `.env`:**
```env
# Remove or comment out
# OLLAMA_URL=http://localhost:11434

# Add
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4-turbo
```

**2. Update `apps/worker/src/worker.js` - Replace `callLLM()` function:**

```javascript
async function callLLM(prompt, context = {}) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo';

  if (!OPENAI_API_KEY) {
    console.log('[ADAPTER] OpenAI API key not configured');
    return null;
  }

  const operation = async () => {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: `Context: ${JSON.stringify(context)}`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 500
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });
    return response.data.choices[0].message.content;
  };

  try {
    await ollamaCircuitBreaker.initialize(redisClient);
    const result = await ollamaCircuitBreaker.execute('openai_api', operation, 60000);
    
    if (result.success) {
      return result.result;
    } else {
      console.log('[ADAPTER] OpenAI API unavailable:', result.error);
      return null;
    }
  } catch (error) {
    console.log('[ADAPTER] OpenAI error:', error.message);
    return null;
  }
}
```

**3. Install OpenAI package:**
```bash
cd apps/worker
npm install openai
```

---

### Option 2: Google Gemini

**1. Update `.env`:**
```env
GEMINI_API_KEY=AIza-your-key-here
GEMINI_MODEL=gemini-1.5-pro
```

**2. Update `apps/worker/src/worker.js` - Replace `callLLM()` function:**

```javascript
async function callLLM(prompt, context = {}) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro';

  if (!GEMINI_API_KEY) {
    console.log('[ADAPTER] Gemini API key not configured');
    return null;
  }

  const operation = async () => {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: `Context: ${JSON.stringify(context)}\n\nUser: ${prompt}\n\nAssistant:`
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500
        }
      },
      { timeout: 60000 }
    );
    return response.data.candidates[0].content.parts[0].text;
  };

  try {
    await ollamaCircuitBreaker.initialize(redisClient);
    const result = await ollamaCircuitBreaker.execute('gemini_api', operation, 60000);
    
    if (result.success) {
      return result.result;
    } else {
      console.log('[ADAPTER] Gemini API unavailable:', result.error);
      return null;
    }
  } catch (error) {
    console.log('[ADAPTER] Gemini error:', error.message);
    return null;
  }
}
```

---

### Option 3: Anthropic Claude

**1. Update `.env`:**
```env
CLAUDE_API_KEY=sk-ant-your-key-here
CLAUDE_MODEL=claude-3-opus
```

**2. Update `apps/worker/src/worker.js` - Replace `callLLM()` function:**

```javascript
async function callLLM(prompt, context = {}) {
  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
  const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-opus';

  if (!CLAUDE_API_KEY) {
    console.log('[ADAPTER] Claude API key not configured');
    return null;
  }

  const operation = async () => {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system: `Context: ${JSON.stringify(context)}`,
      messages: [{
        role: 'user',
        content: prompt
      }]
    }, {
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });
    return response.data.content[0].text;
  };

  try {
    await ollamaCircuitBreaker.initialize(redisClient);
    const result = await ollamaCircuitBreaker.execute('claude_api', operation, 60000);
    
    if (result.success) {
      return result.result;
    } else {
      console.log('[ADAPTER] Claude API unavailable:', result.error);
      return null;
    }
  } catch (error) {
    console.log('[ADAPTER] Claude error:', error.message);
    return null;
  }
}
```

---

## 📝 Configuration Files to Update

| File | Section | Change |
|------|---------|--------|
| `.env` | ADAPTERS | Add API_KEY and MODEL |
| `apps/worker/src/worker.js` | `callLLM()` function | Replace with provider code |
| `docker-compose.yml` | Optional | Remove `ollama` service if not needed |
| `apps/api/src/server.js` | Line 295+ | Update adapter status check |

---

## 🔑 Getting API Keys

### OpenAI
1. Go to https://platform.openai.com/api-keys
2. Create new secret key
3. Copy to `.env` as `OPENAI_API_KEY`

### Gemini
1. Go to https://aistudio.google.com/app/apikey
2. Create API key
3. Copy to `.env` as `GEMINI_API_KEY`

### Claude
1. Go to https://console.anthropic.com/
2. Create API key
3. Copy to `.env` as `CLAUDE_API_KEY`

---

## ✅ Verification Steps

1. **Update `.env`:**
   ```bash
   # Add your API key
   export OPENAI_API_KEY="sk-xxx..."
   ```

2. **Update code:**
   ```bash
   # Edit apps/worker/src/worker.js with new LLM code
   ```

3. **Restart services:**
   ```bash
   docker-compose restart api worker
   # OR
   npm restart (if running locally)
   ```

4. **Test:**
   ```bash
   curl -X POST http://localhost:3003/api/chat \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"message":"Hello"}'
   ```

---

## 🚨 Important Notes

⚠️ **FREEZE LOCK:** The system is currently FROZEN at `core-freeze-v2.0.0`

To modify the LLM adapter:
1. **Unfreeze the core** - Contact security committee
2. **Create feature branch** - `feature/llm-switch-{provider}`
3. **Update code** - Follow steps above
4. **Test thoroughly** - Run validation suite
5. **Create PR** - Request review
6. **Re-freeze** - Apply new freeze after validation

---

## 📚 API Costs Estimate

| Provider | Cost | Model | Use Case |
|----------|------|-------|----------|
| **Ollama** | Free | llama3.2 | Local, no cost |
| **OpenAI** | $0.01-$0.03 per 1K tokens | GPT-4 Turbo | Production, high quality |
| **Gemini** | Free tier + $0.075 per 1M tokens | Gemini 1.5 | Free tier, good value |
| **Claude** | $0.003-$0.024 per 1K tokens | Claude 3 Opus | High performance |

---

## 🔧 Troubleshooting

**Error: "API key not configured"**
- Check `.env` file has correct key name
- Restart services after .env change

**Error: "API timeout"**
- Increase timeout in axios call (currently 60000ms)
- Check network connectivity to API endpoint

**Error: "Circuit breaker open"**
- API provider is down or rate limited
- Check logs for specific error message
- Wait before retrying

---

**Last Updated:** 2026-02-01  
**Status:** FROZEN (unfreeze required for modifications)  
**Related:** `apps/worker/src/worker.js`, `.env`

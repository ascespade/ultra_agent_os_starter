# LLM Provider Registry

## Active Design
- Dynamic provider selection via [lib/llm/registry.js](file:///home/al-hemam/ultra_agent_os_starter/lib/llm/registry.js)
- Worker integration in [worker.js](file:///home/al-hemam/ultra_agent_os_starter/apps/worker/src/worker.js#L163-L204)

## Supported Providers
- Ollama: OLLAMA_URL, OLLAMA_MODEL
- OpenAI: OPENAI_API_KEY, OPENAI_MODEL
- Anthropic: ANTHROPIC_API_KEY, ANTHROPIC_MODEL
- Gemini: GOOGLE_API_KEY, GEMINI_MODEL

## Governance
- Keys read from environment only
- UI does not call providers directly
- Core orchestrates all LLM calls

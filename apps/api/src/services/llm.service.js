const axios = require('axios');

class BaseProvider {
  constructor(config) {
    this.config = config;
    this.name = 'base';
  }

  async healthCheck() {
    throw new Error('Not implemented');
  }

  async generateCompletion(prompt, options = {}) {
    throw new Error('Not implemented');
  }
}

class OllamaProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = 'ollama';
    this.baseUrl = config.url || 'http://localhost:11434';
  }

  async healthCheck() {
    try {
      const res = await axios.get(`${this.baseUrl}/api/tags`);
      return res.status === 200;
    } catch (error) {
      return false;
    }
  }

  async generateCompletion(prompt, options = {}) {
    try {
      const res = await axios.post(`${this.baseUrl}/api/generate`, {
        model: this.config.model || 'llama2',
        prompt: prompt,
        stream: false,
        ...options
      });
      return {
        text: res.data.response,
        usage: {
          prompt_tokens: res.data.prompt_eval_count,
          completion_tokens: res.data.eval_count,
          total_tokens: (res.data.prompt_eval_count || 0) + (res.data.eval_count || 0)
        }
      };
    } catch (error) {
      throw new Error(`Ollama generation failed: ${error.message}`);
    }
  }
}

class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = 'openai';
    this.apiKey = config.apiKey;
    this.baseUrl = config.url || 'https://api.openai.com/v1';
  }

  async healthCheck() {
    try {
      const res = await axios.get(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      return res.status === 200;
    } catch (error) {
      return false;
    }
  }

  async generateCompletion(prompt, options = {}) {
    try {
      const res = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: this.config.model || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        ...options
      }, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      return {
        text: res.data.choices[0].message.content,
        usage: res.data.usage
      };
    } catch (error) {
      throw new Error(`OpenAI generation failed: ${error.message}`);
    }
  }
}

class LLMService {
  constructor() {
    this.providers = new Map();
    this.activeProvider = null;
    this.initializeFromEnv();
  }

  initializeFromEnv() {
    // Register Ollama if configured
    if (process.env.OLLAMA_URL) {
      this.registerProvider('ollama', new OllamaProvider({
        url: process.env.OLLAMA_URL,
        model: process.env.OLLAMA_MODEL || 'llama2'
      }));
    }

    // Register OpenAI if configured
    if (process.env.OPENAI_API_KEY) {
      this.registerProvider('openai', new OpenAIProvider({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
      }));
    }

    // Set default active provider
    const defaultProvider = process.env.LLM_PROVIDER || 'ollama';
    if (this.providers.has(defaultProvider)) {
      this.activeProvider = defaultProvider;
    } else if (this.providers.size > 0) {
      this.activeProvider = this.providers.keys().next().value;
    }
  }

  registerProvider(name, providerInstance) {
    this.providers.set(name, providerInstance);
  }

  getProvider(name) {
    return this.providers.get(name);
  }

  getActiveProvider() {
    if (!this.activeProvider) {
      throw new Error('No active LLM provider configured');
    }
    return this.providers.get(this.activeProvider);
  }

  setActiveProvider(name) {
    if (!this.providers.has(name)) {
      throw new Error(`Provider ${name} not found`);
    }
    this.activeProvider = name;
    return { success: true, active: name };
  }

  listProviders() {
    return Array.from(this.providers.keys()).map(key => ({
      name: key,
      active: key === this.activeProvider,
      config: this.providers.get(key).config // Be careful not to leak full keys if we expand this
    }));
  }

  async testProvider(name) {
    const provider = this.getProvider(name);
    if (!provider) throw new Error(`Provider ${name} not found`);
    return await provider.healthCheck();
  }
}

// Singleton instance
const llmService = new LLMService();

module.exports = llmService;

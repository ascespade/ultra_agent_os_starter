const { Pool } = require('pg');
const redis = require('redis');

class LLMProviderService {
  constructor() {
    this.pool = null;
    this.redisClient = null;
    this.providers = new Map();
    this.activeProvider = null;
  }

  async initialize() {
    // Initialize database connection
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Initialize Redis connection
    this.redisClient = redis.createClient({
      url: process.env.REDIS_URL
    });
    await this.redisClient.connect();

    // Load providers from database
    await this.loadProvidersFromDatabase();
    
    // Initialize from environment as fallback
    this.initializeFromEnv();
  }

  async loadProvidersFromDatabase() {
    try {
      const result = await this.pool.query(`
        SELECT id, name, type, display_name, description, config, 
               is_active, is_enabled, health_status, last_health_check
        FROM llm_providers 
        WHERE is_enabled = true
        ORDER BY is_active DESC, name ASC
      `);

      for (const row of result.rows) {
        this.providers.set(row.name, {
          id: row.id,
          name: row.name,
          type: row.type,
          displayName: row.display_name,
          description: row.description,
          config: row.config,
          isActive: row.is_active,
          healthStatus: row.health_status,
          lastHealthCheck: row.last_health_check
        });

        // Set active provider if marked as active
        if (row.is_active && !this.activeProvider) {
          this.activeProvider = row.name;
        }
      }

      console.log(`[LLM] Loaded ${result.rows.length} providers from database`);
    } catch (error) {
      console.error('[LLM] Failed to load providers from database:', error);
    }
  }

  initializeFromEnv() {
    // Register Ollama if configured (environment override)
    if (process.env.OLLAMA_URL) {
      const existingProvider = this.providers.get('ollama');
      const config = existingProvider ? existingProvider.config : {};
      
      this.registerProvider('ollama', {
        id: existingProvider?.id,
        name: 'ollama',
        type: 'ollama',
        displayName: 'Ollama Local (Env)',
        description: 'Local Ollama instance from environment',
        config: {
          ...config,
          url: process.env.OLLAMA_URL,
          model: process.env.OLLAMA_MODEL || config.model || 'llama3.2'
        },
        isActive: false,
        healthStatus: 'unknown'
      });
    }

    // Register OpenAI if configured (environment override)
    if (process.env.OPENAI_API_KEY) {
      const existingProvider = this.providers.get('openai');
      const config = existingProvider ? existingProvider.config : {};
      
      this.registerProvider('openai', {
        id: existingProvider?.id,
        name: 'openai',
        type: 'openai',
        displayName: 'OpenAI GPT (Env)',
        description: 'OpenAI GPT from environment',
        config: {
          ...config,
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL || config.model || 'gpt-3.5-turbo',
          apiUrl: 'https://api.openai.com/v1'
        },
        isActive: false,
        healthStatus: 'unknown'
      });
    }

    // Set default active provider from environment if no active provider set
    if (!this.activeProvider) {
      const defaultProvider = process.env.LLM_PROVIDER || 'ollama';
      if (this.providers.has(defaultProvider)) {
        this.activeProvider = defaultProvider;
      } else if (this.providers.size > 0) {
        this.activeProvider = this.providers.keys().next().value;
      }
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

  async setActiveProvider(name) {
    if (!this.providers.has(name)) {
      throw new Error(`Provider ${name} not found`);
    }

    // Update database
    try {
      await this.pool.query(`
        UPDATE llm_providers 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE is_active = true
      `);

      await this.pool.query(`
        UPDATE llm_providers 
        SET is_active = true, updated_at = CURRENT_TIMESTAMP
        WHERE name = $1
      `, [name]);

      // Update in-memory state
      for (const [providerName, provider] of this.providers) {
        provider.isActive = providerName === name;
      }
      this.activeProvider = name;

      console.log(`[LLM] Switched active provider to: ${name}`);
      return { success: true, active: name };
    } catch (error) {
      console.error('[LLM] Failed to switch provider:', error);
      throw error;
    }
  }

  listProviders() {
    return Array.from(this.providers.values()).map(provider => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      displayName: provider.displayName,
      description: provider.description,
      isActive: provider.isActive,
      healthStatus: provider.healthStatus,
      lastHealthCheck: provider.lastHealthCheck
    }));
  }

  async generate(prompt, context = {}) {
    const provider = this.getActiveProvider();
    const config = provider.config;

    try {
      let result;
      switch (provider.type) {
        case 'ollama':
          result = await this.generateOllama(prompt, context, config);
          break;
        case 'openai':
          result = await this.generateOpenAI(prompt, context, config);
          break;
        case 'anthropic':
          result = await this.generateAnthropic(prompt, context, config);
          break;
        case 'gemini':
          result = await this.generateGemini(prompt, context, config);
          break;
        default:
          throw new Error(`Unsupported provider type: ${provider.type}`);
      }

      // Log usage
      await this.logUsage(provider.id, 'generation', result.tokens || 0);

      return result;
    } catch (error) {
      console.error(`[LLM] Generation failed with ${provider.name}:`, error);
      throw error;
    }
  }

  async generateOllama(prompt, context, config) {
    const axios = require('axios');
    const url = config.baseUrl || config.url;
    const model = config.model || 'llama3.2';

    const res = await axios.post(`${url}/api/generate`, {
      model,
      prompt: `Context: ${JSON.stringify(context)}\n\nSystem Task: ${prompt}\n\nResponse:`,
      stream: false,
      options: { temperature: 0.1, num_predict: 500 }
    }, { timeout: 60000 });

    return {
      text: res.data && (res.data.response || res.data),
      tokens: res.data.prompt_eval_count + (res.data.eval_count || 0),
      model: model
    };
  }

  async generateOpenAI(prompt, context, config) {
    const axios = require('axios');
    const model = config.model || 'gpt-3.5-turbo';

    const res = await axios.post(`${config.apiUrl}/chat/completions`, {
      model,
      messages: [
        { role: 'system', content: `Context: ${JSON.stringify(context)}` },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1
    }, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      timeout: 60000
    });

    const choices = res.data && res.data.choices;
    if (!choices || !choices[0] || !choices[0].message) return null;

    return {
      text: choices[0].message.content,
      tokens: res.data.usage?.total_tokens || 0,
      model: model
    };
  }

  async generateAnthropic(prompt, context, config) {
    const axios = require('axios');
    const model = config.model || 'claude-3-haiku-20240307';

    const res = await axios.post(`${config.apiUrl}/messages`, {
      model,
      max_tokens: 1000,
      messages: [
        { role: 'user', content: [{ type: 'text', text: `Context: ${JSON.stringify(context)}\n\n${prompt}` }] }
      ]
    }, {
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      timeout: 60000
    });

    const content = res.data && res.data.content;
    if (!content || !content[0] || !content[0].text) return null;

    return {
      text: content[0].text,
      tokens: res.data.usage?.input_tokens + (res.data.usage?.output_tokens || 0),
      model: model
    };
  }

  async generateGemini(prompt, context, config) {
    const axios = require('axios');
    const model = config.model || 'gemini-1.5-flash';

    const url = `${config.apiUrl}/models/${model}:generateContent?key=${config.apiKey}`;
    const res = await axios.post(url, {
      contents: [
        {
          role: 'user',
          parts: [{ text: `Context: ${JSON.stringify(context)}\n\n${prompt}` }]
        }
      ]
    }, { timeout: 60000 });

    const candidates = res.data && res.data.candidates;
    const parts = candidates && candidates[0] && candidates[0].content && candidates[0].content.parts;
    if (!parts || !parts[0] || !parts[0].text) return null;

    return {
      text: parts[0].text,
      tokens: res.data.usageMetadata?.totalTokenCount || 0,
      model: model
    };
  }

  async logUsage(providerId, usageType, tokens, duration = null) {
    try {
      await this.pool.query(`
        INSERT INTO llm_provider_usage (provider_id, usage_type, tokens_used, request_duration_ms)
        VALUES ($1, $2, $3, $4)
      `, [providerId, usageType, tokens, duration]);
    } catch (error) {
      console.error('[LLM] Failed to log usage:', error);
    }
  }

  async healthCheck() {
    const results = [];
    
    for (const [name, provider] of this.providers) {
      try {
        let isHealthy = false;
        
        switch (provider.type) {
          case 'ollama':
            isHealthy = await this.healthCheckOllama(provider.config);
            break;
          case 'openai':
            isHealthy = await this.healthCheckOpenAI(provider.config);
            break;
          case 'anthropic':
            isHealthy = await this.healthCheckAnthropic(provider.config);
            break;
          case 'gemini':
            isHealthy = await this.healthCheckGemini(provider.config);
            break;
        }

        // Update health status in database
        await this.pool.query(`
          UPDATE llm_providers 
          SET health_status = $1, last_health_check = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [isHealthy ? 'healthy' : 'unhealthy', provider.id]);

        provider.healthStatus = isHealthy ? 'healthy' : 'unhealthy';
        provider.lastHealthCheck = new Date().toISOString();
        
        results.push({
          name,
          type: provider.type,
          healthy: isHealthy
        });
      } catch (error) {
        console.error(`[LLM] Health check failed for ${name}:`, error);
        results.push({
          name,
          type: provider.type,
          healthy: false,
          error: error.message
        });
      }
    }

    return results;
  }

  async healthCheckOllama(config) {
    const axios = require('axios');
    try {
      const res = await axios.get(`${config.baseUrl || config.url}/api/tags`, { timeout: 5000 });
      return res.status === 200;
    } catch (error) {
      return false;
    }
  }

  async healthCheckOpenAI(config) {
    // Simple health check - try to list models
    const axios = require('axios');
    try {
      const res = await axios.get(`${config.apiUrl}/models`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        timeout: 5000
      });
      return res.status === 200;
    } catch (error) {
      return false;
    }
  }

  async healthCheckAnthropic(config) {
    // Anthropic doesn't have a public health endpoint, so we'll do a minimal test
    return !!config.apiKey;
  }

  async healthCheckGemini(config) {
    // Gemini health check - try to list models
    const axios = require('axios');
    try {
      const url = `${config.apiUrl}/models?key=${config.apiKey}`;
      const res = await axios.get(url, { timeout: 5000 });
      return res.status === 200;
    } catch (error) {
      return false;
    }
  }

  async cleanup() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    if (this.pool) {
      await this.pool.end();
    }
  }
}

module.exports = new LLMProviderService();

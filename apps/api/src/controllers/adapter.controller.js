const dbConnector = require("../../../../lib/db-connector");
const { getClient: getRedisClient } = require("../services/redis.service");
const llmProviderService = require("../services/llm-provider.service");

async function getStatus(req, res) {
  try {
    // Get providers from new LLM provider service
    const providers = llmProviderService.listProviders();
    const activeProvider = providers.find(p => p.isActive);
    
    const ollamaAvailable = providers.some(p => p.type === 'ollama');
    
    // Docker check (keep existing env check for now as we don't have a Docker service wrapper yet)
    const dockerAvailable =
      process.env.DOCKER_HOST &&
      process.env.DOCKER_HOST.trim() !== "" &&
      !process.env.DOCKER_HOST.includes("localhost");

    // DB Check
    const db = dbConnector.getPool();
    let databaseStatus = "unknown";
    let databaseError = null;

    try {
      await db.query("SELECT 1");
      databaseStatus = "connected";
    } catch (error) {
      databaseStatus = "error";
      databaseError = error.message;
    }

    // Redis Check
    let redisStatus = "unknown";
    let redisError = null;
    let queueLength = 0;

    try {
      const redis = getRedisClient();
      await redis.ping();
      redisStatus = "connected";

      const tenantId = req.tenantId || 'system';
      const tenantQueueKey = `tenant:${tenantId}:job_queue`;
      queueLength = await redis.lLen(tenantQueueKey);
    } catch (error) {
      redisStatus = "error";
      redisError = error.message;
    }

    const queueStatus = queueLength > 0 ? "active" : "idle";

    const status = {
      database: {
        available: databaseStatus === "connected",
        status: databaseStatus,
        error: databaseError,
        type: "postgresql",
      },
      redis: {
        available: redisStatus === "connected",
        status: redisStatus,
        error: redisError,
        queue_length: queueLength,
        queue_status: queueStatus,
        backlog_limit: 100,
        is_overloaded: queueLength >= 100,
      },
      adapters: {
        llm: {
          active_provider: activeProvider ? activeProvider.name : 'none',
          providers: providers,
          status: activeProvider ? 'configured' : 'not_configured'
        },
        // Keep legacy format for UI compatibility for now
        ollama: {
          available: ollamaAvailable,
          url: process.env.OLLAMA_URL || "not_configured",
          status: ollamaAvailable ? "available" : "unavailable",
        },
        docker: {
          available: dockerAvailable,
          socket: process.env.DOCKER_HOST || "not_configured",
          status: dockerAvailable ? "available" : "unavailable",
        },
      },
      core: {
        status: "running",
        message: "Core platform functionality is operational",
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
      timestamp: new Date().toISOString(),
    };

    res.json(status);
  } catch (error) {
    console.error("[API] Adapter status check failed:", error);
    res.status(500).json({
      error: "Failed to retrieve adapter status",
      timestamp: new Date().toISOString(),
    });
  }
}

async function testAdapter(req, res) {
  const { provider, url, model, apiKey } = req.body;

  try {
    // If testing a registered provider
    if (!url && !apiKey && llmService.getProvider(provider)) {
       const result = await llmService.testProvider(provider);
       return res.json({ 
         success: result, 
         message: result ? `${provider} is healthy` : `${provider} check failed` 
       });
    }

    // Ad-hoc testing logic
    let result = {};

    switch (provider) {
      case "ollama":
        let ollamaTestUrl = url;
        if (url && url.includes("localhost")) {
          ollamaTestUrl = url.replace("localhost", "ollama");
        }
        // Assuming fetch is available (Node 18+)
        const ollamaResponse = await fetch(`${ollamaTestUrl}/api/tags`, {
          timeout: 5000,
        }).catch((e) => ({ ok: false, error: e.message }));

        result = {
          success: ollamaResponse.ok,
          message: ollamaResponse.ok ? `Ollama connected. Model: ${model}` : "Failed",
          error: ollamaResponse.error
        };
        break;
      
      case "openai":
         // Basic connectivity check for OpenAI (if key provided)
         if (!apiKey) throw new Error("API Key required for OpenAI test");
         // We can use the llmService's class for ad-hoc test if we exposed it, but for now simple fetch
         const openaiRes = await fetch(`${url || 'https://api.openai.com/v1'}/models`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
         }).catch(e => ({ ok: false, statusText: e.message }));
         
         result = {
            success: openaiRes.ok,
            message: openaiRes.ok ? "OpenAI Connected" : `Failed: ${openaiRes.statusText}`
         };
         break;

      default:
        return res.status(400).json({ error: "Unknown or unsupported provider for test" });
    }

    res.json(result);
  } catch (error) {
    console.error("[API] Adapter test failed:", error);
    res.status(500).json({ error: "Test failed", message: error.message });
  }
}

async function listProviders(req, res) {
  try {
    const providers = llmProviderService.listProviders();
    res.json({ providers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function switchProvider(req, res) {
  const { provider } = req.body;
  if (!provider) return res.status(400).json({ error: "Provider name required" });
  
  try {
    const result = await llmProviderService.setActiveProvider(provider);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateProviderConfig(req, res) {
  const { providerId } = req.params;
  const { config } = req.body;
  
  if (!config) return res.status(400).json({ error: "Configuration required" });
  
  try {
    const db = dbConnector.getPool();
    await db.query(`
      UPDATE llm_providers 
      SET config = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [JSON.stringify(config), providerId]);
    
    // Reload providers from database
    await llmProviderService.loadProvidersFromDatabase();
    
    res.json({ success: true, message: "Provider configuration updated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function healthCheckProvider(req, res) {
  const { providerId } = req.params;
  
  try {
    const db = dbConnector.getPool();
    const result = await db.query(`
      SELECT name, type, config 
      FROM llm_providers 
      WHERE id = $1 AND is_enabled = true
    `, [providerId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Provider not found" });
    }
    
    const provider = result.rows[0];
    const healthResults = await llmProviderService.healthCheck();
    const providerHealth = healthResults.find(h => h.name === provider.name);
    
    res.json({
      providerId,
      name: provider.name,
      type: provider.type,
      healthy: providerHealth?.healthy || false,
      lastChecked: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getProviderUsage(req, res) {
  const { providerId } = req.params;
  const { limit = 100, offset = 0 } = req.query;
  
  try {
    const db = dbConnector.getPool();
    const result = await db.query(`
      SELECT usage_type, tokens_used, cost_cents, request_duration_ms, 
             model_used, created_at
      FROM llm_provider_usage 
      WHERE provider_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `, [providerId, limit, offset]);
    
    const totalResult = await db.query(`
      SELECT COUNT(*) as total 
      FROM llm_provider_usage 
      WHERE provider_id = $1
    `, [providerId]);
    
    res.json({
      providerId,
      usage: result.rows,
      pagination: {
        total: parseInt(totalResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getStatus,
  testAdapter,
  listProviders,
  switchProvider,
  updateProviderConfig,
  healthCheckProvider,
  getProviderUsage
};

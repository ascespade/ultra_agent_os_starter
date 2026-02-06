-- LLM Provider Configuration Schema
-- This migration creates tables for dynamic LLM provider management

CREATE TABLE IF NOT EXISTS llm_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    type VARCHAR(50) NOT NULL, -- 'ollama', 'openai', 'anthropic', 'gemini'
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    config JSONB NOT NULL DEFAULT '{}', -- Provider-specific configuration
    is_active BOOLEAN DEFAULT false,
    is_enabled BOOLEAN DEFAULT true,
    health_status VARCHAR(20) DEFAULT 'unknown', -- 'healthy', 'unhealthy', 'unknown'
    last_health_check TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS llm_provider_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES llm_providers(id) ON DELETE CASCADE,
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'system',
    usage_type VARCHAR(50) NOT NULL, -- 'generation', 'embedding', etc.
    tokens_used INTEGER DEFAULT 0,
    cost_cents INTEGER DEFAULT 0,
    request_duration_ms INTEGER,
    model_used VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_llm_providers_active ON llm_providers(is_active, is_enabled);
CREATE INDEX IF NOT EXISTS idx_llm_providers_type ON llm_providers(type);
CREATE INDEX IF NOT EXISTS idx_llm_usage_provider ON llm_provider_usage(provider_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_tenant ON llm_provider_usage(tenant_id, created_at);

-- Insert default providers if they don't exist
INSERT INTO llm_providers (name, type, display_name, description, config, is_active) VALUES
('ollama', 'ollama', 'Ollama Local', 'Local Ollama instance for private LLM inference', '{"model": "llama3.2", "baseUrl": "http://localhost:11434"}', false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO llm_providers (name, type, display_name, description, config, is_active) VALUES
('openai', 'openai', 'OpenAI GPT', 'OpenAI GPT models for general purpose tasks', '{"model": "gpt-3.5-turbo", "apiUrl": "https://api.openai.com/v1"}', false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO llm_providers (name, type, display_name, description, config, is_active) VALUES
('anthropic', 'anthropic', 'Anthropic Claude', 'Anthropic Claude models for advanced reasoning', '{"model": "claude-3-haiku-20240307", "apiUrl": "https://api.anthropic.com/v1"}', false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO llm_providers (name, type, display_name, description, config, is_active) VALUES
('gemini', 'gemini', 'Google Gemini', 'Google Gemini models for multimodal tasks', '{"model": "gemini-1.5-flash", "apiUrl": "https://generativelanguage.googleapis.com/v1beta"}', false)
ON CONFLICT (name) DO NOTHING;

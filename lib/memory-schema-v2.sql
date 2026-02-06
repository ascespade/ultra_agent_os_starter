-- Memory Schema V2 for Ultra Agent OS
-- This schema supports the new memory management system

-- Memory entries table
CREATE TABLE IF NOT EXISTS memory_entries (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) DEFAULT 'default' NOT NULL,
    agent_id VARCHAR(100) NOT NULL,
    memory_type VARCHAR(50) NOT NULL, -- 'episodic', 'semantic', 'working', 'long_term'
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding TEXT, -- Store as JSON string for compatibility
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tags TEXT[] DEFAULT '{}',
    importance_score FLOAT DEFAULT 0.5,
    retrieval_priority FLOAT DEFAULT 0.5
);

-- Memory relationships table
CREATE TABLE IF NOT EXISTS memory_relationships (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) DEFAULT 'default' NOT NULL,
    source_memory_id INTEGER REFERENCES memory_entries(id) ON DELETE CASCADE,
    target_memory_id INTEGER REFERENCES memory_entries(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL, -- 'causal', 'temporal', 'semantic', 'associative'
    strength FLOAT DEFAULT 0.5,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Memory access patterns table
CREATE TABLE IF NOT EXISTS memory_access_patterns (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) DEFAULT 'default' NOT NULL,
    memory_id INTEGER REFERENCES memory_entries(id) ON DELETE CASCADE,
    access_type VARCHAR(50) NOT NULL, -- 'read', 'write', 'update', 'delete'
    context JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Memory consolidation logs
CREATE TABLE IF NOT EXISTS memory_consolidation_logs (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) DEFAULT 'default' NOT NULL,
    consolidation_type VARCHAR(50) NOT NULL, -- 'compression', 'forgetting', 'generalization'
    memory_ids INTEGER[] DEFAULT '{}',
    result_summary TEXT,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_memory_entries_tenant_agent ON memory_entries(tenant_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_memory_entries_type ON memory_entries(memory_type);
CREATE INDEX IF NOT EXISTS idx_memory_entries_created_at ON memory_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_memory_entries_tags ON memory_entries USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_memory_entries_metadata ON memory_entries USING GIN(metadata);

-- Vector similarity index (pgvector extension required)
-- Skipped: Using TEXT storage for embeddings instead of VECTOR type

-- Memory relationships indexes
CREATE INDEX IF NOT EXISTS idx_memory_relationships_source ON memory_relationships(source_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_relationships_target ON memory_relationships(target_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_relationships_tenant ON memory_relationships(tenant_id);

-- Memory access patterns indexes
CREATE INDEX IF NOT EXISTS idx_memory_access_patterns_memory_id ON memory_access_patterns(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_access_patterns_timestamp ON memory_access_patterns(timestamp);

-- Memory consolidation logs indexes
CREATE INDEX IF NOT EXISTS idx_memory_consolidation_logs_tenant ON memory_consolidation_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memory_consolidation_logs_timestamp ON memory_consolidation_logs(timestamp);

-- pgvector extension not available - using TEXT storage for embeddings

-- Memory retention policy
CREATE OR REPLACE FUNCTION cleanup_expired_memories()
RETURNS void AS $$
BEGIN
    DELETE FROM memory_entries 
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
    
    -- Delete old access patterns (keep last 30 days)
    DELETE FROM memory_access_patterns 
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    -- Delete old consolidation logs (keep last 90 days)
    DELETE FROM memory_consolidation_logs 
    WHERE timestamp < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Memory statistics view
CREATE OR REPLACE VIEW memory_statistics AS
SELECT 
    tenant_id,
    agent_id,
    memory_type,
    COUNT(*) as total_entries,
    AVG(importance_score) as avg_importance,
    AVG(access_count) as avg_access_count,
    MAX(created_at) as latest_entry,
    COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at > NOW() THEN 1 END) as active_entries
FROM memory_entries 
GROUP BY tenant_id, agent_id, memory_type;

-- Memory similarity search function (simplified without vector operations)
CREATE OR REPLACE FUNCTION search_similar_memories(
    p_tenant_id VARCHAR(50),
    p_agent_id VARCHAR(100),
    p_search_query TEXT,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    memory_id INTEGER,
    content TEXT,
    memory_type VARCHAR(50),
    importance_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        me.id,
        me.content,
        me.memory_type,
        me.importance_score
    FROM memory_entries me
    WHERE me.tenant_id = p_tenant_id
    AND me.agent_id = p_agent_id
    AND (me.content ILIKE '%' || p_search_query || '%' OR p_search_query IS NULL)
    ORDER BY me.importance_score DESC, me.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

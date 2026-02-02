-- Final Memory Schema (Simple CRUD)
-- Drops all previous complexity (views, triggers, vectors)

DROP TABLE IF EXISTS memory_audit CASCADE;
DROP TABLE IF EXISTS memory_stats CASCADE;
DROP VIEW IF EXISTS active_memories CASCADE;
DROP VIEW IF EXISTS memory_summary CASCADE;
DROP TABLE IF EXISTS memories CASCADE;

-- Functions cleanup
DROP FUNCTION IF EXISTS update_memory_stats() CASCADE;
DROP FUNCTION IF EXISTS update_access_count() CASCADE;
DROP FUNCTION IF EXISTS create_memory_audit() CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_memories() CASCADE;
DROP FUNCTION IF EXISTS archive_old_memories() CASCADE;

CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  user_id INTEGER NOT NULL,
  key VARCHAR(255) NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT memories_tenant_user_key_key UNIQUE (tenant_id, user_id, key)
);

CREATE INDEX idx_memories_lookup ON memories(tenant_id, user_id, key);


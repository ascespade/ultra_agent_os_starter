-- Enterprise Memory System Schema
-- Version: 1.0.0
-- Date: 2026-02-02T02:10:00+03:00

-- Create memories table with enterprise features
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(50) NOT NULL,
  user_id INTEGER NOT NULL,
  filename VARCHAR(255) NOT NULL,
  content JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  size_bytes INTEGER DEFAULT 0,
  access_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(filename, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(content::text, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(metadata::text, '')), 'D')
  ) STORED,
  CONSTRAINT unique_active_memory UNIQUE (tenant_id, user_id, filename) 
    DEFERRABLE INITIALLY DEFERRED
);

-- Create indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_memories_tenant_id ON memories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_filename ON memories(filename);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_memories_content ON memories USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
CREATE INDEX IF NOT EXISTS idx_memories_updated_at ON memories(updated_at);
CREATE INDEX IF NOT EXISTS idx_memories_expires_at ON memories(expires_at);
CREATE INDEX IF NOT EXISTS idx_memories_metadata ON memories USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_memories_active ON memories(tenant_id, user_id, filename) WHERE is_deleted = FALSE;

-- Create memory_stats table for analytics
CREATE TABLE IF NOT EXISTS memory_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(50) NOT NULL,
  user_id INTEGER NOT NULL,
  date DATE NOT NULL,
  total_memories INTEGER DEFAULT 0,
  total_size_bytes BIGINT DEFAULT 0,
  access_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_memory_stats_tenant_user_date ON memory_stats(tenant_id, user_id, date);

-- Create memory_audit table for audit trail
CREATE TABLE IF NOT EXISTS memory_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL,
  tenant_id VARCHAR(50) NOT NULL,
  user_id INTEGER NOT NULL,
  action VARCHAR(20) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'RESTORE'
  old_content JSONB,
  new_content JSONB,
  changes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_audit_memory_id ON memory_audit(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_audit_tenant_id ON memory_audit(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memory_audit_user_id ON memory_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_audit_created_at ON memory_audit(created_at);

-- Create function to update memory stats
CREATE OR REPLACE FUNCTION update_memory_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO memory_stats (tenant_id, user_id, date, total_memories, total_size_bytes, access_count)
  VALUES (
    NEW.tenant_id,
    NEW.user_id,
    CURRENT_DATE,
    1,
    COALESCE(NEW.size_bytes, 0),
    COALESCE(NEW.access_count, 0)
  )
  ON CONFLICT (tenant_id, user_id, date)
  DO UPDATE SET
    total_memories = memory_stats.total_memories + 1,
    total_size_bytes = memory_stats.total_size_bytes + COALESCE(NEW.size_bytes, 0),
    access_count = memory_stats.access_count + COALESCE(NEW.access_count, 0);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for memory stats
CREATE TRIGGER trigger_update_memory_stats
  AFTER INSERT ON memories
  FOR EACH ROW
  EXECUTE FUNCTION update_memory_stats();

-- Create function to update access count
CREATE OR REPLACE FUNCTION update_access_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE memories 
  SET 
    access_count = access_count + 1,
    last_accessed = NOW()
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for access count (this will be called manually in the controller)
-- CREATE TRIGGER trigger_update_access_count
--   AFTER UPDATE ON memories
--   FOR EACH ROW
--   WHEN (OLD.access_count IS DISTINCT FROM NEW.access_count)
--   EXECUTE FUNCTION update_access_count();

-- Create function for audit trail
CREATE OR REPLACE FUNCTION create_memory_audit()
RETURNS TRIGGER AS $$
DECLARE
  action_type TEXT;
  changes_data JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_type := 'CREATE';
    changes_data := jsonb_build_object(
      'filename', NEW.filename,
      'size_bytes', NEW.size_bytes,
      'tags', NEW.tags
    );
    
    INSERT INTO memory_audit (memory_id, tenant_id, user_id, action, new_content, changes)
    VALUES (NEW.id, NEW.tenant_id, NEW.user_id, action_type, row_to_json(NEW)::jsonb, changes_data);
    
  ELSIF TG_OP = 'UPDATE' THEN
    action_type := 'UPDATE';
    changes_data := jsonb_build_object(
      'filename_changed', OLD.filename IS DISTINCT FROM NEW.filename,
      'size_changed', OLD.size_bytes IS DISTINCT FROM NEW.size_bytes,
      'tags_changed', OLD.tags IS DISTINCT FROM NEW.tags
    );
    
    INSERT INTO memory_audit (memory_id, tenant_id, user_id, action, old_content, new_content, changes)
    VALUES (NEW.id, NEW.tenant_id, NEW.user_id, action_type, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, changes_data);
    
  ELSIF TG_OP = 'DELETE' THEN
    action_type := 'DELETE';
    
    INSERT INTO memory_audit (memory_id, tenant_id, user_id, action, old_content)
    VALUES (OLD.id, OLD.tenant_id, OLD.user_id, action_type, row_to_json(OLD)::jsonb);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for audit trail
CREATE TRIGGER trigger_memory_audit
  AFTER INSERT OR UPDATE OR DELETE ON memories
  FOR EACH ROW
  EXECUTE FUNCTION create_memory_audit();

-- Create view for active memories
CREATE OR REPLACE VIEW active_memories AS
SELECT 
  id,
  tenant_id,
  user_id,
  filename,
  content,
  metadata,
  tags,
  created_at,
  updated_at,
  expires_at,
  size_bytes,
  access_count,
  last_accessed
FROM memories
WHERE is_deleted = FALSE AND (expires_at IS NULL OR expires_at > NOW());

-- Create view for memory statistics
CREATE OR REPLACE VIEW memory_summary AS
SELECT 
  tenant_id,
  user_id,
  COUNT(*) as total_memories,
  SUM(size_bytes) as total_size_bytes,
  SUM(access_count) as total_access_count,
  MAX(created_at) as latest_memory,
  COUNT(CASE WHEN is_archived = TRUE THEN 1 END) as archived_count,
  COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 END) as expired_count
FROM memories
WHERE is_deleted = FALSE
GROUP BY tenant_id, user_id;

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON memories TO api_user;
-- GRANT SELECT ON memory_stats TO api_user;
-- GRANT SELECT ON memory_audit TO api_user;
-- GRANT SELECT ON active_memories TO api_user;
-- GRANT SELECT ON memory_summary TO api_user;

-- Create function for cleanup of expired memories
CREATE OR REPLACE FUNCTION cleanup_expired_memories()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  UPDATE memories 
  SET is_deleted = TRUE, updated_at = NOW()
  WHERE is_deleted = FALSE 
    AND expires_at IS NOT NULL 
    AND expires_at <= NOW();
    
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function for archive old memories
CREATE OR REPLACE FUNCTION archive_old_memories(days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  UPDATE memories 
  SET is_archived = TRUE, updated_at = NOW()
  WHERE is_deleted = FALSE 
    AND is_archived = FALSE 
    AND created_at < NOW() - INTERVAL '1 day' * days_old;
    
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  
  RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

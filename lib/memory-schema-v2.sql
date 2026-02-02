-- Simplified Memory System Schema
-- Version: 2.0.0 - Clean Rewrite
-- Date: 2026-02-02T08:44:00+03:00

-- Drop existing complex memory tables and views
DROP TABLE IF EXISTS memory_audit CASCADE;
DROP TABLE IF EXISTS memory_stats CASCADE;
DROP VIEW IF EXISTS active_memories CASCADE;
DROP VIEW IF EXISTS memory_summary CASCADE;
DROP TABLE IF EXISTS memories CASCADE;

-- Create simplified memories table with exact schema from orchestrator
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(50) NOT NULL,
  user_id INTEGER NOT NULL,
  key VARCHAR(255) NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create simple unique index as specified
CREATE UNIQUE INDEX idx_memories_unique_key ON memories(tenant_id, user_id, key);

-- Basic indexes for performance
CREATE INDEX idx_memories_tenant_id ON memories(tenant_id);
CREATE INDEX idx_memories_user_id ON memories(user_id);
CREATE INDEX idx_memories_created_at ON memories(created_at);

-- Simple trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_memories_updated_at 
    BEFORE UPDATE ON memories 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

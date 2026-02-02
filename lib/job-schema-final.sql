-- Final Job Schema
-- Aligned with Phase 3 Requirements: UUID v4, Strict Types

DROP TABLE IF EXISTS job_audit CASCADE;
DROP TABLE IF EXISTS job_stats CASCADE;
DROP VIEW IF EXISTS active_jobs CASCADE;
DROP VIEW IF EXISTS job_summary CASCADE;
DROP TABLE IF EXISTS dead_letter_jobs CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;

-- Cleanup functions
DROP FUNCTION IF EXISTS update_job_stats() CASCADE;
DROP FUNCTION IF EXISTS create_job_audit() CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_jobs() CASCADE;
DROP FUNCTION IF EXISTS move_to_dead_letter() CASCADE;
DROP FUNCTION IF EXISTS reconcile_dead_letter_jobs() CASCADE;

CREATE TABLE jobs (
  id UUID PRIMARY KEY, -- Assigned by application (uuidv4)
  tenant_id VARCHAR(255) NOT NULL DEFAULT 'default',
  user_id INTEGER NOT NULL,
  type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  priority INTEGER DEFAULT 0,
  queue_name VARCHAR(100) DEFAULT 'default',
  
  -- Data
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  error_details JSONB,
  
  -- Retries
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  retry_delay_ms INTEGER DEFAULT 1000,
  
  -- Timing
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Worker info
  worker_id VARCHAR(255),
  processing_time_ms INTEGER,
  
  -- Meta
  metadata JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}'
);

CREATE INDEX idx_jobs_tenant_status ON jobs(tenant_id, status);
CREATE INDEX idx_jobs_processing ON jobs(status) WHERE status = 'processing';
CREATE INDEX idx_jobs_user ON jobs(user_id);

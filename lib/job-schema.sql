-- Enterprise Job Pipeline Schema
-- Version: 1.0.0
-- Date: 2026-02-02T02:35:00+03:00

-- Create jobs table with enterprise features
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(50) NOT NULL,
  user_id INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  priority INTEGER DEFAULT 0,
  input_data JSONB NOT NULL,
  output_data JSONB,
  error_message TEXT,
  error_details JSONB,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  retry_delay_ms INTEGER DEFAULT 1000,
  visibility_timeout_ms INTEGER DEFAULT 30000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  worker_id VARCHAR(100),
  queue_name VARCHAR(100) DEFAULT 'default',
  metadata JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying', 'dead_letter', 'archived')),
  CONSTRAINT valid_priority CHECK (priority >= 0 AND priority <= 100)
);

-- Create indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_id ON jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_queue_status ON jobs(queue_name, status);
CREATE INDEX IF NOT EXISTS idx_jobs_worker_id ON jobs(worker_id);
CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status ON jobs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_queue_priority_status ON jobs(queue_name, priority DESC, status);

-- Create dead letter jobs table
CREATE TABLE IF NOT EXISTS dead_letter_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id UUID NOT NULL,
  tenant_id VARCHAR(50) NOT NULL,
  user_id INTEGER NOT NULL,
  job_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  input_data JSONB NOT NULL,
  error_message TEXT,
  error_details JSONB,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 0,
  failed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  original_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  worker_id VARCHAR(100),
  queue_name VARCHAR(100) DEFAULT 'default',
  metadata JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  CONSTRAINT dl_valid_status CHECK (status IN ('failed', 'timeout', 'max_retries', 'system_error', 'validation_error'))
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_tenant_id ON dead_letter_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_failed_at ON dead_letter_jobs(failed_at);
CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_job_type ON dead_letter_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_original_job_id ON dead_letter_jobs(original_job_id);

-- Create job_stats table for analytics
CREATE TABLE IF NOT EXISTS job_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(50) NOT NULL,
  user_id INTEGER NOT NULL,
  date DATE NOT NULL,
  job_type VARCHAR(50) NOT NULL,
  total_jobs INTEGER DEFAULT 0,
  completed_jobs INTEGER DEFAULT 0,
  failed_jobs INTEGER DEFAULT 0,
  dead_letter_jobs INTEGER DEFAULT 0,
  avg_processing_time_ms INTEGER DEFAULT 0,
  total_processing_time_ms BIGINT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, user_id, date, job_type)
);

CREATE INDEX IF NOT EXISTS idx_job_stats_tenant_user_date_type ON job_stats(tenant_id, user_id, date, job_type);

-- Create job_audit table for audit trail
CREATE TABLE IF NOT EXISTS job_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  tenant_id VARCHAR(50) NOT NULL,
  user_id INTEGER NOT NULL,
  action VARCHAR(20) NOT NULL, -- 'CREATE', 'START', 'COMPLETE', 'FAIL', 'RETRY', 'DEAD_LETTER'
  old_status VARCHAR(20),
  new_status VARCHAR(20),
  changes JSONB,
  error_message TEXT,
  error_details JSONB,
  processing_time_ms INTEGER,
  worker_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_audit_job_id ON job_audit(job_id);
CREATE INDEX IF NOT EXISTS idx_job_audit_tenant_id ON job_audit(tenant_id);
CREATE IF NOT EXISTS idx_job_audit_user_id ON job_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_job_audit_created_at ON job_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_job_audit_action ON job_audit(action);

-- Create function to update job stats
CREATE OR REPLACE FUNCTION update_job_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO job_stats (tenant_id, user_id, date, job_type, total_jobs, completed_jobs, failed_jobs, dead_letter_jobs, avg_processing_time_ms, total_processing_time_ms)
  VALUES (
    NEW.tenant_id,
    NEW.user_id,
    CURRENT_DATE,
    NEW.type,
    1,
    CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'dead_letter' THEN 1 ELSE 0 END,
    COALESCE(NEW.processing_time_ms, 0),
    COALESCE(NEW.processing_time_ms, 0)
  )
  ON CONFLICT (tenant_id, user_id, date, job_type)
  DO UPDATE SET
    total_jobs = job_stats.total_jobs + 1,
    completed_jobs = job_stats.completed_jobs + CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
    failed_jobs = job_stats.failed_jobs + CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
    dead_letter_jobs = job_stats.dead_letter_jobs + CASE WHEN NEW.status = 'dead_letter' THEN 1 ELSE 0 END,
    avg_processing_time_ms = CASE 
      WHEN NEW.status IN ('completed', 'failed', 'dead_letter') THEN 
        (job_stats.total_processing_time_ms + COALESCE(NEW.processing_time_ms, 0)) / (job_stats.total_jobs + 1)
      ELSE job_stats.avg_processing_time_ms
    END,
    total_processing_time_ms = job_stats.total_processing_time_ms + COALESCE(NEW.processing_time_ms, 0)
  WHERE job_stats.tenant_id = NEW.tenant_id 
    AND job_stats.user_id = NEW.user_id 
    AND job_stats.date = CURRENT_DATE 
    AND job_stats.job_type = NEW.type;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for job stats
CREATE TRIGGER trigger_update_job_stats
  AFTER INSERT OR UPDATE ON jobs
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'failed', 'dead_letter') OR OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION update_job_stats();

-- Create function for audit trail
CREATE OR REPLACE FUNCTION create_job_audit()
RETURNS TRIGGER AS $$
DECLARE
  action_type TEXT;
  changes_data JSONB;
  processing_time INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_type := 'CREATE';
    changes_data := jsonb_build_object(
      'job_type', NEW.type,
      'priority', NEW.priority,
      'queue_name', NEW.queue_name,
      'retry_count', NEW.retry_count
    );
    
    INSERT INTO job_audit (job_id, tenant_id, user_id, action, new_status, changes)
    VALUES (NEW.id, NEW.tenant_id, NEW.user_id, action_type, NEW.status, changes_data);
    
  ELSIF TG_OP = 'UPDATE' THEN
    action_type := CASE
      WHEN OLD.status = 'pending' AND NEW.status = 'processing' THEN 'START'
      WHEN NEW.status = 'completed' THEN 'COMPLETE'
      WHEN NEW.status = 'failed' THEN 'FAIL'
      WHEN NEW.status = 'retrying' THEN 'RETRY'
      WHEN NEW.status = 'dead_letter' THEN 'DEAD_LETTER'
      ELSE 'UPDATE'
    END;
    
    changes_data := jsonb_build_object(
      'status_changed', OLD.status IS DISTINCT FROM NEW.status,
      'retry_count_changed', OLD.retry_count IS DISTINCT FROM NEW.retry_count,
      'error_message_changed', OLD.error_message IS DISTINCT FROM NEW.error_message,
      'processing_time_ms', NEW.processing_time_ms
    );
    
    processing_time := COALESCE(NEW.processing_time_ms, 0);
    
    INSERT INTO job_audit (job_id, tenant_id, user_id, action, old_status, new_status, changes, error_message, error_details, processing_time_ms, worker_id)
    VALUES (NEW.id, NEW.tenant_id, NEW.user_id, action_type, OLD.status, NEW.status, changes_data, NEW.error_message, NEW.error_details, processing_time, NEW.worker_id);
    
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for audit trail
CREATE TRIGGER trigger_job_audit
  AFTER INSERT OR UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION create_job_audit();

-- Create view for active jobs
CREATE OR REPLACE VIEW active_jobs AS
SELECT 
  id,
  tenant_id,
  user_id,
  type,
  status,
  priority,
  input_data,
  output_data,
  error_message,
  retry_count,
  max_retries,
  retry_delay_ms,
  visibility_timeout_ms,
  created_at,
  updated_at,
  started_at,
  completed_at,
  expires_at,
  worker_id,
  queue_name,
  metadata,
  tags
FROM jobs
WHERE status IN ('pending', 'processing', 'retrying')
  AND (expires_at IS NULL OR expires_at > NOW());

-- Create view for job statistics
CREATE OR REPLACE VIEW job_summary AS
SELECT 
  tenant_id,
  user_id,
  type,
  COUNT(*) as total_jobs,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
  COUNT(CASE WHEN status = 'dead_letter' THEN 1 END) as dead_letter_jobs,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_jobs,
  COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_jobs,
  COUNT(CASE WHEN status = 'retrying' THEN 1 END) as retrying_jobs,
  AVG(CASE WHEN status IN ('completed', 'failed', 'dead_letter') THEN processing_time_ms END) as avg_processing_time_ms,
  MAX(created_at) as latest_job,
  MIN(created_at) as oldest_job
FROM jobs
GROUP BY tenant_id, user_id, type;

-- Create function for cleanup of expired jobs
CREATE OR REPLACE FUNCTION cleanup_expired_jobs()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE jobs 
  SET status = 'archived', updated_at = NOW()
  WHERE status IN ('pending', 'failed', 'retrying')
    AND expires_at IS NOT NULL 
    AND expires_at <= NOW();
    
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Create function for moving jobs to dead letter
CREATE OR REPLACE FUNCTION move_to_dead_letter(job_id UUID, error_message TEXT, error_details JSONB DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  job_record RECORD;
BEGIN
  SELECT * INTO job_record FROM jobs WHERE id = job_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Insert into dead letter table
  INSERT INTO dead_letter_jobs (
    original_job_id,
    tenant_id,
    user_id,
    job_type,
    status,
    input_data,
    error_message,
    error_details,
    retry_count,
    max_retries,
    failed_at,
    original_created_at,
    worker_id,
    queue_name,
    metadata,
    tags
  ) VALUES (
    job_record.id,
    job_record.tenant_id,
    job_record.user_id,
    job_record.type,
    job_record.status,
    job_record.input_data,
    error_message,
    error_details,
    job_record.retry_count,
    job_record.max_retries,
    job_record.failed_at,
    job_record.created_at,
    job_record.worker_id,
    job_record.queue_name,
    job_record.metadata,
    job_record.tags
  );
  
  -- Update original job status
  UPDATE jobs 
  SET status = 'dead_letter', updated_at = NOW()
  WHERE id = job_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Create function for reconciling dead letter jobs
CREATE OR REPLACE FUNCTION reconcile_dead_letter_jobs(max_age_days INTEGER DEFAULT 7, batch_size INTEGER DEFAULT 100, dry_run BOOLEAN DEFAULT TRUE)
RETURNS INTEGER AS $$
DECLARE
  reconciled_count INTEGER := 0;
  job_record RECORD;
  cursor_name CURSOR FOR 
    SELECT * FROM dead_letter_jobs 
    WHERE failed_at < NOW() - INTERVAL '1 day' * max_age_days
    LIMIT batch_size;
BEGIN
  IF dry_run THEN
    SELECT COUNT(*) INTO reconciled_count FROM dead_letter_jobs 
    WHERE failed_at < NOW() - INTERVAL '1 day' * max_age_days;
    RETURN reconciled_count;
  END IF;
  
  OPEN cursor_name;
  LOOP
    FETCH cursor_name INTO job_record;
    EXIT WHEN NOT FOUND;
    
    -- Re-queue the job
    UPDATE jobs 
    SET 
      status = 'pending',
      retry_count = 0,
      updated_at = NOW(),
      started_at = NULL,
      completed_at = NULL,
      worker_id = NULL,
      error_message = NULL,
      error_details = NULL
    WHERE id = job_record.original_job_id;
    
    -- Remove from dead letter
    DELETE FROM dead_letter_jobs WHERE id = job_record.id;
    
    reconciled_count := reconciled_count + 1;
  END LOOP;
  CLOSE cursor_name;
  
  RETURN reconciled_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON jobs TO api_user;
-- GRANT SELECT ON dead_letter_jobs TO api_user;
-- GRANT SELECT ON job_stats TO api_user;
-- GRANT SELECT ON job_audit TO api_user;
-- GRANT SELECT ON active_jobs TO api_user;
-- GRANT SELECT ON job_summary TO api_user;
-- GRANT EXECUTE ON FUNCTION cleanup_expired_jobs TO api_user;
-- GRANT EXECUTE ON FUNCTION move_to_dead_letter TO api_user;
-- GRANT EXECUTE ON FUNCTION reconcile_dead_letter_jobs TO api_user;

-- Migration: Add job queue integration to render_jobs table
-- This migration adds support for the enhanced job queue system

-- Add queue_job_id column to render_jobs table
ALTER TABLE render_jobs 
ADD COLUMN queue_job_id VARCHAR(255);

-- Add index for queue_job_id for faster lookups
CREATE INDEX idx_render_jobs_queue_job_id ON render_jobs(queue_job_id);

-- Add job_type column to track different types of jobs
ALTER TABLE render_jobs 
ADD COLUMN job_type VARCHAR(50) DEFAULT 'video-generation';

-- Add priority column to track job priority
ALTER TABLE render_jobs 
ADD COLUMN priority VARCHAR(10) DEFAULT 'normal';

-- Add user_subscription column to track user subscription level
ALTER TABLE render_jobs 
ADD COLUMN user_subscription VARCHAR(20) DEFAULT 'free';

-- Add job_dependencies column for job dependencies (JSON array)
ALTER TABLE render_jobs 
ADD COLUMN job_dependencies JSONB;

-- Add retry_count column to track retry attempts
ALTER TABLE render_jobs 
ADD COLUMN retry_count INTEGER DEFAULT 0;

-- Add max_retries column to track maximum retry attempts
ALTER TABLE render_jobs 
ADD COLUMN max_retries INTEGER DEFAULT 3;

-- Add estimated_duration column to track estimated job duration
ALTER TABLE render_jobs 
ADD COLUMN estimated_duration INTEGER; -- in seconds

-- Add actual_duration column to track actual job duration
ALTER TABLE render_jobs 
ADD COLUMN actual_duration INTEGER; -- in seconds

-- Add worker_id column to track which worker processed the job
ALTER TABLE render_jobs 
ADD COLUMN worker_id VARCHAR(255);

-- Add error_details column to store detailed error information
ALTER TABLE render_jobs 
ADD COLUMN error_details JSONB;

-- Add metadata column for additional job metadata
ALTER TABLE render_jobs 
ADD COLUMN metadata JSONB;

-- Create indexes for new columns
CREATE INDEX idx_render_jobs_job_type ON render_jobs(job_type);
CREATE INDEX idx_render_jobs_priority ON render_jobs(priority);
CREATE INDEX idx_render_jobs_user_subscription ON render_jobs(user_subscription);
CREATE INDEX idx_render_jobs_status_priority ON render_jobs(status, priority);
CREATE INDEX idx_render_jobs_created_at_priority ON render_jobs(created_at, priority);

-- Create job_history table for audit logs
CREATE TABLE job_history (
  id SERIAL PRIMARY KEY,
  job_id VARCHAR(255) NOT NULL,
  job_type VARCHAR(50) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(255),
  status VARCHAR(50) NOT NULL,
  previous_status VARCHAR(50),
  progress INTEGER DEFAULT 0,
  message TEXT,
  error_details JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for job_history table
CREATE INDEX idx_job_history_job_id ON job_history(job_id);
CREATE INDEX idx_job_history_user_id ON job_history(user_id);
CREATE INDEX idx_job_history_project_id ON job_history(project_id);
CREATE INDEX idx_job_history_status ON job_history(status);
CREATE INDEX idx_job_history_created_at ON job_history(created_at);

-- Create job_dependencies table for managing job dependencies
CREATE TABLE job_dependencies (
  id SERIAL PRIMARY KEY,
  job_id VARCHAR(255) NOT NULL,
  depends_on_job_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, depends_on_job_id)
);

-- Create indexes for job_dependencies table
CREATE INDEX idx_job_dependencies_job_id ON job_dependencies(job_id);
CREATE INDEX idx_job_dependencies_depends_on ON job_dependencies(depends_on_job_id);

-- Create recurring_jobs table for managing recurring jobs
CREATE TABLE recurring_jobs (
  id VARCHAR(255) PRIMARY KEY,
  job_type VARCHAR(50) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(255),
  data JSONB NOT NULL,
  cron_expression VARCHAR(100) NOT NULL,
  options JSONB,
  status VARCHAR(50) DEFAULT 'active',
  last_run TIMESTAMP,
  next_run TIMESTAMP,
  run_count INTEGER DEFAULT 0,
  max_runs INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for recurring_jobs table
CREATE INDEX idx_recurring_jobs_user_id ON recurring_jobs(user_id);
CREATE INDEX idx_recurring_jobs_project_id ON recurring_jobs(project_id);
CREATE INDEX idx_recurring_jobs_status ON recurring_jobs(status);
CREATE INDEX idx_recurring_jobs_next_run ON recurring_jobs(next_run);

-- Create job_performance_metrics table for tracking performance
CREATE TABLE job_performance_metrics (
  id SERIAL PRIMARY KEY,
  job_type VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  total_jobs INTEGER DEFAULT 0,
  completed_jobs INTEGER DEFAULT 0,
  failed_jobs INTEGER DEFAULT 0,
  avg_duration INTEGER DEFAULT 0, -- in seconds
  min_duration INTEGER DEFAULT 0, -- in seconds
  max_duration INTEGER DEFAULT 0, -- in seconds
  total_duration INTEGER DEFAULT 0, -- in seconds
  error_rate DECIMAL(5,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_type, date)
);

-- Create indexes for job_performance_metrics table
CREATE INDEX idx_job_performance_metrics_job_type ON job_performance_metrics(job_type);
CREATE INDEX idx_job_performance_metrics_date ON job_performance_metrics(date);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at columns
CREATE TRIGGER update_job_history_updated_at 
    BEFORE UPDATE ON job_history 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recurring_jobs_updated_at 
    BEFORE UPDATE ON recurring_jobs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_performance_metrics_updated_at 
    BEFORE UPDATE ON job_performance_metrics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments to explain new columns
COMMENT ON COLUMN render_jobs.queue_job_id IS 'Reference to the job queue system job ID';
COMMENT ON COLUMN render_jobs.job_type IS 'Type of job (video-generation, script-generation, etc.)';
COMMENT ON COLUMN render_jobs.priority IS 'Job priority (high, normal, low)';
COMMENT ON COLUMN render_jobs.user_subscription IS 'User subscription level when job was created';
COMMENT ON COLUMN render_jobs.job_dependencies IS 'JSON array of job IDs this job depends on';
COMMENT ON COLUMN render_jobs.retry_count IS 'Number of times this job has been retried';
COMMENT ON COLUMN render_jobs.max_retries IS 'Maximum number of retry attempts allowed';
COMMENT ON COLUMN render_jobs.estimated_duration IS 'Estimated job duration in seconds';
COMMENT ON COLUMN render_jobs.actual_duration IS 'Actual job duration in seconds';
COMMENT ON COLUMN render_jobs.worker_id IS 'ID of the worker that processed this job';
COMMENT ON COLUMN render_jobs.error_details IS 'Detailed error information in JSON format';
COMMENT ON COLUMN render_jobs.metadata IS 'Additional job metadata in JSON format';

-- Add comments to new tables
COMMENT ON TABLE job_history IS 'Audit log of all job status changes';
COMMENT ON TABLE job_dependencies IS 'Table to manage job dependencies';
COMMENT ON TABLE recurring_jobs IS 'Table to manage recurring/scheduled jobs';
COMMENT ON TABLE job_performance_metrics IS 'Table to track job performance metrics over time';
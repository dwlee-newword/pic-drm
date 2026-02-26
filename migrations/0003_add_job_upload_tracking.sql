-- Migration: 0003_add_job_upload_tracking
-- Adds upload tracking columns to support resumable multi-file uploads.
-- Existing rows default to 0/0 (total/uploaded) and 'pending' status — no data migration needed.

ALTER TABLE jobs ADD COLUMN total_files INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN uploaded_files INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_files ADD COLUMN upload_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE job_files ADD COLUMN file_index INTEGER;

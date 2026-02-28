-- Migration: 0002_create_jobs
-- Creates jobs, job_files, and job_recipients tables for the DRM job workflow.

CREATE TABLE IF NOT EXISTS jobs (
  id              TEXT    PRIMARY KEY,
  user_email      TEXT    NOT NULL REFERENCES users(email),
  security_text   TEXT    NOT NULL DEFAULT '',
  anti_screenshot INTEGER NOT NULL DEFAULT 0,
  anti_copy       INTEGER NOT NULL DEFAULT 0,
  view_limit      INTEGER NOT NULL DEFAULT 0,
  domain_restrict INTEGER NOT NULL DEFAULT 0,
  expiration      INTEGER NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'pending',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        TEXT    NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  original_name TEXT    NOT NULL,
  folder_name   TEXT    NOT NULL DEFAULT '',
  storage_key   TEXT    NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_recipients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id     TEXT    NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  email      TEXT    NOT NULL,
  source     TEXT    NOT NULL DEFAULT 'direct',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

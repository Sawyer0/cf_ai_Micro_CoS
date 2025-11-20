-- Migration: 004_create_event_log_table
-- Description: Creates the event_log table for idempotent event handling
-- Version: 1.0.0

CREATE TABLE IF NOT EXISTS event_log (
    event_id TEXT PRIMARY KEY NOT NULL,
    event_type TEXT NOT NULL,
    processed_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

-- Index for cleanup queries (finding expired events)
CREATE INDEX IF NOT EXISTS idx_event_log_expires 
    ON event_log(expires_at ASC);

CREATE INDEX IF NOT EXISTS idx_event_log_type 
    ON event_log(event_type);

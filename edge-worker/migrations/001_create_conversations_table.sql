-- Migration: 001_create_conversations_table
-- Description: Creates the conversations table for storing chat conversations
-- Version: 1.0.0

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active', 'archived', 'deleted')),
    principal_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_conversations_principal 
    ON conversations(principal_id);

CREATE INDEX IF NOT EXISTS idx_conversations_status 
    ON conversations(status);

CREATE INDEX IF NOT EXISTS idx_conversations_updated 
    ON conversations(updated_at DESC);

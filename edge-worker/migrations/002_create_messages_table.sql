-- Migration: 002_create_messages_table
-- Description: Creates the messages table for storing conversation messages
-- Version: 1.0.0

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_messages_conversation 
    ON messages(conversation_id, timestamp ASC);

CREATE INDEX IF NOT EXISTS idx_messages_timestamp 
    ON messages(timestamp DESC);

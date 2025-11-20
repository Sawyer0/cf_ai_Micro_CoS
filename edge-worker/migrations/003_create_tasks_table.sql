-- Migration: 003_create_tasks_table
-- Description: Creates the tasks table for task management
-- Version: 1.0.0

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
    due_date TEXT,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_tasks_user 
    ON tasks(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_status 
    ON tasks(status);

CREATE INDEX IF NOT EXISTS idx_tasks_due_date 
    ON tasks(due_date ASC) WHERE due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_overdue 
    ON tasks(user_id, due_date ASC) 
    WHERE status != 'completed' AND due_date IS NOT NULL;

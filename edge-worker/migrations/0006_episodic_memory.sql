-- ============================================================================
-- EPISODIC MEMORY: Past conversations and travel history
-- Migration: 0006_episodic_memory.sql
-- ============================================================================

-- Conversation summaries: Condensed past conversations
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  key_entities TEXT, -- JSON: {airports: ['JFK', 'LAX'], dates: ['2025-11-28'], people: ['John']}
  sentiment TEXT CHECK(sentiment IN ('positive', 'neutral', 'negative')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id)
);

CREATE INDEX idx_conversation_summaries_user 
  ON conversation_summaries(user_id, created_at DESC);

CREATE INDEX idx_conversation_summaries_conversation
  ON conversation_summaries(conversation_id);

-- Travel history: Past trips and bookings
CREATE TABLE IF NOT EXISTS travel_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  from_airport TEXT NOT NULL,
  to_airport TEXT NOT NULL,
  departure_date DATE,
  return_date DATE,
  airline TEXT,
  cost_usd REAL,
  cabin_class TEXT,
  booking_status TEXT CHECK(booking_status IN ('planned', 'booked', 'completed', 'cancelled')) DEFAULT 'planned',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id)
);

CREATE INDEX idx_travel_history_user 
  ON travel_history(user_id, departure_date DESC);

CREATE INDEX idx_travel_history_status
  ON travel_history(user_id, booking_status);

-- Task history: Past tasks and completions
CREATE TABLE IF NOT EXISTS task_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_description TEXT NOT NULL,
  task_category TEXT, -- 'work', 'personal', 'travel'
  status TEXT CHECK(status IN ('pending', 'completed', 'cancelled')) DEFAULT 'pending',
  due_date DATE,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id)
);

CREATE INDEX idx_task_history_user_status 
  ON task_history(user_id, status, created_at DESC);

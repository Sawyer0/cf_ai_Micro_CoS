-- ============================================================================
-- SEMANTIC MEMORY: User facts and preferences
-- Migration: 0002_semantic_memory.sql
-- ============================================================================

-- User profiles: Core user facts
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  home_airport TEXT,
  preferred_seat TEXT CHECK(preferred_seat IN ('window', 'aisle', 'middle')),
  budget_domestic_usd INTEGER,
  budget_international_usd INTEGER,
  notification_preferences TEXT, -- JSON string
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User preferences: Granular preferences by category
CREATE TABLE IF NOT EXISTS user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL, -- 'airline', 'hotel', 'travel', 'task'
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  confidence REAL DEFAULT 1.0, -- 0.0-1.0, higher = more confident
  source TEXT DEFAULT 'explicit', -- 'explicit' (user said) or 'inferred' (extracted)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id),
  UNIQUE(user_id, category, preference_key)
);

CREATE INDEX idx_user_preferences_user_category 
  ON user_preferences(user_id, category);

CREATE INDEX idx_user_preferences_confidence
  ON user_preferences(user_id, confidence DESC);

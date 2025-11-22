-- ============================================================================
-- PROCEDURAL MEMORY: Workflows and automation rules
-- Migration: 0007_procedural_memory.sql
-- ============================================================================

-- User workflows: Defined workflows and automation
CREATE TABLE IF NOT EXISTS user_workflows (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('manual', 'scheduled', 'event')),
  trigger_config TEXT, -- JSON: {event: 'flight_search', condition: {...}}
  actions TEXT NOT NULL, -- JSON: [{type: 'check_airline', params: {...}}]
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id)
);

CREATE INDEX idx_user_workflows_user_enabled 
  ON user_workflows(user_id, enabled);

-- Automation rules: Constraints and preferences
CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK(rule_type IN ('filter', 'prioritize', 'constraint', 'preference')),
  context TEXT NOT NULL, -- 'flight_search', 'task_management', 'calendar'
  condition TEXT NOT NULL, -- JSON: {field: 'airline', operator: 'in', value: ['Delta', 'United']}
  action TEXT NOT NULL, -- JSON: {type: 'prioritize', params: {boost: 10}}
  priority INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id)
);

CREATE INDEX idx_automation_rules_user_context 
  ON automation_rules(user_id, context, enabled);

CREATE INDEX idx_automation_rules_priority
  ON automation_rules(user_id, priority DESC);

-- Test data for semantic, episodic, and procedural memory
-- Run this via Cloudflare dashboard or wrangler d1 execute

-- 1. Create user profile
INSERT OR REPLACE INTO user_profiles (user_id, home_airport, preferred_seat, budget_domestic_usd)
VALUES ('test-user-123', 'PHL', 'window', 500);

-- 2. Add airline preference (semantic)
INSERT OR REPLACE INTO user_preferences (id, user_id, category, preference_key, preference_value, confidence, source)
VALUES ('pref-001', 'test-user-123', 'airline', 'preferred', 'Delta', 1.0, 'explicit');

-- 3. Add hotel preference (semantic)
INSERT OR REPLACE INTO user_preferences (id, user_id, category, preference_key, preference_value, confidence, source)
VALUES ('pref-002', 'test-user-123', 'hotel', 'preferred', 'Marriott', 0.8, 'inferred');

-- 4. Add past trip (episodic)
INSERT INTO travel_history (id, user_id, from_airport, to_airport, departure_date, airline, cost_usd, booking_status)
VALUES ('trip-001', 'test-user-123', 'PHL', 'LAX', '2025-11-15', 'Delta', 450, 'completed');

-- 5. Add another past trip
INSERT INTO travel_history (id, user_id, from_airport, to_airport, departure_date, airline, cost_usd, booking_status)
VALUES ('trip-002', 'test-user-123', 'PHL', 'MIA', '2025-10-20', 'American', 380, 'completed');

-- 6. Add pending task (episodic)
INSERT INTO task_history (id, user_id, task_description, task_category, status, due_date)
VALUES ('task-001', 'test-user-123', 'Book hotel for NYC trip', 'travel', 'pending', '2025-12-01');

-- 7. Add automation rule (procedural)
INSERT INTO automation_rules (id, user_id, rule_name, rule_type, context, condition, action, priority, enabled)
VALUES (
  'rule-001',
  'test-user-123',
  'Prefer Delta Airlines',
  'prioritize',
  'flight_search',
  '{"field":"airline","operator":"eq","value":"Delta"}',
  '{"type":"boost","params":{"score":10}}',
  10,
  1
);

-- Verify data
SELECT 'User Profiles:' as table_name;
SELECT * FROM user_profiles WHERE user_id = 'test-user-123';

SELECT 'User Preferences:' as table_name;
SELECT * FROM user_preferences WHERE user_id = 'test-user-123';

SELECT 'Travel History:' as table_name;
SELECT * FROM travel_history WHERE user_id = 'test-user-123';

SELECT 'Task History:' as table_name;
SELECT * FROM task_history WHERE user_id = 'test-user-123';

SELECT 'Automation Rules:' as table_name;
SELECT * FROM automation_rules WHERE user_id = 'test-user-123';

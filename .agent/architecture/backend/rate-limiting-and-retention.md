## RATE LIMITING & DATA RETENTION (MICRO CoS)

This document defines acceptable limits for API usage, LLM consumption, tool calls, and data retention policies.

---

# 1) RATE LIMITING

Rate limiting protects against abuse, controls costs, and ensures fair resource allocation.

## 1.1) Chat Messages

**Limit: 60 messages per user per minute**

* Allows normal conversation flow (1 message per second)
* Prevents spam/abuse
* Implemented at Worker level via sliding window counter in KV

```ts
// Pseudocode
const key = `rate:messages:${userId}`;
const count = await KV.get(key) || 0;

if (count >= 60) {
  return { status: 429, error: "Too many messages. Try again in a moment." };
}

await KV.put(key, count + 1, { expirationTtl: 60 });
```

**Rationale:**
- Typical user sends 5-10 messages per minute during active conversation
- 60/min allows bursts without being restrictive
- Resets every 60 seconds

---

## 1.2) LLM Token Budget

**Limit: 100,000 tokens per user per day**

* Approximately 20-30 full conversations (assuming 3,000-5,000 tokens per conversation)
* Covers typical daily usage for a professional
* Prevents runaway costs

### Token Accounting

```ts
interface TokenUsage {
  userId: string;
  date: string;  // YYYY-MM-DD
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: number;
}

// Store in D1 or KV with daily rollover
const key = `tokens:${userId}:${todayDate}`;
const usage = await KV.get(key) || { totalTokens: 0 };

if (usage.totalTokens + newTokens > 100_000) {
  return { status: 429, error: "Daily token limit reached. Try again tomorrow." };
}

usage.totalTokens += newTokens;
await KV.put(key, usage, { expirationTtl: 86400 }); // 24 hours
```

**Breakdown by use case:**
- **Chat response:** 500-2,000 tokens (prompt + completion)
- **Task extraction:** 200-500 tokens
- **Summary generation:** 1,000-3,000 tokens
- **Flight ranking:** 1,500-3,000 tokens

**Example daily budget allocation:**
- 10 chat conversations: 20,000 tokens
- 5 flight searches: 15,000 tokens
- 3 summaries: 9,000 tokens
- 2 task extractions: 1,000 tokens
- **Total: ~45,000 tokens** (well under 100k limit)

**Rationale:**
- Workers AI Llama 3.3 costs ~$0.50 per 1M tokens
- 100k tokens = ~$0.05 per user per day
- Sustainable for free tier or low-cost tier

---

## 1.3) Tool Calls (flights-MCP)

**Limit: 10 flight searches per user per day**

* Prevents abuse of external API
* Typical user searches 1-3 times per day
* Allows for refinement searches

```ts
const key = `tools:flights:${userId}:${todayDate}`;
const count = await KV.get(key) || 0;

if (count >= 10) {
  return { 
    status: 429, 
    error: "Daily flight search limit reached. Try again tomorrow." 
  };
}

await KV.put(key, count + 1, { expirationTtl: 86400 });
```

**Rationale:**
- flights-MCP may have rate limits or costs
- 10 searches/day is generous for typical usage
- Can be increased for premium users

---

## 1.4) Durable Object Write Rate

**Limit: 1,000 writes per user per day**

* Prevents DO storage bloat
* Typical conversation generates 50-100 writes per day (message + metadata)
* Allows for ~10 active conversations

**Why this matters:**
- Each message = 1 write (user message)
- Each LLM response = 1 write (assistant message)
- Each task creation = 1 write
- Each state update = 1 write
- 10 conversations × 10 messages each = 100 writes

**Monitoring:**
```ts
log.info("do_write_count", {
  user_id,
  writes_today: writeCount,
  limit: 1000,
  percentage: (writeCount / 1000) * 100
});
```

---

## 1.5) Realtime Message Rate

**Limit: 1,000 Realtime events per user per minute**

* Prevents WebSocket flooding
* Typical streaming response = 50-200 events (tokens)
* Allows for multiple concurrent streams

**Implemented at Realtime level** (Cloudflare handles this automatically).

---

## 1.6) Rate Limit Response

When a user hits a limit:

```json
{
  "status": 429,
  "error": "Rate limit exceeded",
  "limit_type": "messages_per_minute",
  "limit": 60,
  "current": 61,
  "reset_at": 1700000060,
  "retry_after": 45
}
```

**Client behavior:**
- Show user-friendly message: "You're sending messages too fast. Please wait a moment."
- Disable send button for `retry_after` seconds
- Implement exponential backoff for retries

---

# 2) DATA RETENTION

Data retention policies balance user privacy, compliance, and operational needs.

## 2.1) Chat History in Durable Object

**Retention: Last 100 messages (in-memory)**

* Keeps DO size bounded (~1-2 MB per user)
* Provides sufficient context for LLM (last 20 messages used)
* Older messages archived to D1

```ts
const MAX_MESSAGES_IN_MEMORY = 100;

if (state.messages.length > MAX_MESSAGES_IN_MEMORY) {
  const toArchive = state.messages.shift();
  await archiveToD1(toArchive);
}
```

**Rationale:**
- 100 messages ≈ 10-20 conversations
- Typical user doesn't need more than a week of history in memory
- Reduces DO storage costs

---

## 2.2) Archived Messages in D1

**Retention: 90 days**

* Complies with typical data retention policies
* Allows user export/search
* Balances storage costs with user needs

```ts
// Archive old messages daily
const thirtyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);

await D1.execute(
  `DELETE FROM message_archive 
   WHERE user_id = ? AND archived_at < ?`,
  [userId, thirtyDaysAgo]
);
```

**What's stored:**
```ts
interface ArchivedMessage {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  archived_at: number;
  tokens?: number;
}
```

**Rationale:**
- 90 days = ~3 months of history
- Complies with GDPR/privacy regulations
- Users can request export before deletion
- Reduces D1 storage costs

---

## 2.3) User Preferences & Memory

**Retention: Indefinite (until user deletes account)**

* Preferences are core to user experience
* Should persist across sessions
* Stored in Durable Object (primary) + D1 backup

```ts
interface UserMemory {
  userId: string;
  preferences: {
    timezone: string;
    workHours: { start: number; end: number };
    preferredAirlines: string[];
    notificationRules: Record<string, boolean>;
  };
  facts: string[];  // "prefers window seats", "allergic to peanuts"
  pinnedNotes: string[];
  createdAt: number;
  updatedAt: number;
}
```

**Backup strategy:**
- Primary: Durable Object (fast, always available)
- Backup: D1 (persistent, survives DO eviction)
- Sync: On every preference update, write to both

```ts
async function updatePreference(key: string, value: any) {
  // Update DO
  state.preferences[key] = value;
  
  // Backup to D1
  await D1.execute(
    `UPDATE user_memory SET preferences = ?, updated_at = ? WHERE user_id = ?`,
    [JSON.stringify(state.preferences), Date.now(), userId]
  );
}
```

**Rationale:**
- User preferences are valuable and should never be lost
- Indefinite retention is acceptable (user can delete)
- Dual storage ensures reliability

---

## 2.4) Task History

**Retention: 1 year (completed tasks)**

* Allows users to review past work
* Supports analytics and reporting
* Balances storage with user value

```ts
// Archive completed tasks older than 1 year
const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);

await D1.execute(
  `UPDATE tasks SET archived = true 
   WHERE user_id = ? AND status = 'completed' AND completed_at < ?`,
  [userId, oneYearAgo]
);
```

**Rationale:**
- Users may want to reference past tasks
- 1 year is a reasonable balance
- Completed tasks take minimal storage

---

## 2.5) Event Log (for replay/debugging)

**Retention: 30 days**

* Supports debugging and replay
* Prevents unbounded DO storage
* Older events can be archived to D1 if needed

```ts
const MAX_EVENT_LOG_SIZE = 1000;  // keep last 1000 events
const MAX_EVENT_AGE = 30 * 24 * 60 * 60 * 1000;  // 30 days

// Prune old events
state.event_log = state.event_log.filter(event => {
  const age = Date.now() - event.timestamp;
  return age < MAX_EVENT_AGE && state.event_log.length <= MAX_EVENT_LOG_SIZE;
});
```

**Rationale:**
- Event logs are for debugging, not long-term storage
- 30 days is sufficient for most issues
- Keeps DO size bounded

---

## 2.6) Structured Logs (Observability)

**Retention: 7 days (hot storage), 90 days (cold storage)**

* Hot storage: Recent logs for debugging (7 days)
* Cold storage: Archived logs for compliance (90 days)
* Implemented via log aggregation service (e.g., Logtail, BetterStack)

```ts
// Example log retention policy
{
  "hot_storage": {
    "retention_days": 7,
    "storage": "fast_index"
  },
  "cold_storage": {
    "retention_days": 90,
    "storage": "s3_archive"
  }
}
```

**Rationale:**
- Recent logs needed for debugging
- Older logs archived for compliance
- Reduces hot storage costs

---

# 3) COST IMPLICATIONS

## 3.1) Estimated Monthly Costs (per 1,000 active users)

### LLM Costs
- 100k tokens/user/day × 1,000 users = 100M tokens/day
- 100M tokens × 30 days = 3B tokens/month
- Llama 3.3: ~$0.50 per 1M tokens
- **LLM cost: ~$1,500/month**

### Durable Object Costs
- 1,000 users × 1,000 writes/day = 1M writes/day
- Cloudflare DO: $0.15 per 1M writes
- **DO cost: ~$4.50/month** (negligible)

### D1 Database Costs
- Message archival: ~100 messages × 500 bytes = 50KB per user
- 1,000 users × 50KB = 50GB total
- Cloudflare D1: $0.75 per GB/month
- **D1 cost: ~$37.50/month**

### Realtime Costs
- Assume 100 concurrent users, 1KB messages
- Cloudflare Realtime: $0.05 per GB
- ~100 users × 1KB × 60 messages/hour × 24 hours = ~144MB/day
- **Realtime cost: ~$2/month** (negligible)

### Total Estimated Cost
- **~$1,540/month for 1,000 active users**
- **~$1.54 per user per month**

---

## 3.2) Cost Optimization Strategies

1. **Reduce token budget** if costs are too high
   - Start with 50k tokens/day, increase based on usage
   
2. **Implement tiered limits**
   - Free tier: 10k tokens/day, 5 flight searches
   - Pro tier: 100k tokens/day, 50 flight searches
   
3. **Cache LLM responses**
   - Store summaries/rankings in DO to avoid re-computation
   
4. **Batch tool calls**
   - Group multiple flight searches into one API call
   
5. **Archive aggressively**
   - Move messages to D1 after 7 days instead of 100 messages

---

# 4) IMPLEMENTATION CHECKLIST

- [ ] Implement message rate limiting (60/min) in Worker
- [ ] Implement token budget tracking (100k/day) in KV
- [ ] Implement tool call rate limiting (10/day) in KV
- [ ] Add DO write monitoring and alerts
- [ ] Implement message archival to D1 (100 message threshold)
- [ ] Set up D1 retention policy (90 days)
- [ ] Implement user preference backup to D1
- [ ] Set up task archival (1 year)
- [ ] Configure event log pruning (30 days)
- [ ] Set up log aggregation with retention policies
- [ ] Add cost monitoring and alerts
- [ ] Document rate limits in API docs
- [ ] Add rate limit headers to responses

---

# 5) MONITORING & ALERTS

## Key Metrics to Track

```ts
// Rate limit violations
log.warn("rate_limit_exceeded", {
  user_id,
  limit_type: "messages_per_minute",
  limit: 60,
  current: 65,
  timestamp: Date.now()
});

// Token budget warnings
log.warn("token_budget_warning", {
  user_id,
  tokens_used: 85000,
  limit: 100000,
  percentage: 85,
  timestamp: Date.now()
});

// DO storage warnings
log.warn("do_storage_warning", {
  user_id,
  storage_bytes: 1800000,  // 1.8MB
  limit_bytes: 2000000,    // 2MB
  percentage: 90,
  timestamp: Date.now()
});
```

## Alert Thresholds

- **Rate limit violations:** Alert if >5 per hour per user
- **Token budget:** Alert if >80% of daily limit used
- **DO storage:** Alert if >90% of limit
- **D1 storage:** Alert if >80% of quota

---

# 6) USER COMMUNICATION

When users hit limits, provide clear, actionable messages:

```
Rate Limit: "You're sending messages too fast. Please wait 30 seconds before sending another message."

Token Budget: "You've used 85% of your daily token budget. You can still send a few more messages. Your budget resets tomorrow at midnight UTC."

Tool Limit: "You've used all 10 daily flight searches. Try refining your search or come back tomorrow."
```

---

# 7) FUTURE ENHANCEMENTS

- **Tiered pricing:** Different limits for free/pro/enterprise users
- **Usage analytics:** Dashboard showing user consumption
- **Predictive alerts:** Warn users before they hit limits
- **Burst allowance:** Allow temporary overages during peak times
- **Custom limits:** Enterprise users can request higher limits

---

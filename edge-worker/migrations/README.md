# D1 Database Migrations

This directory contains SQL migration files for the Cloudflare D1 database.

## Migration Files

Migrations are numbered sequentially and should be applied in order:

1. **001_create_conversations_table.sql** - Creates the conversations table for chat storage
2. **002_create_messages_table.sql** - Creates the messages table with foreign key to conversations
3. **003_create_tasks_table.sql** - Creates the tasks table for task management
4. **004_create_event_log_table.sql** - Creates the event_log table for idempotency

## Applying Migrations

### Local Development

```bash
# Apply all migrations to local D1 database
wrangler d1 execute DB --local --file=./migrations/001_create_conversations_table.sql
wrangler d1 execute DB --local --file=./migrations/002_create_messages_table.sql
wrangler d1 execute D B --local --file=./migrations/003_create_tasks_table.sql
wrangler d1 execute DB --local --file=./migrations/004_create_event_log_table.sql
```

### Production

```bash
# Apply migrations to production D1 database
wrangler d1 execute DB --file=./migrations/001_create_conversations_table.sql
wrangler d1 execute DB --file=./migrations/002_create_messages_table.sql
wrangler d1 execute DB --file=./migrations/003_create_tasks_table.sql
wrangler d1 execute DB --file=./migrations/004_create_event_log_table.sql
```

## Schema Overview

### conversations
- Stores chat conversation metadata
- Linked to principal (authenticated user)
- Supports active, archived, and deleted statuses

### messages
- Stores individual messages within conversations
- Foreign key relationship to conversations (CASCADE delete)
- Supports user, assistant, and system roles

### tasks
- Task management with status tracking
- Priority levels: low, medium, high, urgent
- Supports due dates and overdue queries

### event_log
- Idempotent event handling with TTL
- Prevents duplicate event processing
- Automatic cleanup based on expires_at field

## Indexes

All tables include optimized indexes for common query patterns:
- User/principal filtering
- Status filtering
- Timestamp-based sorting
- Overdue task queries

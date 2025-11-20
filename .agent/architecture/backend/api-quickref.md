# API Quick Reference

**Base URL:** `/api/`  
**Auth:** Cloudflare Access  
**Format:** JSON  
**Streaming:** SSE (Server-Sent Events)

---

## Endpoints

### Chat
- `POST /api/chat` - Send message, stream response
- `GET /api/chat/history` - Get chat history

### State
- `GET /api/state` - Get user state snapshot
- `PATCH /api/state/preferences` - Update preferences

### Tasks
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task
- `PATCH /api/tasks/{id}` - Update task
- `DELETE /api/tasks/{id}` - Delete task

### Tools
-POST /api/tools/search_flights` - Search flights
- `POST /api/tools/rank_flights` - Rank flights with LLM

### Memory
- `GET /api/memory` - Get memories
- `POST /api/memory/pin` - Pin memory

### Health
- `GET /api/health` - Health check

---

## Request Headers

```http
CF-Access-JWT-Assertion: <token>
X-Correlation-ID: <uuid>
Content-Type: application/json
```

---

## Rate Limits

| Resource | Limit |
|----------|-------|
| Messages | 60/minute |
| LLM tokens | 100k/day |
| Tool calls | 10/day |

---

## SSE Events

```typescript
{ type: "token", token: "..." }
{ type: "tool_call", name: "...", args: {...} }
{ type: "tool_result", result: {...} }
{ type: "done", message_id: "..." }
{ type: "error", error: {...} }
```

---

## Example: Send Chat Message

```bash
curl -X POST https://your-app.com/api/chat \
  -H "CF-Access-JWT-Assertion: <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Find flights to Paris"}
    ],
    "stream": true
  }'
```

---

## Error Codes

- `401` UNAUTHORIZED
- `403` FORBIDDEN
- `404` NOT_FOUND
- `400` VALIDATION_ERROR
- `429` RATE_LIMIT_EXCEEDED
- `500` LLM_ERROR / TOOL_ERROR / INTERNAL_ERROR

---

**Full docs:** [`api-specification.md`](./api-specification.md)

# Quick Start: assistant-ui Implementation

This is a summary guide for implementing assistant-ui with TanStack Start and Cloudflare Workers.

For **complete implementation details**, see `assistant-ui-integration.md`.

---

## Installation

```bash
npm install @assistant-ui/react @assistant-ui/react-ui zustand
```

---

## Minimal Setup

### 1. Create Custom Runtime

**File:** `src/lib/assistant/runtime.ts`

```typescript
"use client";
import { useLocalRuntime } from "@assistant-ui/react";

export function useCloudflareRuntime() {
  return useLocalRuntime({
    async onNew(messages) {
      const response = await fetch("/api/v1/chat", {
        method: "POST",
        body: JSON.stringify({ messages, stream: true }),
      });
      
      // Return streaming response to assistant-ui
      return response.body;
    },
  });
}
```

### 2. Chat Page Component

**File:** `src/app/routes/chat/page.tsx`

```typescript
"use client";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "@assistant-ui/react-ui";
import { useCloudflareRuntime } from "../../../lib/assistant/runtime";

export default function ChatPage() {
  const { runtime } = useCloudflareRuntime();

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

### 3. Workers Backend Endpoint

**File:** `src/workers/api.ts`

```typescript
export async function POST_chat(request: Request, env: Env) {
  const { messages } = await request.json();
  
  // Stream response from Workers AI
  const response = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages,
    stream: true,
  });

  // Forward stream to client
  return new Response(response, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
```

---

## What You Get Out of the Box

✅ **ChatGPT-like interface** with message list and input  
✅ **Streaming responses** with auto-scroll  
✅ **Markdown rendering** + code syntax highlighting  
✅ **Tool call rendering** (flights, calendar, tasks)  
✅ **Keyboard shortcuts** (Cmd+K, etc.)  
✅ **Accessibility** (ARIA labels, focus management)  
✅ **Responsive design** (mobile + desktop)

---

## Customization

### Custom Message Rendering

```typescript
<Thread
  components={{
    Message: CustomMessage, // Your component
  }}
/>
```

### Tool Call Rendering

```typescript
<ThreadMessage.ToolCalls>
  {(toolCall) => {
    if (toolCall.name === "search_flights") {
      return <FlightCard flights={toolCall.result} />;
    }
    return <DefaultToolCall />;
  }}
</ThreadMessage.ToolCalls>
```

### Theming

```typescript
<Thread
  appearance={{
    theme: "dark",
    primaryColor: "#3b82f6",
  }}
/>
```

---

## Integration with Existing Features

### Realtime Events

Sync Realtime events to chat:

```typescript
import { useThreadRuntime } from "@assistant-ui/react";

function useSyncRealtime() {
  const threadRuntime = useThreadRuntime();
  const realtime = useRealtime();

  useEffect(() => {
    realtime.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === "task.created") {
        threadRuntime.append({
          role: "assistant",
          content: `✅ Created task: "${data.task.title}"`,
        });
      }
    };
  }, [realtime, threadRuntime]);
}
```

### TanStack Query

Use together for non-chat features:

```typescript
// Chat is handled by assistant-ui
<Thread />

// Tasks/planner use TanStack Query
const { data: tasks } = useQuery({
  queryKey: ["tasks"],
  queryFn: fetchTasks,
});
```

---

## File Structure

```
src/
  app/
    routes/
      chat/
        page.tsx                # Main chat page with <Thread />
  components/
    chat/
      CustomMessage.tsx         # Custom message rendering
      FlightCard.tsx            # Flight tool call renderer
      TaskCard.tsx              # Task tool call renderer
  lib/
    assistant/
      runtime.ts                # useCloudflareRuntime hook
      adapters.ts               # Stream adapters
```

---

## Key Differences from OpenCore-UI

| OpenCore-UI | assistant-ui |
|-------------|--------------|
| Complete application | Component library |
| Rust/Python backend | Bring your own backend |
| Fork + modify | `npm install` |
| Heavyweight | Lightweight (~50kb) |
| Svelte frontend | React components |

---

## Resources

- **Full Guide:** `.agent/architecture/frontend/assistant-ui-integration.md`
- **Docs:** https://www.assistant-ui.com/docs/
- **GitHub:** https://github.com/assistant-ui/assistant-ui
- **Examples:** https://www.assistant-ui.com/examples/

---

## Next Steps

1. ✅ Install dependencies
2. ✅ Create `useCloudflareRuntime` hook
3. ✅ Set up `/api/v1/chat` endpoint in Workers
4. ✅ Add `<Thread />` to chat page
5. ⬜ Customize message rendering for tool calls
6. ⬜ Integrate with Realtime for push updates
7. ⬜ Add theming and branding

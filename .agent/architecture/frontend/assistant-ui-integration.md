## ASSISTANT-UI INTEGRATION GUIDE (MICRO CoS)

**Library:** [assistant-ui](https://github.com/assistant-ui/assistant-ui)  
**Purpose:** ChatGPT-like UI components for React with custom backend integration  
**Stack:** TanStack Start + assistant-ui + Cloudflare Workers + Realtime

---

## **Why assistant-ui?**

assistant-ui is a **production-ready React library** for building AI chat interfaces. Unlike full applications (like Open WebUI), it's a **component library** that:

- ✅ **Works with custom backends** - designed specifically for this use case
- ✅ **Handles complexity** - streaming, auto-scroll, markdown, code highlighting, accessibility
- ✅ **Integrates with TanStack Start** - just React components, no framework lock-in
- ✅ **Production-proven** - 400k+ monthly downloads, used by LangChain, and others
- ✅ **Fully customizable** - composable primitives, not monolithic widgets
- ✅ **TypeScript-first** - strong type safety throughout

**Key difference from OpenCore-UI:** OpenCore-UI is a complete application (rewrite of Open WebUI in Rust). assistant-ui is a **library of reusable components** you install via npm and use in your own app.

---

## **1. Installation**

```bash
# Install assistant-ui and dependencies
npm install @assistant-ui/react @assistant-ui/react-ui

# Install peer dependencies
npm install zustand
```

**Package breakdown:**
- `@assistant-ui/react` - Core runtime and hooks
- `@assistant-ui/react-ui` - Pre-styled UI components (shadcn/ui-based)
- `zustand` - State management (peer dependency)

---

## **2. Project Structure**

Integrate assistant-ui into the existing TanStack Start structure:

```
src/
  app/
    routes/
      chat/
        page.tsx              # Main chat interface
  components/
    chat/
      ChatInterface.tsx       # assistant-ui wrapper
      CustomMessage.tsx       # Custom message rendering
      ToolCallRenderer.tsx    # Render tool calls (flights, calendar)
  lib/
    assistant/
      runtime.ts              # Custom runtime for CF Workers backend
      adapters.ts             # Streaming adapters
      types.ts                # TypeScript types
    api/
      chat.ts                 # Chat API client
```

---

## **3. Core Setup: Custom Runtime**

assistant-ui uses a **runtime** to manage chat state and backend communication. Create a custom runtime for Cloudflare Workers.

**File:** `src/lib/assistant/runtime.ts`

```typescript
"use client";

import { useLocalRuntime } from "@assistant-ui/react";
import { useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function useCloudflareRuntime() {
  const [isLoading, setIsLoading] = useState(false);

  const runtime = useLocalRuntime({
    // Handle new user messages
    async onNew(messages: ChatMessage[]) {
      setIsLoading(true);

      try {
        // Call your Cloudflare Workers endpoint
        const response = await fetch("/api/v1/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            stream: true, // Enable streaming
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Handle streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No response body");
        }

        // Stream tokens back to assistant-ui
        return {
          stream: async function* () {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              
              // Parse SSE format from Workers AI
              const lines = chunk.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const data = JSON.parse(line.slice(6));
                  
                  if (data.type === "token") {
                    yield { type: "text-delta", textDelta: data.token };
                  } else if (data.type === "tool_call") {
                    yield { type: "tool-call", toolCall: data.payload };
                  }
                }
              }
            }
          },
        };
      } finally {
        setIsLoading(false);
      }
    },

    // Handle tool calls (flights-MCP, calendar, etc.)
    async onToolCall(toolCall) {
      const { name, args } = toolCall;

      // Route to appropriate tool endpoint
      const response = await fetch(`/api/v1/tools/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });

      const result = await response.json();
      return result;
    },
  });

  return { runtime, isLoading };
}
```

**Key points:**
- Uses `useLocalRuntime` from assistant-ui for client-side state management
- `onNew` handles sending messages to your Cloudflare Workers endpoint
- Implements streaming via async generators (`function*`)
- `onToolCall` routes tool executions (flights-MCP, calendar) to your Workers endpoints

---

## **4. Chat Interface Component**

**File:** `src/components/chat/ChatInterface.tsx`

```typescript
"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "@assistant-ui/react-ui";
import { useCloudflareRuntime } from "../../lib/assistant/runtime";

export function ChatInterface() {
  const { runtime, isLoading } = useCloudflareRuntime();

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="h-screen flex flex-col">
        {/* Header */}
        <header className="border-b p-4">
          <h1 className="text-xl font-semibold">Micro Chief of Staff</h1>
          {isLoading && (
            <span className="text-sm text-muted-foreground">Processing...</span>
          )}
        </header>

        {/* Chat Thread - handles all chat UI automatically */}
        <div className="flex-1 overflow-hidden">
          <Thread />
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
```

**What `<Thread />` provides out of the box:**
- ✅ Message list with auto-scroll
- ✅ Message input with send button
- ✅ Streaming text rendering
- ✅ Markdown + code syntax highlighting
- ✅ Tool call rendering
- ✅ Retry/edit message functionality
- ✅ Keyboard shortcuts (Cmd+K, etc.)
- ✅ Accessibility (ARIA labels, focus management)

---

## **5. Custom Message Rendering**

To customize how messages appear (e.g., for flight suggestions, task cards):

**File:** `src/components/chat/CustomMessage.tsx`

```typescript
"use client";

import { ThreadMessage, ThreadMessageText } from "@assistant-ui/react-ui";
import { FlightCard } from "./FlightCard";
import { TaskCard } from "./TaskCard";

export function CustomMessage() {
  return (
    <ThreadMessage>
      {/* Default text rendering */}
      <ThreadMessageText />

      {/* Custom tool call rendering */}
      <ThreadMessage.ToolCalls>
        {(toolCall) => {
          // Render flight suggestions
          if (toolCall.name === "search_flights") {
            return <FlightCard flights={toolCall.result} />;
          }

          // Render task extraction
          if (toolCall.name === "extract_tasks") {
            return <TaskCard tasks={toolCall.result} />;
          }

          // Default tool call rendering
          return <ThreadMessage.ToolCall toolCall={toolCall} />;
        }}
      </ThreadMessage.ToolCalls>
    </ThreadMessage>
  );
}
```

**Usage in ChatInterface:**

```typescript
<Thread
  components={{
    Message: CustomMessage, // Use custom message renderer
  }}
/>
```

---

## **6. Backend Integration: Cloudflare Workers**

Your Workers endpoint must return streaming responses in a format assistant-ui understands.

**File:** `src/workers/api.ts` (example endpoint)

```typescript
// POST /api/v1/chat
export async function handleChat(request: Request, env: Env) {
  const { messages } = await request.json();
  const correlationId = generateUUID();

  // Create streaming response
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Send SSE events
  const sendEvent = (type: string, data: any) => {
    const event = `data: ${JSON.stringify({ type, ...data })}\n\n`;
    writer.write(encoder.encode(event));
  };

  // Start LLM streaming in background
  (async () => {
    try {
      // Get user context from Durable Object
      const userBrain = env.USER_BRAIN_DO.get(userId);
      const context = await userBrain.getContext();

      // Build prompt with memory
      const prompt = buildPromptWithMemory(messages, context);

      // Stream from Workers AI
      const response = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [{ role: "system", content: prompt }, ...messages],
        stream: true,
      });

      // Forward tokens to client
      for await (const chunk of response) {
        if (chunk.response) {
          sendEvent("token", { token: chunk.response });
        }
      }

      // Check for tool calls in final response
      const finalResponse = await extractToolCalls(messages);
      if (finalResponse.toolCalls) {
        for (const toolCall of finalResponse.toolCalls) {
          sendEvent("tool_call", { payload: toolCall });
        }
      }

      // Store in DO
      await userBrain.storeMessage({
        role: "assistant",
        content: finalResponse.content,
        correlationId,
      });

    } catch (error) {
      sendEvent("error", { message: error.message });
    } finally {
      writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

**SSE Event Format:**

```typescript
// Token streaming
data: {"type":"token","token":"Here"}
data: {"type":"token","token":" are"}
data: {"type":"token","token":" your"}

// Tool call
data: {"type":"tool_call","payload":{"name":"search_flights","args":{...}}}

// Error
data: {"type":"error","message":"Something went wrong"}
```

---

## **7. Integrating Realtime Updates**

Combine assistant-ui with Cloudflare Realtime for push notifications:

**File:** `src/lib/assistant/realtime-sync.ts`

```typescript
"use client";

import { useEffect } from "react";
import { useThreadRuntime } from "@assistant-ui/react";
import { useRealtime } from "../realtime/client";

export function useSyncRealtime() {
  const threadRuntime = useThreadRuntime();
  const realtime = useRealtime();

  useEffect(() => {
    if (!realtime) return;

    // Listen for backend events
    realtime.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // Task created from background processing
      if (data.type === "task.created") {
        // Append system message to chat
        threadRuntime.append({
          role: "assistant",
          content: `✅ Created task: "${data.task.title}"`,
        });
      }

      // Flight search completed
      if (data.type === "flights.searched") {
        threadRuntime.append({
          role: "assistant",
          content: "I found some flights for your trip:",
          toolCalls: [
            {
              name: "search_flights",
              result: data.flights,
            },
          ],
        });
      }
    };
  }, [realtime, threadRuntime]);
}
```

**Usage in ChatInterface:**

```typescript
export function ChatInterface() {
  const { runtime } = useCloudflareRuntime();
  useSyncRealtime(); // Sync Realtime events to chat

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

---

## **8. Styling & Theming**

assistant-ui uses **shadcn/ui** under the hood, so you can customize with CSS variables.

**File:** `src/app/globals.css`

```css
@layer base {
  :root {
    /* assistant-ui theme variables */
    --aui-primary: 220 90% 56%;
    --aui-background: 0 0% 100%;
    --aui-foreground: 222 47% 11%;
    --aui-muted: 210 40% 96%;
    --aui-border: 214 32% 91%;
    
    /* Custom Micro CoS colors */
    --brand-primary: 220 90% 56%;
    --brand-accent: 31 100% 50%;
  }

  .dark {
    --aui-background: 222 47% 11%;
    --aui-foreground: 210 40% 98%;
    --aui-muted: 217 33% 17%;
    --aui-border: 217 33% 17%;
  }
}

/* Custom message styling */
.aui-message-user {
  @apply bg-brand-primary text-white;
}

.aui-message-assistant {
  @apply bg-muted;
}
```

**Or use the built-in theme customizer:**

```typescript
import { Thread } from "@assistant-ui/react-ui";

<Thread
  appearance={{
    theme: "dark",
    primaryColor: "#3b82f6",
  }}
/>
```

---

## **9. Tool Call Rendering (Flights Example)**

**File:** `src/components/chat/FlightCard.tsx`

```typescript
interface Flight {
  id: string;
  airline: string;
  departure: { time: string; airport: string };
  arrival: { time: string; airport: string };
  price: number;
  stops: number;
}

export function FlightCard({ flights }: { flights: Flight[] }) {
  return (
    <div className="space-y-2 my-4">
      <h3 className="font-semibold">Flight Options</h3>
      {flights.map((flight) => (
        <div key={flight.id} className="border rounded-lg p-4 hover:bg-muted">
          <div className="flex justify-between">
            <div>
              <p className="font-medium">{flight.airline}</p>
              <p className="text-sm text-muted-foreground">
                {flight.departure.time} {flight.departure.airport} →{" "}
                {flight.arrival.time} {flight.arrival.airport}
              </p>
              <p className="text-xs">
                {flight.stops === 0 ? "Nonstop" : `${flight.stops} stop(s)`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold">${flight.price}</p>
              <button className="btn btn-primary btn-sm mt-2">Select</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## **10. Full Integration Flow**

### **User sends message:**

1. User types in `<Thread />` input → "Find me flights to Paris May 10-15"
2. assistant-ui calls `runtime.onNew(messages)`
3. `useCloudflareRuntime` sends POST to `/api/v1/chat`

### **Worker processes:**

4. Worker receives message → extracts intent with LLM
5. LLM detects tool call needed: `search_flights({ origin: "SFO", destination: "CDG", ... })`
6. Worker calls `runtime.onToolCall` → routes to `/api/v1/tools/search_flights`
7. flights-MCP returns results → LLM ranks → streams response

### **Frontend displays:**

8. Streaming tokens appear in chat: "Here are your flight options..."
9. Tool call result triggers `<FlightCard />` rendering
10. User sees flight cards inline in chat
11. Realtime updates trigger task creation: "✅ Saved trip to your calendar"

---

## **11. Advanced: Multi-Turn Conversations**

assistant-ui automatically handles conversation history:

```typescript
const runtime = useLocalRuntime({
  async onNew(messages) {
    // messages includes full conversation history
    console.log(messages);
    // [
    //   { role: "user", content: "Find flights to Paris" },
    //   { role: "assistant", content: "Here are some options..." },
    //   { role: "user", content: "Book the first one" }, // ← new message
    // ]

    // Your backend can use full context for follow-ups
    const response = await fetch("/api/v1/chat", {
      method: "POST",
      body: JSON.stringify({ messages }), // Full history
    });

    return response.body;
  },
});
```

**Worker side:**

```typescript
// Worker can reference previous messages
const lastMessage = messages[messages.length - 1];
const previousFlight = messages.find(m => 
  m.toolCalls?.some(tc => tc.name === "search_flights")
);

// "Book the first one" → Worker knows which flight from context
if (lastMessage.content.includes("book") && previousFlight) {
  const flightToBook = previousFlight.toolCalls[0].result[0];
  await createBookingTask(flightToBook);
}
```

---

## **12. Testing**

**Unit test custom runtime:**

```typescript
import { renderHook } from "@testing-library/react";
import { useCloudflareRuntime } from "./runtime";

test("sends message to Workers endpoint", async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      body: new ReadableStream(),
    })
  );

  const { result } = renderHook(() => useCloudflareRuntime());
  
  await result.current.runtime.append({
    role: "user",
    content: "Hello",
  });

  expect(fetch).toHaveBeenCalledWith("/api/v1/chat", {
    method: "POST",
    body: expect.any(String),
  });
});
```

---

## **13. Deployment Considerations**

- ✅ **Streaming support:** Ensure Cloudflare Workers streaming is enabled
- ✅ **Realtime WebSocket:** Deploy Realtime alongside Workers
- ✅ **Durable Objects:** Chat history persistence
- ✅ **CORS:** Configure if frontend/backend on different domains
- ✅ **Auth:** Add authentication to `/api/v1/chat` endpoint

---

## **14. Migration from OpenCore-UI Concept**

If you were considering OpenCore-UI (complete app), here's the mapping:

| OpenCore-UI (Full App) | assistant-ui (Components) |
|------------------------|---------------------------|
| Fork entire app | `npm install @assistant-ui/react` |
| Replace backend (Python → Workers) | Custom runtime (already Workers) |
| Modify Svelte frontend | Use with TanStack Start (React) |
| Heavy dependencies | Lightweight (~50kb gzipped) |
| Full authentication system | Bring your own auth |

---

## **Summary: assistant-ui in Micro CoS**

- **What:** React component library for AI chat UIs
- **How:** Custom runtime connects to Cloudflare Workers backend
- **Why:** Production-ready, customizable, works with TanStack Start
- **Integration:** Install via npm, configure runtime, use `<Thread />` component
- **Customization:** Override message rendering for tool calls (flights, tasks, etc.)
- **Realtime:** Combine with Cloudflare Realtime for push updates

**Result:** ChatGPT-like interface with your own Cloudflare backend, no forking required.

---

## **Resources**

- **Docs:** https://www.assistant-ui.com/docs/
- **GitHub:** https://github.com/assistant-ui/assistant-ui
- **Examples:** https://www.assistant-ui.com/examples/
- **Discord:** https://discord.com/invite/S9dwgCNEFs

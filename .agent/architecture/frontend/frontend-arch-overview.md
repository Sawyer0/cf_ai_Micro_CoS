## FRONTEND ARCHITECTURE OVERVIEW (MICRO CoS)

* **TanStack Start**
* **OpenCore-UI**
* **TanStack Query**
* **Cloudflare Realtime client**
* **Zod**
* **React (client + server components)**

This is built for a **mini monolith** with streaming chat, user memory, tasks, and daily planner UI.

It will have :

1. **Folder structure**
2. **Providers (QueryClient, RealtimeClient, Auth)**
3. **Client/server boundaries**
4. **Route architecture**
5. **Core hooks**
6. **How OpenCore-UI fits in**
7. **Flow across the entire UI**
---

# **1. Folder Structure**

```
src/
  app/
    layout.tsx
    providers.client.tsx
    providers.server.tsx
    routes/
      chat/
        page.tsx
      tasks/
        page.tsx
      planner/
        page.tsx
      settings/
        page.tsx
  components/
    chat/
      ChatContainer.tsx
      MessageList.tsx
      MessageInput.tsx
    tasks/
      TaskList.tsx
      TaskItem.tsx
    planner/
      PlannerCard.tsx
    ui/
      (OpenCore-UI wrappers)
  lib/
    api/
      client.ts
      queries.ts
      mutations.ts
    realtime/
      client.ts
      events.ts
    state/
      chat-store.ts
    schemas/
      message.ts
      task.ts
    utils/
      cn.ts
```

All business logic and state live in `lib/`.

---

# **2. Providers**

## **providers.server.tsx**

Things that must run server-side:

* create TanStack Query dehydrated state
* inject auth/session if needed

```tsx
export function ServerProviders({ children }) {
  return (
    <QueryClientProviderHydrate>
      {children}
    </QueryClientProviderHydrate>
  );
}
```

Minimal — nothing fancy.

---

## **providers.client.tsx**

This is the real power center.
It wraps the entire client app with:

* **TanStack QueryClientProvider**
* **RealtimeProvider**
* **AuthProvider (optional)**
* **OpenCore-UI ThemeProvider**

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RealtimeProvider } from "../lib/realtime/client";
import { ThemeProvider } from "opencore-ui";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
});

export function ClientProviders({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </RealtimeProvider>
    </QueryClientProvider>
  );
}
```

---

# **3. Realtime Client**

Stored in `lib/realtime/client.ts`.

Cloudflare Realtime works like a WebSocket channel with event listeners.

```tsx
"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

const RealtimeContext = createContext(null);

export function RealtimeProvider({ children }) {
  const [connection, setConnection] = useState(null);

  useEffect(() => {
    const conn = new WebSocket(CF_REALTIME_URL);

    conn.onopen = () => console.log("Realtime connected");
    conn.onclose = ().log("Realtime disconnected");

    setConnection(conn);

    return () => conn.close();
  }, []);

  return (
    <RealtimeContext.Provider value={connection}>
      {children}
    </RealtimeContext.Provider>
  );
}

export const useRealtime = () => useContext(RealtimeContext);
```

Extend this with custom event listeners later.

---

# **4. Route Architecture (TanStack Start)**

The app routes should be structured around the Micro CoS features.

## **/chat**

Real-time chat + Assistant responses.

## **/tasks**

Structured task list + inline editor.

## **/planner**

Daily plan UI (from Workflow).

## **/settings**

Preferences + pinned memory UI.

---

# **5. Core Hooks**

These are the frontend workhorses.

---

### **A. useChatStream()**

Located in `lib/state/chat-store.ts`.

Handles:

* sending messages
* receiving LLM tokens
* appending to OpenCore chat list

```tsx
"use client";

import { useRealtime } from "../realtime/client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

export function useChatStream() {
  const realtime = useRealtime();
  const [messages, setMessages] = useState([]);

  // Handle incoming token events
  useEffect(() => {
    if (!realtime) return;

    realtime.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "llm.token") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.token },
        ]);
      }
    };
  }, [realtime]);

  const sendMessage = useMutation({
    mutationFn: async ({ text }: { text: string }) => {
      await fetch("/api/v1/message", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
    },
  });

  return { messages, sendMessage };
}
```

---

### **B. useTasks()**

* Fetch tasks
* Mutate tasks
* Optimistic updates

```tsx
export const useTasks = () => {
  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => fetch("/api/v1/state").then((r) => r.json()),
  });

  const createTask = useMutation({
    mutationFn: (task) =>
      fetch("/api/v1/tasks", {
        method: "POST",
        body: JSON.stringify({ action: "create", task }),
      }),
    onSuccess: () => queryClient.invalidateQueries(["tasks"]),
  });

  return { ...tasksQuery, createTask };
};
```

---

### **C. usePlanner()**

```tsx
export const usePlanner = () => {
  return useQuery({
    queryKey: ["planner"],
    queryFn: () => fetch("/api/v1/plan").then((r) => r.json()),
  });
};
```

---

# **6. Integrating OpenCore-UI**

Inside `/chat/page.tsx`:

```tsx
import { ChatLayout, ChatInput, ChatMessages } from "opencore-ui";
import { useChatStream } from "../../lib/state/chat-store";

export default function ChatPage() {
  const { messages, sendMessage } = useChatStream();

  return (
    <ChatLayout
      messages={<ChatMessages messages={messages} />}
      input={
        <ChatInput
          onSubmit={(text) => sendMessage.mutate({ text })}
          isLoading={sendMessage.isPending}
        />
      }
    />
  );
}
```

OpenCore-UI is used only for UI, while all the brains live in the hooks + Cloudflare.

---

# **7. Full UI Flow**

### **1. User loads `/chat`**

TanStack Start loads page.
ClientProviders wrap everything.
Realtime connects.

### **2. User sends a message**

Button → `sendMessage.mutate()` → Worker receives → DO stores → Worker sends to Llama.

### **3. Worker streams LLM tokens**

Worker pushes tokens to Realtime.
`useChatStream()` updates messages in state.
OpenCore’s `<ChatMessages />` renders them.

### **4. Worker generates structured tasks or a plan**

Worker pushes `state.updated` or `task.created` event.
Frontend receives it → TanStack Query invalidates or updates.

### **5. UI updates**

Task list refreshes, planner cards refresh.

Everything stays tightly synchronized: realtime + http + query caching + DO persistence.

---


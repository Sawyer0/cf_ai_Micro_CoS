---
trigger:
  path_contains: frontend
---

# Frontend (TanStack Start + assistant-ui) Rules (@rules)

These rules apply to all code under `frontend/` (TanStack Start + assistant-ui).

@rules:

- **Architecture & responsibilities**

  - Treat the frontend as a thin client over the chat-first backend:
    - Use assistant-ui for chat UX and message rendering.
    - Use TanStack Start routing/data loading for pages.
  - Keep business logic on the backend; frontend focuses on presentation, interaction, and lightweight state.

- **Chat-first UX**

  - The primary entrypoint is the chat interface; other views (agenda, travel, settings) are secondary and should integrate back into chat workflows where possible.
  - Do not implement autonomous background behaviors in the UI (no surprise popups or flows without clear user intent).

- **assistant-ui usage**

  - Prefer assistant-ui primitives and patterns for chat threads, message lists, composer, and streaming updates.
  - Do not re-implement a custom chat window when assistant-ui already provides suitable components.
  - Keep assistant-ui configuration (themes, prompts, system messages) in dedicated config modules rather than scattering it across components.

- **Data fetching & state**

  - Use TanStack Start / TanStack Query for data fetching and caching.
  - Keep network calls in hooks or data modules (e.g., `useChat`, `useAgenda`) rather than directly inside deeply nested components.
  - Avoid global mutable singletons for state; prefer React context or TanStack Query caches.

- **Separation of concerns**

  - Prefer container/presenter split where appropriate:
    - Containers handle data fetching and orchestration.
    - Presentational components receive props and focus on layout/markup.
  - Keep components small and focused; if a component grows large or takes many props, consider splitting it.

- **Interaction with backend**

  - Use the documented HTTP API (`/api/chat`, etc.) and SSE/Realtime mechanisms; do not call MCP tools or Workers AI directly from the frontend.
  - Include correlation IDs / request IDs in client requests when provided by the backend/edge.

- **Styling & accessibility**

  - Follow accessible HTML practices (labels, roles, keyboard navigation), especially in chat input and results.
  - Prefer consistent design tokens/utility classes (or a single styling approach) over ad-hoc inline styles.

- **Testing & maintainability**
  - For complex UI flows (chat input/streaming, multi-step actions), add component or integration tests where feasible.
  - Avoid coupling UI tests directly to backend internals; mock HTTP/Realtime boundaries when necessary.

how---
trigger:
  path_contains: .agent/architecture/backend
---

# Backend Architecture Docs Rules (@rules)

These rules apply to all files under `.agent/architecture/backend`.

@rules:

- **Source of truth alignment**

  - Keep these docs consistent with `.agent/rules/application-overview.md` for:
    - Chat-first user-facing actions.
    - Background workers as warm-data sync only (no user-visible actions or heavy tool calls).
    - Cloudflare edge + Python FastAPI backend split.
  - Do not reintroduce older concepts like OpenCore-UI or TypeScript-only backend.

- **Terminology & components**

  - Use the agreed names for key components: `CalendarSyncWorker`, `CalendarEventStoreDO`, `TravelEvent`, `TravelWorkflowDO`, etc.
  - When describing flows, clarify whether a step is chat-triggered or background sync.

- **Level of detail**

  - Focus on architecture, flows, and contracts (events, APIs, state), not low-level implementation details.
  - Avoid turning these docs into pseudo-code; implementation specifics belong in the codebase.

- **Consistency with backend code**
  - When the backend FastAPI app evolves (new ports/services/endpoints), update these docs to reflect the new architecture, not vice versa.
  - Prefer describing behavior in terms of domain concepts and ports, rather than concrete frameworks or libraries.

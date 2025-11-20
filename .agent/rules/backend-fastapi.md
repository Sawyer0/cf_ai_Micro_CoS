---
trigger:
  path_contains: backend/app
---

# Backend FastAPI Rules (@rules)

These rules apply to all code under `backend/app`.

@rules:

- **Layering & dependencies**

  - Respect hexagonal architecture: `domain` → `application` → `api`/`infrastructure`.
  - `domain/` must not import FastAPI, httpx, or any infrastructure modules.
  - `application/` may depend on `domain` ports and value objects, but not on FastAPI or concrete adapters.
  - `api/` and `infrastructure/` may depend on `application/` and `domain/`, never the reverse.

- **Controllers (FastAPI routers)**

  - Keep routers thin: HTTP concerns only (routing, validation, serialization, error mapping).
  - Do not call MCP tools, Workers AI clients, or databases directly; always delegate to application services.
  - Prefer dependency injection via FastAPI dependencies for services and context; avoid global singletons.

- **Application services**

  - Implement use-cases by orchestrating domain ports; do not embed protocol details (SQL, HTTP, MCP specifics).
  - Keep services small and focused. If a service grows complex, split flows into additional small services or helpers.

- **Adapters (infrastructure)**

  - Implement a single port per module where possible (e.g., one repository or client per file).
  - Limit adapters to protocol/storage concerns: request/response building, SQL/queries, mapping to/from domain models.
  - Do not add business rules or cross-cutting orchestration inside adapters.

- **Chat-first & warm data**

  - When implementing chat-related flows, ensure controllers and services follow chat-first behavior: user-facing actions and heavy tool calls must be triggered by chat or explicit API calls.
  - Background sync integrations exposed to the backend (e.g., calendar state) should represent warm Durable Object state; do not implement autonomous background workflows inside the FastAPI app.

- **File size & style**
  - Prefer several focused modules over one large file. If a file accumulates unrelated responsibilities, factor it.
  - Use type hints and clear, descriptive names. Keep functions short and cohesive.

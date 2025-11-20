---
trigger:
  path_contains: backend/tests
---

# Backend Tests Rules (@rules)

These rules apply to all code under `backend/tests`.

@rules:

- **Test-first mindset**

  - When adding or changing behavior in `backend/app`, add or update tests in `backend/tests` in the same PR.
  - Prefer small, focused tests over large end-to-end suites.

- **Unit vs integration**

  - Place pure unit tests (domain models, application services) under `backend/tests/unit`.
  - Place cross-layer or IO-heavy tests (FastAPI routes, adapters) under `backend/tests/integration`.
  - Avoid hitting real external services (MCP servers, Workers AI, Cloudflare APIs) in tests; use fakes/mocks or local stubs instead.

- **Isolation & boundaries**

  - Unit tests must not depend on real HTTP servers, databases, or Cloudflare infrastructure.
  - Keep tests aligned with hexagonal boundaries: test domain logic without FastAPI, test application services via ports, and test adapters with controlled inputs/outputs.

- **Readability & naming**
  - Use descriptive test names that capture behavior (e.g., `test_chat_service_persists_message_and_calls_llm`).
  - Keep test functions short and explicit about setup, action, and assertions.

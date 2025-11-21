# Micro Chief of Staff - Edge Worker

The **Micro Chief of Staff (Micro CoS)** is an intelligent agent designed to help manage work, calendar, and travel. This repository contains the **Edge Worker** component, built on Cloudflare Workers using **TypeScript**, **Hexagonal Architecture**, and **Domain-Driven Design (DDD)**.

## 🏗️ Architecture

The application follows a strict **Hexagonal Architecture** (Ports and Adapters) to ensure separation of concerns and testability.

### Layers
1.  **Domain Layer** (`src/domain`): Pure business logic, entities, and value objects. No external dependencies.
    *   **Bounded Contexts**: `Chat`, `Task`, `Travel`, `Calendar`.
2.  **Application Layer** (`src/application`): Orchestrates use cases using domain objects and ports.
3.  **Adapters Layer** (`src/adapters`): Implementations of ports (e.g., D1 Database, Workers AI, Duffel API).
4.  **API Layer** (`src/api`): HTTP controllers, middleware, and routing.
5.  **Infrastructure** (`src/config`, `src/observability`): DI container, logging, and configuration.

### Key Components
*   **Durable Objects**: `ChatSessionDO` manages real-time chat state and WebSocket connections.
*   **D1 Database**: Stores conversations, tasks, and event logs.
*   **KV Namespace**: Handles idempotency and rate limiting.
*   **Workers AI**: Powers the LLM (Llama 3) for natural language understanding.

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+)
*   Cloudflare Wrangler CLI (`npm install -g wrangler`)
*   Cloudflare Account (for AI, D1, KV)

### Installation
```bash
npm install
```

### Local Development
```bash
npm run dev
```

### Testing
```bash
# Run unit tests
npm run test:unit

# Run all tests
npm test
```

## 🛠️ API Reference

### Chat
*   **POST** `/api/chat`
    *   Sends a message to the assistant.
    *   **Headers**: `X-Correlation-ID` (optional), `Idempotency-Key` (optional)
    *   **Body**: `{ "messages": [{ "role": "user", "content": "..." }], "stream": true }`
    *   **Response**: Server-Sent Events (SSE) stream or JSON.

### Tasks
*   **GET** `/api/tasks`
    *   List all tasks.
    *   **Query**: `limit` (default 50)
*   **POST** `/api/tasks`
    *   Create a new task.
    *   **Body**: `{ "title": "...", "description": "...", "priority": "high|medium|low", "dueDate": "ISO8601" }`
*   **PATCH** `/api/tasks/:id/:action`
    *   Update task status.
    *   **Actions**: `start`, `complete`

### System
*   **GET** `/api/health`
    *   Check system status and dependencies (DB, AI).

## 📦 Deployment

To deploy to Cloudflare Workers:

```bash
npm run deploy
```

## 🔒 Security
*   **Authentication**: Requires Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`).
*   **Rate Limiting**: Enforced per IP/User via KV.
*   **Idempotency**: Supported via `Idempotency-Key` header (24h TTL).

## 📂 Project Structure
```
src/
├── adapters/       # Infrastructure implementations (D1, AI, etc.)
├── api/            # HTTP routes and middleware
├── application/    # Use cases and services
├── config/         # DI container and settings
├── domain/         # Business logic (Entities, VOs, Ports)
├── durable-objects/# Stateful objects (ChatSession)
├── observability/  # Logging, Metrics, Tracing
└── index.ts        # Main entry point
```

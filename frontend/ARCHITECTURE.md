# Frontend Clean Architecture

This frontend follows **Hexagonal Architecture** (Ports & Adapters) with clear separation of concerns.

## Structure

```
frontend/src/
├── domain/                         # Business logic & entities (pure TypeScript)
│   ├── entities/
│   │   ├── Conversation.ts         # Conversation entity with business rules
│   │   ├── Message.ts              # Message entity
│   │   └── ThreadState.ts          # Thread state entity
│   └── ports/
│       ├── IConversationRepository.ts  # Repository interface
│       ├── IMessageRepository.ts       # Repository interface
│       ├── IChatService.ts             # Chat service interface
│       └── IStorageAdapter.ts          # Storage adapter interface
│
├── infrastructure/                 # Adapters & external integrations
│   ├── api/
│   │   └── CloudflareChatAdapter.ts    # HTTP client for /api/chat
│   ├── storage/
│   │   └── LocalStorageAdapter.ts      # localStorage implementation
│   └── repositories/
│       ├── ConversationRepository.ts   # Conversation persistence
│       └── MessageRepository.ts        # Message persistence
│
├── application/                    # Application services & state
│   ├── services/
│   │   └── ChatService.ts              # Orchestrates use-cases
│   ├── state/
│   │   └── useChatStore.ts             # Zustand store for UI state
│   └── hooks/
│       └── useChatService.ts           # Dependency injection hook
│
└── presentation/                   # UI components (to be refactored)
    └── (existing components)
```

## Layers

### 1. Domain Layer (Core Business Logic)
- **Entities**: Immutable business objects with behavior
- **Ports**: Interfaces that define contracts (dependency inversion)
- **No dependencies**: Pure TypeScript, no framework code

### 2. Infrastructure Layer (External Integrations)
- **Adapters**: Implement port interfaces
- **Repositories**: Handle data persistence
- **API Clients**: Handle external HTTP calls
- **Storage**: Wrap browser APIs (localStorage, etc.)

### 3. Application Layer (Use Cases)
- **Services**: Orchestrate domain entities and infrastructure
- **State Management**: Zustand store for UI state
- **Hooks**: Dependency injection and composition

### 4. Presentation Layer (UI)
- **Components**: Pure React components
- **Pages**: Route components
- **No business logic**: Only presentation and user interaction

## Key Principles

1. **Dependency Inversion**: Domain defines interfaces, infrastructure implements them
2. **Single Responsibility**: Each class/module has one reason to change
3. **Immutability**: Entities are immutable, changes create new instances
4. **Testability**: Each layer can be tested independently
5. **Framework Independence**: Domain layer has no React/framework dependencies

## Usage Example

```typescript
import { useChatService } from './application/hooks/useChatService';
import { useChatStore } from './application/state/useChatStore';

function ChatPage() {
  const chatService = useChatService();
  const { messages, addMessage } = useChatStore();

  const handleSend = async (content: string) => {
    await chatService.sendMessage(conversationId, content, (token) => {
      // Handle streaming token
    });
  };

  return <div>...</div>;
}
```


/**
 * Chat Bounded Context - Public API
 * 
 * Exports aggregates, entities, value objects, events, and ports
 */

// Aggregates
export { Conversation, ConversationStatus } from './aggregates/conversation.aggregate';

// Entities
export { Message, MessageRole, MessageMetadata } from './entities/message.entity';

// Value Objects
export { ConversationId } from './value-objects/conversation-id.vo';
export { MessageId } from './value-objects/message-id.vo';

// Events
export {
    ChatMessageReceived,
    AssistantMessageGenerated,
    ConversationStarted,
    ConversationClosed
} from './events/chat.events';

// Ports
export { IChatRepository } from './ports/chat-repository.port';
export { ILLMPort, LLMMessage, LLMCompletionRequest, LLMCompletionResponse } from './ports/llm.port';

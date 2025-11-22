/**
 * Chat Domain Events
 *
 * Events emitted by Chat Bounded Context
 */

import { BaseDomainEvent } from '../../shared/events/domain-event.base';
import { CorrelationId } from '../../shared/value-objects/correlation-id.vo';

export class ChatMessageReceived extends BaseDomainEvent {
	constructor(
		correlationId: CorrelationId,
		public readonly conversationId: string,
		public readonly messageId: string,
		public readonly role: string,
		public readonly content: string,
		principalId?: string,
	) {
		super('chat.message.received', correlationId, conversationId, principalId);
	}
}

export class AssistantMessageGenerated extends BaseDomainEvent {
	constructor(
		correlationId: CorrelationId,
		public readonly conversationId: string,
		public readonly messageId: string,
		public readonly content: string,
		public readonly tokenCount: number,
		principalId?: string,
	) {
		super('chat.message.generated', correlationId, conversationId, principalId);
	}
}

export class ConversationStarted extends BaseDomainEvent {
	constructor(
		correlationId: CorrelationId,
		public readonly conversationId: string,
		principalId?: string,
	) {
		super('chat.conversation.started', correlationId, conversationId, principalId);
	}
}

export class ConversationClosed extends BaseDomainEvent {
	constructor(
		correlationId: CorrelationId,
		public readonly conversationId: string,
		principalId?: string,
	) {
		super('chat.conversation.closed', correlationId, conversationId, principalId);
	}
}

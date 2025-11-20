/**
 * Adapters - Public API
 */

// LLM
export { WorkersAIAdapter } from './llm/workers-ai.adapter';

// MCP
export { DuffelFlightAdapter } from './mcp/flights.adapter';
export { GoogleCalendarAdapter } from './mcp/calendar.adapter';

// Persistence
export { D1ChatAdapter } from './persistence/d1-chat.adapter';
export { D1TaskAdapter } from './persistence/d1-task.adapter';
export { D1EventLogAdapter } from './persistence/d1-event-log.adapter';

import { describe, test, expect } from 'vitest';
import { buildChatSystemPrompt } from '../../src/prompts/chat-response.prompt';

describe('buildChatSystemPrompt', () => {
    test('includes base prompt and date', () => {
        const prompt = buildChatSystemPrompt({});
        expect(prompt).toContain('You are Micro Chief of Staff');
        expect(prompt).toContain("Today's date is");
    });

    test('excludes tool instructions when toolsAvailable is undefined/false', () => {
        const prompt = buildChatSystemPrompt({});
        expect(prompt).not.toContain('TOOL USAGE INSTRUCTIONS');
        expect(prompt).not.toContain('search_flights');
    });

    test('includes tool instructions when toolsAvailable is true', () => {
        const prompt = buildChatSystemPrompt({ toolsAvailable: true });
        expect(prompt).toContain('TOOL USAGE INSTRUCTIONS');
        expect(prompt).toContain('search_flights');
        expect(prompt).toContain('list_events');
    });

    test('includes flight data instructions when hasFlightData is true', () => {
        const prompt = buildChatSystemPrompt({ hasFlightData: true });
        expect(prompt).toContain('WHEN TOOL RESULTS AVAILABLE');
        expect(prompt).toContain('flight_options');
    });
});

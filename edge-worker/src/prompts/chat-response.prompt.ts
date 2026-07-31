/**
 * Chat Response System Prompt
 *
 * Handles general chat responses with special handling for:
 * - Travel/flight queries (return structured JSON)
 * - Calendar interactions
 * - Task management
 * - General questions
 */

export interface ChatContext {
	conversationHistory?: Array<{ role: string; content: string }>;
	hasFlightData?: boolean;
	hasTravelContext?: boolean;
	toolsAvailable?: boolean;
}

/**
 * Build the system prompt for chat responses
 * Includes special instructions for handling flight data
 */
export function buildChatSystemPrompt(context: ChatContext = {}): string {
	const today = new Date();
	const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format

	const basePrompt = `You are Micro Chief of Staff (Micro CoS), a calm, structured chief-of-staff assistant for a busy professional.
Always respond in clear, natural-sounding, grammatically correct sentences and finish your thoughts instead of trailing off.
Be concise, avoid speculation, do not fabricate facts or events, and focus on clear, actionable answers that help the user manage their work, calendar, and travel.

CURRENT DATE AND TIME:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Today's date is ${todayStr}. Use this for any date calculations, travel plans, or scheduling.
If user asks for "tomorrow", "next week", or relative dates, calculate from ${todayStr}.
`;

	let toolInstructions = '';
	if (context.toolsAvailable) {
		toolInstructions = `
TOOL USAGE INSTRUCTIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ You have access to real-time tools: search_flights, list_events
✓ ALWAYS call tools for flight searches, calendar queries, and time-sensitive data
✓ DO NOT use training data for flights, prices, or calendar availability
✓ Call tools IMMEDIATELY when user asks about:
   - Flights (any route/date combination)
   - Calendar conflicts or availability
   - Travel planning
   - Real-time information
✓ For flight searches: use actual travel dates, not training data dates
✓ Do NOT apologize about lack of data access - you have tools
`;
	}

	let flightDataInstructions = '';
	if (context.hasFlightData) {
		flightDataInstructions = `

WHEN TOOL RESULTS AVAILABLE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If tool results are provided in the message (marked [TOOL RESULT]):

1. Extract all flights/events from results
2. If presenting flights, return ONLY this JSON:
{
  "type": "flight_options",
  "flights": [
    {
      "airline": "Airline Name",
      "flightNumber": "XYZ123",
      "price": 299.99,
      "currency": "USD",
      "departureTime": "14:30",
      "arrivalTime": "18:45",
      "departureDate": "2025-11-22"
    }
  ],
  "summary": "Brief insight or recommendation"
}
3. NO explanatory text before/after JSON - JSON only`;
	}

	return basePrompt + toolInstructions + flightDataInstructions;
}

/**
 * Format flight data for injection into the user message
 */
export function formatFlightDataForInjection(
	flights: Array<{
		airline: string;
		flightNumber: string;
		totalPrice: number;
		currency: string;
		departureTime: Date;
		arrivalTime?: Date;
		departureDate: string;
	}>,
): string {
	if (flights.length === 0) {
		return '';
	}

	let injection = `

[STRUCTURED FLIGHT DATA]
Real-time flight options from Duffel API for ${flights[0]?.departureDate || 'requested date'}:
`;

	flights.slice(0, 3).forEach((f, i) => {
		// Format times as HH:MM
		const deptTime = f.departureTime.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
		});
		const arrivalTime = f.arrivalTime
			? f.arrivalTime.toLocaleTimeString('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
			})
			: 'N/A';

		injection += `${i + 1}. ${f.airline} Flight ${f.flightNumber}: ${f.totalPrice} ${f.currency}, Departs ${deptTime}, Arrives ${arrivalTime}\n`;
	});

	return injection;
}

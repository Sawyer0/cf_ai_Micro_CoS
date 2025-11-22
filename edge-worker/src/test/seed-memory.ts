/**
 * Test script to add semantic memory preferences
 * Run this after deploying to populate test data
 */

interface D1Database {
	prepare(query: string): {
		bind(...values: unknown[]): {
			run(): Promise<any>;
		};
	};
}

export async function seedTestMemory(db: D1Database, userId: string) {
	console.log(`[Memory Test] Seeding test data for user: ${userId}`);

	// 1. Create user profile
	await db
		.prepare(
			`
      INSERT OR REPLACE INTO user_profiles (user_id, home_airport, preferred_seat, budget_domestic_usd)
      VALUES (?, ?, ?, ?)
    `,
		)
		.bind(userId, 'PHL', 'window', 500)
		.run();

	console.log('✅ Created user profile: home_airport=PHL, preferred_seat=window, budget=$500');

	// 2. Add airline preference
	const airlineId = crypto.randomUUID();
	await db
		.prepare(
			`
      INSERT OR REPLACE INTO user_preferences (id, user_id, category, preference_key, preference_value, confidence, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
		)
		.bind(airlineId, userId, 'airline', 'preferred', 'Delta', 1.0, 'explicit')
		.run();

	console.log('✅ Added airline preference: Delta (confidence: 1.0)');

	// 3. Add a past trip (episodic memory)
	const tripId = crypto.randomUUID();
	await db
		.prepare(
			`
      INSERT INTO travel_history (
        id, user_id, from_airport, to_airport, departure_date, airline, cost_usd, booking_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
		)
		.bind(tripId, userId, 'PHL', 'LAX', '2025-11-15', 'Delta', 450, 'completed')
		.run();

	console.log('✅ Added travel history: PHL → LAX on Nov 15, 2025 (Delta, $450)');

	// 4. Add an automation rule (procedural memory)
	const ruleId = crypto.randomUUID();
	await db
		.prepare(
			`
      INSERT INTO automation_rules (
        id, user_id, rule_name, rule_type, context, condition, action, priority, enabled
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
		)
		.bind(
			ruleId,
			userId,
			'Prefer Delta Airlines',
			'prioritize',
			'flight_search',
			JSON.stringify({ field: 'airline', operator: 'eq', value: 'Delta' }),
			JSON.stringify({ type: 'boost', params: { score: 10 } }),
			10,
			true,
		)
		.run();

	console.log('✅ Added automation rule: Prefer Delta Airlines (priority: 10)');

	console.log('\n🎉 Test memory seeded successfully!');
	console.log('\nExpected LLM Context:');
	console.log('---');
	console.log('[User Profile]');
	console.log('Home airport: PHL');
	console.log('Seat preference: window');
	console.log('Domestic flight budget: $500');
	console.log('Preferred airlines: Delta');
	console.log('');
	console.log('[Recent Trips]');
	console.log('- PHL → LAX on 11/15/2025 (completed)');
	console.log('');
	console.log('[Flight Search Rules]');
	console.log('- Prefer Delta Airlines');
	console.log('---');
}

// Example usage in a worker endpoint
export async function handleSeedMemory(request: Request, env: any): Promise<Response> {
	const userId = new URL(request.url).searchParams.get('userId') || 'test-user-123';

	try {
		await seedTestMemory(env.DB, userId);
		return new Response(JSON.stringify({ success: true, userId }), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		console.error('[Memory Test] Failed to seed:', error);
		return new Response(JSON.stringify({ success: false, error: String(error) }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

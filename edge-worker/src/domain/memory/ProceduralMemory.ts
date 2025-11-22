/**
 * Procedural Memory: Workflows and automation rules
 *
 * This represents long-term memory about HOW to do things - workflows, rules, and automation.
 * Examples: "Always check Delta first", "Filter out flights over $500", "Send daily summary at 8am"
 */

export interface UserWorkflow {
	id: string;
	userId: string;
	workflowName: string;
	triggerType: 'manual' | 'scheduled' | 'event';
	triggerConfig?: {
		event?: string;
		condition?: Record<string, unknown>;
		schedule?: string; // cron format
	};
	actions: Array<{
		type: string;
		params: Record<string, unknown>;
	}>;
	enabled: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface AutomationRule {
	id: string;
	userId: string;
	ruleName: string;
	ruleType: 'filter' | 'prioritize' | 'constraint' | 'preference';
	context: 'flight_search' | 'task_management' | 'calendar' | 'general';
	condition: {
		field: string;
		operator: 'eq' | 'ne' | 'in' | 'not_in' | 'gt' | 'lt' | 'contains';
		value: any;
	};
	action: {
		type: string;
		params: Record<string, unknown>;
	};
	priority: number;
	enabled: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export class ProceduralMemory {
	constructor(
		public readonly workflows: UserWorkflow[],
		public readonly rules: AutomationRule[],
	) {}

	static empty(): ProceduralMemory {
		return new ProceduralMemory([], []);
	}

	/**
	 * Get enabled workflows for a specific trigger
	 */
	getWorkflowsForTrigger(triggerType: UserWorkflow['triggerType']): UserWorkflow[] {
		return this.workflows.filter((w) => w.enabled && w.triggerType === triggerType);
	}

	/**
	 * Get rules for a specific context
	 */
	getRulesForContext(context: AutomationRule['context']): AutomationRule[] {
		return this.rules.filter((r) => r.enabled && r.context === context).sort((a, b) => b.priority - a.priority);
	}

	/**
	 * Get filter rules (constraints) for a context
	 */
	getFilterRules(context: AutomationRule['context']): AutomationRule[] {
		return this.getRulesForContext(context).filter((r) => r.ruleType === 'filter' || r.ruleType === 'constraint');
	}

	/**
	 * Convert procedural memory to prompt context string
	 */
	toPromptContext(): string {
		const parts: string[] = [];

		// Automation rules by context
		const flightRules = this.getRulesForContext('flight_search');
		if (flightRules.length > 0) {
			parts.push('[Flight Search Rules]');
			flightRules.forEach((rule) => {
				parts.push(`- ${rule.ruleName}`);
			});
		}

		const taskRules = this.getRulesForContext('task_management');
		if (taskRules.length > 0) {
			parts.push('\n[Task Management Rules]');
			taskRules.forEach((rule) => {
				parts.push(`- ${rule.ruleName}`);
			});
		}

		// Active workflows
		const activeWorkflows = this.workflows.filter((w) => w.enabled);
		if (activeWorkflows.length > 0) {
			parts.push('\n[Active Workflows]');
			activeWorkflows.forEach((wf) => {
				parts.push(`- ${wf.workflowName} (${wf.triggerType})`);
			});
		}

		return parts.length > 0 ? `\n${parts.join('\n')}\n` : '';
	}
}

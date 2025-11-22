/**
 * D1 Database adapter for procedural memory
 * Implements IProceduralMemoryRepository using Cloudflare D1
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { IProceduralMemoryRepository } from '../../domain/memory/ports/IProceduralMemoryRepository';
import { ProceduralMemory, UserWorkflow, AutomationRule } from '../../domain/memory/ProceduralMemory';

export class D1ProceduralMemoryRepository implements IProceduralMemoryRepository {
    constructor(private readonly db: D1Database) { }

    async getProceduralMemory(userId: string): Promise<ProceduralMemory> {
        // Fetch workflows
        const workflowsResult = await this.db
            .prepare('SELECT * FROM user_workflows WHERE user_id = ? ORDER BY created_at DESC')
            .bind(userId)
            .all<any>();

        const workflows: UserWorkflow[] = (workflowsResult.results || []).map((row: any) => ({
            id: row.id,
            userId: row.user_id,
            workflowName: row.workflow_name,
            triggerType: row.trigger_type as any,
            triggerConfig: row.trigger_config ? JSON.parse(row.trigger_config) : undefined,
            actions: JSON.parse(row.actions),
            enabled: Boolean(row.enabled),
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        }));

        // Fetch automation rules
        const rulesResult = await this.db
            .prepare('SELECT * FROM automation_rules WHERE user_id = ? ORDER BY priority DESC')
            .bind(userId)
            .all<any>();

        const rules: AutomationRule[] = (rulesResult.results || []).map((row: any) => ({
            id: row.id,
            userId: row.user_id,
            ruleName: row.rule_name,
            ruleType: row.rule_type as any,
            context: row.context as any,
            condition: JSON.parse(row.condition),
            action: JSON.parse(row.action),
            priority: row.priority,
            enabled: Boolean(row.enabled),
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        }));

        return new ProceduralMemory(workflows, rules);
    }

    async addWorkflow(workflow: Omit<UserWorkflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
        const id = crypto.randomUUID();
        await this.db
            .prepare(`
        INSERT INTO user_workflows (
          id, user_id, workflow_name, trigger_type, trigger_config, actions, enabled
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
            .bind(
                id,
                workflow.userId,
                workflow.workflowName,
                workflow.triggerType,
                workflow.triggerConfig ? JSON.stringify(workflow.triggerConfig) : null,
                JSON.stringify(workflow.actions),
                workflow.enabled
            )
            .run();
    }

    async updateWorkflowStatus(workflowId: string, enabled: boolean): Promise<void> {
        await this.db
            .prepare('UPDATE user_workflows SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .bind(enabled, workflowId)
            .run();
    }

    async addAutomationRule(rule: Omit<AutomationRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
        const id = crypto.randomUUID();
        await this.db
            .prepare(`
        INSERT INTO automation_rules (
          id, user_id, rule_name, rule_type, context, condition, action, priority, enabled
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
            .bind(
                id,
                rule.userId,
                rule.ruleName,
                rule.ruleType,
                rule.context,
                JSON.stringify(rule.condition),
                JSON.stringify(rule.action),
                rule.priority,
                rule.enabled
            )
            .run();
    }

    async updateRuleStatus(ruleId: string, enabled: boolean): Promise<void> {
        await this.db
            .prepare('UPDATE automation_rules SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .bind(enabled, ruleId)
            .run();
    }

    async deleteWorkflow(workflowId: string): Promise<void> {
        await this.db
            .prepare('DELETE FROM user_workflows WHERE id = ?')
            .bind(workflowId)
            .run();
    }

    async deleteRule(ruleId: string): Promise<void> {
        await this.db
            .prepare('DELETE FROM automation_rules WHERE id = ?')
            .bind(ruleId)
            .run();
    }
}

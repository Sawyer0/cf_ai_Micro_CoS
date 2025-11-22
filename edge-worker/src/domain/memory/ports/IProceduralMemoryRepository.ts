/**
 * Port (interface) for procedural memory repository
 * Manages workflows and automation rules
 */

import type { ProceduralMemory, UserWorkflow, AutomationRule } from '../ProceduralMemory';

export interface IProceduralMemoryRepository {
    /**
     * Retrieve procedural memory for a user
     */
    getProceduralMemory(userId: string): Promise<ProceduralMemory>;

    /**
     * Add a workflow
     */
    addWorkflow(workflow: Omit<UserWorkflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<void>;

    /**
     * Update workflow enabled status
     */
    updateWorkflowStatus(workflowId: string, enabled: boolean): Promise<void>;

    /**
     * Add an automation rule
     */
    addAutomationRule(rule: Omit<AutomationRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<void>;

    /**
     * Update rule enabled status
     */
    updateRuleStatus(ruleId: string, enabled: boolean): Promise<void>;

    /**
     * Delete a workflow
     */
    deleteWorkflow(workflowId: string): Promise<void>;

    /**
     * Delete a rule
     */
    deleteRule(ruleId: string): Promise<void>;
}

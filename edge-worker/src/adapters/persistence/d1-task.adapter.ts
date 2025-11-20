/**
 * D1TaskAdapter - Task persistence using Cloudflare D1
 * 
 * Implements ITaskRepository
 */

import { ITaskRepository } from '../../domain/task/ports/task-repository.port';
import { Task, TaskStatus, TaskPriority } from '../../domain/task/aggregates/task.aggregate';
import { Logger } from '../../observability/logger';

export class D1TaskAdapter implements ITaskRepository {
    constructor(
        private readonly db: D1Database,
        private readonly logger: Logger
    ) { }

    async save(task: Task): Promise<void> {
        try {
            await this.db.prepare(`
        INSERT INTO tasks (id, title, description, status, priority, due_date, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          status = excluded.status,
          priority = excluded.priority,
          due_date = excluded.due_date,
          updated_at = excluded.updated_at
      `).bind(
                task.id,
                task['title'],
                task['description'] || null,
                task.getStatus(),
                task['priority'],
                task['dueDate']?.toISOString() || null,
                task['userId'],
                task['createdAt'].toISOString(),
                task['updatedAt'].toISOString()
            ).run();
        } catch (error) {
            this.logger.error('Failed to save task', error as Error);
            throw error;
        }
    }

    async findById(id: string, userId: string): Promise<Task | null> {
        try {
            const row = await this.db.prepare(`
        SELECT * FROM tasks WHERE id = ? AND user_id = ?
      `).bind(id, userId).first();

            if (!row) return null;

            return Task.reconstitute(
                row.id as string,
                row.title as string,
                row.user_id as string,
                row.status as TaskStatus,
                row.priority as TaskPriority,
                {},
                new Date(row.created_at as string),
                new Date(row.updated_at as string),
                row.description as string | undefined,
                row.due_date ? new Date(row.due_date as string) : undefined
            );
        } catch (error) {
            this.logger.error('Failed to find task', error as Error);
            return null;
        }
    }

    async findByUser(userId: string, limit?: number, offset?: number): Promise<Task[]> {
        try {
            const results = await this.db.prepare(`
        SELECT * FROM tasks
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).bind(userId, limit || 50, offset || 0).all();

            return results.results.map(row => this.rowToTask(row));
        } catch (error) {
            this.logger.error('Failed to find tasks by user', error as Error);
            return [];
        }
    }

    async findOverdue(userId: string): Promise<Task[]> {
        try {
            const now = new Date().toISOString();
            const results = await this.db.prepare(`
        SELECT * FROM tasks
        WHERE user_id = ? AND due_date < ? AND status != 'completed'
        ORDER BY due_date ASC
      `).bind(userId, now).all();

            return results.results.map(row => this.rowToTask(row));
        } catch (error) {
            this.logger.error('Failed to find overdue tasks', error as Error);
            return [];
        }
    }

    private rowToTask(row: any): Task {
        return Task.reconstitute(
            row.id,
            row.title,
            row.user_id,
            row.status,
            row.priority,
            {},
            new Date(row.created_at),
            new Date(row.updated_at),
            row.description || undefined,
            row.due_date ? new Date(row.due_date) : undefined
        );
    }
}

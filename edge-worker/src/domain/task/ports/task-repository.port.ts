/**
 * ITaskRepository - Port for task persistence
 */

import { Task } from '../aggregates/task.aggregate';

export interface ITaskRepository {
	save(task: Task): Promise<void>;

	findById(id: string, userId: string): Promise<Task | null>;

	findByUser(userId: string, limit?: number, offset?: number): Promise<Task[]>;

	findOverdue(userId: string): Promise<Task[]>;
}

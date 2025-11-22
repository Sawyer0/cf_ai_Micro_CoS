/**
 * TaskService - Application service for task management
 *
 * Orchestrates task CRUD and state transitions
 */

import { Task, TaskPriority } from '../domain/task/aggregates/task.aggregate';
import { ITaskRepository } from '../domain/task/ports/task-repository.port';
import { Logger } from '../observability/logger';

export interface CreateTaskCommand {
	title: string;
	userId: string;
	description?: string;
	priority?: TaskPriority;
	dueDate?: Date;
}

export class TaskService {
	constructor(
		private readonly taskRepo: ITaskRepository,
		private readonly logger: Logger,
	) {}

	async createTask(command: CreateTaskCommand): Promise<Task> {
		const task = Task.create(command.title, command.userId, command.priority, {}, command.description, command.dueDate);

		await this.taskRepo.save(task);

		this.logger.info('Task created', {
			metadata: { taskId: task.id, userId: command.userId },
		});

		return task;
	}

	async getUserTasks(userId: string, limit?: number): Promise<Task[]> {
		return this.taskRepo.findByUser(userId, limit);
	}

	async getOverdueTasks(userId: string): Promise<Task[]> {
		return this.taskRepo.findOverdue(userId);
	}

	async startTask(taskId: string, userId: string): Promise<Task> {
		const task = await this.taskRepo.findById(taskId, userId);
		if (!task) {
			throw new Error('Task not found');
		}

		task.start();
		await this.taskRepo.save(task);

		return task;
	}

	async completeTask(taskId: string, userId: string): Promise<Task> {
		const task = await this.taskRepo.findById(taskId, userId);
		if (!task) {
			throw new Error('Task not found');
		}

		task.complete();
		await this.taskRepo.save(task);

		return task;
	}
}

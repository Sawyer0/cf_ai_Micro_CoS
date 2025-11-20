/**
 * Task - Aggregate Root for Task Bounded Context
 * 
 * Enforces state machine transitions and business invariants
 */

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskMetadata {
    source?: 'calendar' | 'chat' | 'manual';
    relatedEventId?: string;
    tags?: string[];
}

export class Task {
    readonly id: string;
    private title: string;
    private description?: string;
    private status: TaskStatus;
    private priority: TaskPriority;
    private dueDate?: Date;
    private readonly userId: string;
    private readonly metadata: TaskMetadata;
    private readonly createdAt: Date;
    private updatedAt: Date;

    private constructor(
        id: string,
        title: string,
        userId: string,
        status: TaskStatus,
        priority: TaskPriority,
        metadata: TaskMetadata,
        createdAt: Date,
        updatedAt: Date,
        description?: string,
        dueDate?: Date
    ) {
        this.id = id;
        this.title = title;
        this.userId = userId;
        this.status = status;
        this.priority = priority;
        this.metadata = metadata;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.description = description;
        this.dueDate = dueDate;
    }

    static create(
        title: string,
        userId: string,
        priority: TaskPriority = 'medium',
        metadata: TaskMetadata = {},
        description?: string,
        dueDate?: Date
    ): Task {
        const now = new Date();
        return new Task(
            crypto.randomUUID(),
            title,
            userId,
            'pending',
            priority,
            metadata,
            now,
            now,
            description,
            dueDate
        );
    }

    static reconstitute(
        id: string,
        title: string,
        userId: string,
        status: TaskStatus,
        priority: TaskPriority,
        metadata: TaskMetadata,
        createdAt: Date,
        updatedAt: Date,
        description?: string,
        dueDate?: Date
    ): Task {
        return new Task(
            id,
            title,
            userId,
            status,
            priority,
            metadata,
            createdAt,
            updatedAt,
            description,
            dueDate
        );
    }

    // Business invariant: state machine enforcement
    start(): void {
        if (this.status !== 'pending') {
            throw new Error(`Cannot start task in ${this.status} state`);
        }
        this.status = 'in_progress';
        this.updatedAt = new Date();
    }

    complete(): void {
        if (this.status === 'cancelled') {
            throw new Error('Cannot complete cancelled task');
        }
        this.status = 'completed';
        this.updatedAt = new Date();
    }

    cancel(): void {
        if (this.status === 'completed') {
            throw new Error('Cannot cancel completed task');
        }
        this.status = 'cancelled';
        this.updatedAt = new Date();
    }

    getStatus(): TaskStatus {
        return this.status;
    }

    isOverdue(): boolean {
        if (!this.dueDate) return false;
        return this.dueDate < new Date() && this.status !== 'completed';
    }
}

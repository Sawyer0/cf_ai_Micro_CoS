/**
 * Task API DTOs
 */

export interface CreateTaskRequest {
    title: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    dueDate?: string;
}

export interface UpdateTaskRequest {
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    dueDate?: string;
}

export interface TaskResponse {
    id: string;
    title: string;
    description?: string;
    status: string;
    priority: string;
    dueDate?: string;
    createdAt: string;
    updatedAt: string;
}

export function validateCreateTaskRequest(data: any): CreateTaskRequest {
    if (!data.title || typeof data.title !== 'string') {
        throw new Error('Invalid task request: title required');
    }

    return {
        title: data.title,
        description: data.description,
        priority: data.priority || 'medium',
        dueDate: data.dueDate
    };
}

/**
 * Task Routes - CRUD operations for tasks
 */

import { TaskService } from '../../application/task.service';
import { validateCreateTaskRequest } from '../dto/task.dto';
import { requireAuth } from '../middleware/auth';
import { jsonResponse } from '../error-handler';
import { Logger } from '../../observability/logger';

export async function handleTasksGet(
    request: Request,
    taskService: TaskService
): Promise<Response> {
    const principal = await requireAuth(request);
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);

    const tasks = await taskService.getUserTasks(principal.id, limit);

    return jsonResponse({
        tasks: tasks.map(t => ({
            id: t.id,
            title: t['title'],
            status: t.getStatus(),
            priority: t['priority'],
            createdAt: t['createdAt'].toISOString()
        }))
    });
}

export async function handleTasksPost(
    request: Request,
    taskService: TaskService
): Promise<Response> {
    const principal = await requireAuth(request);
    const body = await request.json();
    const taskRequest = validateCreateTaskRequest(body);

    const task = await taskService.createTask({
        ...taskRequest,
        userId: principal.id,
        dueDate: taskRequest.dueDate ? new Date(taskRequest.dueDate) : undefined
    });

    return jsonResponse(
        {
            id: task.id,
            title: task['title'],
            status: task.getStatus()
        },
        201
    );
}

export async function handleTaskPatch(
    request: Request,
    taskService: TaskService,
    taskId: string,
    action: string
): Promise<Response> {
    const principal = await requireAuth(request);

    let task;
    if (action === 'start') {
        task = await taskService.startTask(taskId, principal.id);
    } else if (action === 'complete') {
        task = await taskService.completeTask(taskId, principal.id);
    } else {
        return jsonResponse({ error: 'Invalid action' }, 400);
    }

    return jsonResponse({
        id: task.id,
        status: task.getStatus()
    });
}

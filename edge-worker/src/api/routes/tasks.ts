/**
 * Task Routes - CRUD operations for tasks
 */

import { TaskService } from '../../application/task.service';
import { validateCreateTaskRequest } from '../dto/task.dto';
import { requireAuth } from '../middleware/auth';
import { jsonResponse } from '../error-handler';
import { Logger } from '../../observability/logger';
import { Principal, CorrelationId } from '../../domain/shared';
import { Container } from '../../config/container';

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

// Unified handler for routing
export async function handleTasksRequest(
    request: Request,
    principal: Principal,
    correlationId: CorrelationId,
    container: Container
): Promise<Response> {
    const url = new URL(request.url);

    // GET /api/tasks - list tasks
    if (request.method === 'GET' && url.pathname === '/api/tasks') {
        return handleTasksGet(request, container.taskService);
    }

    // POST /api/tasks - create task
    if (request.method === 'POST' && url.pathname === '/api/tasks') {
        return handleTasksPost(request, container.taskService);
    }

    // PATCH /api/tasks/:id/:action - update task
    const patchMatch = url.pathname.match(/^\/api\/tasks\/([^\/]+)\/([^\/]+)$/);
    if (request.method === 'PATCH' && patchMatch) {
        const [, taskId, action] = patchMatch;
        return handleTaskPatch(request, container.taskService, taskId, action);
    }

    return new Response('Method not allowed', { status: 405 });
}

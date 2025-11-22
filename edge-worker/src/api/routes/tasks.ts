/**
 * Task Routes - CRUD operations for tasks
 */

import { TaskService } from '../../application/task.service';
import { validateCreateTaskRequest } from '../dto/task.dto';
import { jsonResponse } from '../error-handler';
import { Logger } from '../../observability/logger';
import { Principal, CorrelationId } from '../../domain/shared';
import { Container } from '../../config/container';

export async function handleTasksGet(request: Request, principal: Principal, taskService: TaskService): Promise<Response> {
	const url = new URL(request.url);
	const limit = parseInt(url.searchParams.get('limit') || '50', 10);

	const tasks = await taskService.getUserTasks(principal.id, limit);

	return jsonResponse({
		tasks: tasks.map((t) => ({
			id: t.id,
			title: t['title'],
			status: t.getStatus(),
			priority: t['priority'],
			createdAt: t['createdAt'].toISOString(),
		})),
	});
}

export async function handleTasksPost(request: Request, principal: Principal, taskService: TaskService): Promise<Response> {
	const body = await request.json();
	const taskRequest = validateCreateTaskRequest(body);

	const task = await taskService.createTask({
		...taskRequest,
		userId: principal.id,
		dueDate: taskRequest.dueDate ? new Date(taskRequest.dueDate) : undefined,
	});

	return jsonResponse(
		{
			id: task.id,
			title: task['title'],
			status: task.getStatus(),
		},
		201,
	);
}

export async function handleTaskPatch(
	request: Request,
	principal: Principal,
	taskService: TaskService,
	taskId: string,
	action: string,
): Promise<Response> {
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
		status: task.getStatus(),
	});
}

// Unified handler for routing
export async function handleTasksRequest(
	request: Request,
	principal: Principal,
	correlationId: CorrelationId,
	container: Container,
): Promise<Response> {
	const url = new URL(request.url);

	// Idempotency Check
	const idempotencyKey = container.idempotency.getIdempotencyKey(request);
	if (idempotencyKey) {
		const cached = await container.idempotency.checkIdempotencyKey(idempotencyKey);
		if (cached) return cached;
	}

	let response: Response;

	// GET /api/tasks - list tasks
	if (request.method === 'GET' && url.pathname === '/api/tasks') {
		response = await handleTasksGet(request, principal, container.taskService);
	}
	// POST /api/tasks - create task
	else if (request.method === 'POST' && url.pathname === '/api/tasks') {
		response = await handleTasksPost(request, principal, container.taskService);
	}
	// PATCH /api/tasks/:id/:action - update task
	else {
		const patchMatch = url.pathname.match(/^\/api\/tasks\/([^\/]+)\/([^\/]+)$/);
		if (request.method === 'PATCH' && patchMatch) {
			const [, taskId, action] = patchMatch;
			response = await handleTaskPatch(request, principal, container.taskService, taskId, action);
		} else {
			response = new Response('Method not allowed', { status: 405 });
		}
	}

	// Store Idempotency Response
	if (idempotencyKey && response.ok) {
		// Clone response to avoid consuming the stream of the returned response
		await container.idempotency.storeResponse(idempotencyKey, response.clone());
	}

	return response;
}

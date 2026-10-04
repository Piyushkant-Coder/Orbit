import { Router } from 'express';
import { Prisma, TaskStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate } from '../middleware/authenticate';
import { WorkspaceRequest, loadWorkspaceMembership, requireWorkspacePermission } from '../middleware/workspaceContext';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../utils/asyncHandler';
import { decodeCursor, encodeCursor, nextPosition } from '../utils/ordering';
import { recordActivity } from '../domain/activity';
import { publishRealtime } from '../realtime';
import { getDashboard, invalidateDashboard } from '../cache/dashboard';

const router = Router();
const uuid = z.string().uuid();
const workspaceName = z.string().trim().min(1).max(80);
const taskTitle = z.string().trim().min(1).max(200);
const description = z.string().max(10000).nullable().optional();
const workspaceMiddleware = (action: string) => [authenticate, loadWorkspaceMembership, requireWorkspacePermission(action)];
const boardBody = z.object({ name: workspaceName, description }).strict();
const listBody = z.object({ name: workspaceName, afterId: uuid.nullable().optional() }).strict();
const taskCreateBody = z.object({
  title: taskTitle, description, status: z.nativeEnum(TaskStatus).optional(),
  assigneeId: uuid.nullable().optional(), labelIds: z.array(uuid).max(50).optional(), afterId: uuid.nullable().optional(),
}).strict();
const taskPatchBody = z.object({
  expectedVersion: z.number().int().positive(), title: taskTitle.optional(), description,
  status: z.nativeEnum(TaskStatus).optional(), assigneeId: uuid.nullable().optional(), labelIds: z.array(uuid).max(50).optional(),
}).strict();
const moveBody = z.object({ afterId: uuid.nullable() }).strict();
const taskMoveBody = z.object({ toListId: uuid, afterId: uuid.nullable() }).strict();

function parseUuid(value: string, field: string): string {
  const result = uuid.safeParse(value);
  if (!result.success) throw new AppError('VALIDATION_ERROR', `${field} must be a valid UUID`, 400);
  return result.data;
}

const taskInclude = {
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  labels: { include: { label: { select: { id: true, name: true, color: true } } } },
} as const;

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

function dto(task: TaskWithRelations) {
  return {
    id: task.id, workspaceId: task.workspaceId, boardId: task.boardId, listId: task.listId,
    title: task.title, description: task.description, status: task.status, position: task.position,
    assignee: task.assignee ? { id: task.assignee.id, name: task.assignee.name } : null,
    labels: task.labels.map(({ label }) => ({ id: label.id, name: label.name, color: label.color })),
    version: task.version,
    createdBy: task.createdBy ? { id: task.createdBy.id, name: task.createdBy.name } : null,
    createdAt: task.createdAt, updatedAt: task.updatedAt,
  };
}

async function assertLabels(workspaceId: string, labelIds: string[] | undefined): Promise<void> {
  if (!labelIds?.length) return;
  if (new Set(labelIds).size !== labelIds.length) throw new AppError('VALIDATION_ERROR', 'Duplicate labels are not allowed', 400);
  const count = await prisma.label.count({ where: { workspaceId, id: { in: labelIds } } });
  if (count !== new Set(labelIds).size) throw new AppError('NOT_FOUND', 'One or more labels were not found', 404);
}

async function assertAssignee(workspaceId: string, assigneeId: string | null | undefined): Promise<void> {
  if (!assigneeId) return;
  const member = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId: assigneeId, workspaceId } } });
  if (!member) throw new AppError('NOT_FOUND', 'Assignee is not a workspace member', 404);
}

async function positionForList(tx: Prisma.TransactionClient, listId: string, workspaceId: string, afterId: string | null | undefined): Promise<string> {
  const predecessor = afterId ? await tx.task.findFirst({ where: { id: afterId, workspaceId, listId }, select: { position: true } }) : null;
  if (afterId && !predecessor) throw new AppError('STALE_REFERENCE', 'The reorder anchor is no longer valid', 409);
  const successor = await tx.task.findFirst({
    where: { workspaceId, listId, ...(predecessor ? { position: { gt: predecessor.position } } : {}), ...(afterId ? { id: { not: afterId } } : {}) },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: { position: true },
  });
  return nextPosition(predecessor?.position ?? null, successor?.position ?? null);
}

async function positionForBoard(tx: Prisma.TransactionClient, boardId: string, workspaceId: string, afterId: string | null | undefined): Promise<string> {
  const predecessor = afterId ? await tx.list.findFirst({ where: { id: afterId, workspaceId, boardId }, select: { position: true } }) : null;
  if (afterId && !predecessor) throw new AppError('STALE_REFERENCE', 'The reorder anchor is no longer valid', 409);
  const successor = await tx.list.findFirst({
    where: { workspaceId, boardId, ...(predecessor ? { position: { gt: predecessor.position } } : {}), ...(afterId ? { id: { not: afterId } } : {}) },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: { position: true },
  });
  return nextPosition(predecessor?.position ?? null, successor?.position ?? null);
}

router.get('/:workspaceId/boards', ...workspaceMiddleware('board:read'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const items = await prisma.board.findMany({ where: { workspaceId: req.workspaceId }, orderBy: { createdAt: 'asc' } });
  res.json({ items, nextCursor: null });
}));

router.post('/:workspaceId/boards', ...workspaceMiddleware('board:create'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const input = boardBody.parse(req.body);
  const board = await prisma.$transaction(async (tx) => {
    const created = await tx.board.create({ data: { workspaceId: req.workspaceId!, ...input } });
    await recordActivity(tx, { workspaceId: req.workspaceId!, actorId: req.userId, action: 'board.created', entityType: 'board', entityId: created.id });
    return created;
  });
  publishRealtime('board:created', { workspaceId: req.workspaceId!, actorId: req.userId, data: board });
  await invalidateDashboard(req.workspaceId!);
  res.status(201).json({ board });
}));

router.get('/:workspaceId/boards/:boardId', ...workspaceMiddleware('board:read'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const boardId = parseUuid(req.params.boardId, 'boardId');
  const board = await prisma.board.findFirst({ where: { id: boardId, workspaceId: req.workspaceId }, include: { lists: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } } });
  if (!board) throw new AppError('NOT_FOUND', 'Board not found', 404);
  res.json({ board });
}));

router.patch('/:workspaceId/boards/:boardId', ...workspaceMiddleware('board:update'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const boardId = parseUuid(req.params.boardId, 'boardId');
  const input = boardBody.partial().parse(req.body);
  const existing = await prisma.board.findFirst({ where: { id: boardId, workspaceId: req.workspaceId } });
  if (!existing) throw new AppError('NOT_FOUND', 'Board not found', 404);
  const board = await prisma.$transaction(async (tx) => {
    const updated = await tx.board.update({ where: { id: boardId }, data: input });
    await recordActivity(tx, { workspaceId: req.workspaceId!, actorId: req.userId, action: 'board.updated', entityType: 'board', entityId: boardId });
    return updated;
  });
  publishRealtime('board:updated', { workspaceId: req.workspaceId!, actorId: req.userId, data: board });
  await invalidateDashboard(req.workspaceId!);
  res.json({ board });
}));

router.delete('/:workspaceId/boards/:boardId', ...workspaceMiddleware('board:delete'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const boardId = parseUuid(req.params.boardId, 'boardId');
  const existing = await prisma.board.findFirst({ where: { id: boardId, workspaceId: req.workspaceId } });
  if (!existing) throw new AppError('NOT_FOUND', 'Board not found', 404);
  await prisma.$transaction(async (tx) => {
    await tx.board.delete({ where: { id: boardId } });
    await recordActivity(tx, { workspaceId: req.workspaceId!, actorId: req.userId, action: 'board.deleted', entityType: 'board', entityId: boardId, metadata: { name: existing.name } });
  });
  publishRealtime('board:deleted', { workspaceId: req.workspaceId!, actorId: req.userId, data: { id: boardId } });
  await invalidateDashboard(req.workspaceId!);
  res.status(204).send();
}));

router.post('/:workspaceId/boards/:boardId/lists', ...workspaceMiddleware('list:create'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const boardId = parseUuid(req.params.boardId, 'boardId');
  const input = listBody.parse(req.body);
  const board = await prisma.board.findFirst({ where: { id: boardId, workspaceId: req.workspaceId }, select: { id: true } });
  if (!board) throw new AppError('NOT_FOUND', 'Board not found', 404);
  const list = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Board" WHERE id = ${boardId}::uuid AND "workspaceId" = ${req.workspaceId!}::uuid FOR UPDATE`;
    const position = await positionForBoard(tx, boardId, req.workspaceId!, input.afterId);
    const created = await tx.list.create({ data: { workspaceId: req.workspaceId!, boardId, name: input.name, position } });
    await recordActivity(tx, { workspaceId: req.workspaceId!, actorId: req.userId, action: 'list.created', entityType: 'list', entityId: created.id });
    return created;
  });
  publishRealtime('list:created', { workspaceId: req.workspaceId!, boardId, actorId: req.userId, data: list });
  await invalidateDashboard(req.workspaceId!);
  res.status(201).json({ list });
}));

router.patch('/:workspaceId/lists/:listId', ...workspaceMiddleware('list:update'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const listId = parseUuid(req.params.listId, 'listId');
  const input = z.object({ name: workspaceName }).strict().parse(req.body);
  const existing = await prisma.list.findFirst({ where: { id: listId, workspaceId: req.workspaceId } });
  if (!existing) throw new AppError('NOT_FOUND', 'List not found', 404);
  const list = await prisma.$transaction(async (tx) => {
    const updated = await tx.list.update({ where: { id: listId }, data: input });
    await recordActivity(tx, { workspaceId: req.workspaceId!, actorId: req.userId, action: 'list.updated', entityType: 'list', entityId: listId });
    return updated;
  });
  publishRealtime('list:updated', { workspaceId: req.workspaceId!, boardId: existing.boardId, actorId: req.userId, data: list });
  await invalidateDashboard(req.workspaceId!);
  res.json({ list });
}));

router.post('/:workspaceId/lists/:listId/move', ...workspaceMiddleware('list:move'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const listId = parseUuid(req.params.listId, 'listId');
  const input = moveBody.parse(req.body);
  const existing = await prisma.list.findFirst({ where: { id: listId, workspaceId: req.workspaceId } });
  if (!existing) throw new AppError('NOT_FOUND', 'List not found', 404);
  const list = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Board" WHERE id = ${existing.boardId}::uuid AND "workspaceId" = ${req.workspaceId!}::uuid FOR UPDATE`;
    const position = await positionForBoard(tx, existing.boardId, req.workspaceId!, input.afterId === listId ? null : input.afterId);
    const updated = await tx.list.update({ where: { id: listId }, data: { position } });
    await recordActivity(tx, { workspaceId: req.workspaceId!, actorId: req.userId, action: 'list.moved', entityType: 'list', entityId: listId });
    return updated;
  });
  publishRealtime('list:moved', { workspaceId: req.workspaceId!, boardId: existing.boardId, actorId: req.userId, data: list });
  await invalidateDashboard(req.workspaceId!);
  res.json({ list });
}));

router.delete('/:workspaceId/lists/:listId', ...workspaceMiddleware('list:delete'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const listId = parseUuid(req.params.listId, 'listId');
  const existing = await prisma.list.findFirst({ where: { id: listId, workspaceId: req.workspaceId } });
  if (!existing) throw new AppError('NOT_FOUND', 'List not found', 404);
  await prisma.$transaction(async (tx) => {
    await tx.list.delete({ where: { id: listId } });
    await recordActivity(tx, { workspaceId: req.workspaceId!, actorId: req.userId, action: 'list.deleted', entityType: 'list', entityId: listId, metadata: { name: existing.name } });
  });
  publishRealtime('list:deleted', { workspaceId: req.workspaceId!, boardId: existing.boardId, actorId: req.userId, data: { id: listId } });
  await invalidateDashboard(req.workspaceId!);
  res.status(204).send();
}));

router.post('/:workspaceId/lists/:listId/tasks', ...workspaceMiddleware('task:create'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const listId = parseUuid(req.params.listId, 'listId');
  const input = taskCreateBody.parse(req.body);
  const list = await prisma.list.findFirst({ where: { id: listId, workspaceId: req.workspaceId }, select: { id: true, boardId: true } });
  if (!list) throw new AppError('NOT_FOUND', 'List not found', 404);
  await assertAssignee(req.workspaceId!, input.assigneeId);
  await assertLabels(req.workspaceId!, input.labelIds);
  const task = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "List" WHERE id = ${listId}::uuid AND "workspaceId" = ${req.workspaceId!}::uuid FOR UPDATE`;
    const position = await positionForList(tx, listId, req.workspaceId!, input.afterId);
    const created = await tx.task.create({
      data: { workspaceId: req.workspaceId!, boardId: list.boardId, listId, title: input.title, description: input.description, status: input.status, position, assigneeId: input.assigneeId, createdById: req.userId },
    });
    if (input.labelIds?.length) {
      await tx.taskLabel.createMany({
        data: input.labelIds.map((labelId) => ({ taskId: created.id, labelId, workspaceId: req.workspaceId! })),
      });
    }
    const hydrated = await tx.task.findUniqueOrThrow({ where: { id: created.id }, include: taskInclude });
    await recordActivity(tx, { workspaceId: req.workspaceId!, actorId: req.userId, action: 'task.created', entityType: 'task', entityId: created.id, metadata: { title: created.title } });
    return hydrated;
  });
  publishRealtime('task:created', { workspaceId: req.workspaceId!, boardId: list.boardId, actorId: req.userId, data: dto(task) });
  await invalidateDashboard(req.workspaceId!);
  res.status(201).json({ task: dto(task) });
}));

router.get('/:workspaceId/tasks/:taskId', ...workspaceMiddleware('task:read'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const taskId = parseUuid(req.params.taskId, 'taskId');
  const task = await prisma.task.findFirst({ where: { id: taskId, workspaceId: req.workspaceId }, include: taskInclude });
  if (!task) throw new AppError('NOT_FOUND', 'Task not found', 404);
  res.json({ task: dto(task) });
}));

router.patch('/:workspaceId/tasks/:taskId', ...workspaceMiddleware('task:update'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const taskId = parseUuid(req.params.taskId, 'taskId');
  const input = taskPatchBody.parse(req.body);
  const existing = await prisma.task.findFirst({ where: { id: taskId, workspaceId: req.workspaceId }, include: taskInclude });
  if (!existing) throw new AppError('NOT_FOUND', 'Task not found', 404);
  await assertAssignee(req.workspaceId!, input.assigneeId);
  await assertLabels(req.workspaceId!, input.labelIds);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.task.updateMany({ where: { id: taskId, workspaceId: req.workspaceId!, version: input.expectedVersion }, data: { ...(input.title !== undefined ? { title: input.title } : {}), ...(input.description !== undefined ? { description: input.description } : {}), ...(input.status !== undefined ? { status: input.status } : {}), ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}), version: { increment: 1 } } });
    if (result.count !== 1) throw new AppError('VERSION_CONFLICT', 'Task was changed by another user', 409, { current: { version: existing.version } });
    if (input.labelIds) {
      await tx.taskLabel.deleteMany({ where: { taskId, workspaceId: req.workspaceId! } });
      await tx.taskLabel.createMany({ data: input.labelIds.map((labelId) => ({ taskId, labelId, workspaceId: req.workspaceId! })) });
    }
    const hydrated = await tx.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    await recordActivity(tx, { workspaceId: req.workspaceId!, actorId: req.userId, action: 'task.updated', entityType: 'task', entityId: taskId });
    return hydrated;
  });
  publishRealtime('task:updated', { workspaceId: req.workspaceId!, boardId: existing.boardId, actorId: req.userId, data: dto(updated) });
  await invalidateDashboard(req.workspaceId!);
  res.json({ task: dto(updated) });
}));

router.post('/:workspaceId/tasks/:taskId/move', ...workspaceMiddleware('task:move'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const taskId = parseUuid(req.params.taskId, 'taskId');
  const input = taskMoveBody.parse(req.body);
  const existing = await prisma.task.findFirst({ where: { id: taskId, workspaceId: req.workspaceId } });
  if (!existing) throw new AppError('NOT_FOUND', 'Task not found', 404);
  const target = await prisma.list.findFirst({ where: { id: input.toListId, workspaceId: req.workspaceId }, select: { id: true, boardId: true } });
  if (!target) throw new AppError('NOT_FOUND', 'Target list not found', 404);
  if (target.boardId !== existing.boardId) throw new AppError('VALIDATION_ERROR', 'Cross-board moves are not supported', 400);
  const task = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "List" WHERE id = ${target.id}::uuid AND "workspaceId" = ${req.workspaceId!}::uuid FOR UPDATE`;
    const position = await positionForList(tx, target.id, req.workspaceId!, input.afterId);
    const updated = await tx.task.update({ where: { id: taskId }, data: { listId: target.id, position, version: { increment: 1 } }, include: taskInclude });
    await recordActivity(tx, { workspaceId: req.workspaceId!, actorId: req.userId, action: 'task.moved', entityType: 'task', entityId: taskId, metadata: { title: existing.title, fromListId: existing.listId, toListId: target.id } });
    return updated;
  });
  publishRealtime('task:moved', { workspaceId: req.workspaceId!, boardId: existing.boardId, actorId: req.userId, data: dto(task) });
  await invalidateDashboard(req.workspaceId!);
  res.json({ task: dto(task) });
}));

router.delete('/:workspaceId/tasks/:taskId', ...workspaceMiddleware('task:delete'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const taskId = parseUuid(req.params.taskId, 'taskId');
  const existing = await prisma.task.findFirst({ where: { id: taskId, workspaceId: req.workspaceId } });
  if (!existing) throw new AppError('NOT_FOUND', 'Task not found', 404);
  await prisma.$transaction(async (tx) => {
    await tx.task.delete({ where: { id: taskId } });
    await recordActivity(tx, { workspaceId: req.workspaceId!, actorId: req.userId, action: 'task.deleted', entityType: 'task', entityId: taskId, metadata: { title: existing.title } });
  });
  publishRealtime('task:deleted', { workspaceId: req.workspaceId!, boardId: existing.boardId, actorId: req.userId, data: { id: taskId } });
  await invalidateDashboard(req.workspaceId!);
  res.status(204).send();
}));

router.get('/:workspaceId/tasks', ...workspaceMiddleware('task:read'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const query = z.object({ boardId: uuid.optional(), listId: uuid.optional(), q: z.string().max(200).optional(), assigneeId: uuid.optional(), labelId: uuid.optional(), status: z.nativeEnum(TaskStatus).optional(), sort: z.enum(['position', 'newest']).default('newest'), limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().optional() }).parse(req.query);
  if (query.sort === 'position' && !query.listId) throw new AppError('VALIDATION_ERROR', 'listId is required for position sorting', 400);
  const cursor = decodeCursor<{ createdAt?: string; id?: string; position?: string }>(query.cursor);
  const where: Prisma.TaskWhereInput = { workspaceId: req.workspaceId, ...(query.boardId ? { boardId: query.boardId } : {}), ...(query.listId ? { listId: query.listId } : {}), ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}), ...(query.labelId ? { labels: { some: { labelId: query.labelId, workspaceId: req.workspaceId } } } : {}), ...(query.status ? { status: query.status } : {}), ...(query.q ? { OR: [{ title: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }] } : {}) };
  if (query.sort === 'position' && cursor?.position && cursor.id) where.AND = [{ OR: [{ position: { gt: cursor.position } }, { position: cursor.position, id: { gt: cursor.id } }] }];
  if (query.sort === 'newest' && cursor?.createdAt && cursor.id) where.AND = [{ OR: [{ createdAt: { lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] }];
  const tasks = await prisma.task.findMany({ where, include: taskInclude, orderBy: query.sort === 'position' ? [{ position: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 });
  const hasMore = tasks.length > query.limit;
  const items = tasks.slice(0, query.limit);
  const last = items[items.length - 1];
  res.json({ items: items.map(dto), nextCursor: hasMore && last ? encodeCursor(query.sort === 'position' ? { position: last.position, id: last.id } : { createdAt: last.createdAt.toISOString(), id: last.id }) : null });
}));

router.get('/:workspaceId/labels', ...workspaceMiddleware('label:read'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const items = await prisma.label.findMany({ where: { workspaceId: req.workspaceId }, orderBy: { name: 'asc' } });
  res.json({ items, nextCursor: null });
}));

router.post('/:workspaceId/labels', ...workspaceMiddleware('label:create'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const input = z.object({ name: workspaceName, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict().parse(req.body);
  const label = await prisma.$transaction(async (tx) => {
    const created = await tx.label.create({ data: { workspaceId: req.workspaceId!, ...input } });
    await recordActivity(tx, { workspaceId: req.workspaceId!, actorId: req.userId, action: 'label.created', entityType: 'label', entityId: created.id });
    return created;
  });
  publishRealtime('label:created', { workspaceId: req.workspaceId!, actorId: req.userId, data: label });
  await invalidateDashboard(req.workspaceId!);
  res.status(201).json({ label });
}));

router.patch('/:workspaceId/labels/:labelId', ...workspaceMiddleware('label:update'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const labelId = parseUuid(req.params.labelId, 'labelId');
  const input = z.object({ name: workspaceName.optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).strict().parse(req.body);
  const existing = await prisma.label.findFirst({ where: { id: labelId, workspaceId: req.workspaceId } });
  if (!existing) throw new AppError('NOT_FOUND', 'Label not found', 404);
  const label = await prisma.$transaction(async (tx) => {
    const updated = await tx.label.update({ where: { id: labelId }, data: input });
    await recordActivity(tx, { workspaceId: req.workspaceId!, actorId: req.userId, action: 'label.updated', entityType: 'label', entityId: labelId });
    return updated;
  });
  publishRealtime('label:updated', { workspaceId: req.workspaceId!, actorId: req.userId, data: label });
  await invalidateDashboard(req.workspaceId!);
  res.json({ label });
}));

router.delete('/:workspaceId/labels/:labelId', ...workspaceMiddleware('label:delete'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const labelId = parseUuid(req.params.labelId, 'labelId');
  const existing = await prisma.label.findFirst({ where: { id: labelId, workspaceId: req.workspaceId } });
  if (!existing) throw new AppError('NOT_FOUND', 'Label not found', 404);
  await prisma.$transaction(async (tx) => {
    await tx.label.delete({ where: { id: labelId } });
    await recordActivity(tx, { workspaceId: req.workspaceId!, actorId: req.userId, action: 'label.deleted', entityType: 'label', entityId: labelId });
  });
  publishRealtime('label:deleted', { workspaceId: req.workspaceId!, actorId: req.userId, data: { id: labelId } });
  await invalidateDashboard(req.workspaceId!);
  res.status(204).send();
}));

router.get('/:workspaceId/activity', ...workspaceMiddleware('activity:read'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const query = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(25), actorId: uuid.optional(), action: z.string().optional(), entityType: z.string().optional() }).parse(req.query);
  const cursor = decodeCursor<{ createdAt: string; id: string }>(query.cursor);
  const items = await prisma.activityLog.findMany({ where: { workspaceId: req.workspaceId, ...(query.actorId ? { actorId: query.actorId } : {}), ...(query.action ? { action: query.action } : {}), ...(query.entityType ? { entityType: query.entityType } : {}), ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] } : {}) }, include: { actor: { select: { id: true, name: true, email: true, createdAt: true, updatedAt: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 });
  const hasMore = items.length > query.limit;
  const page = items.slice(0, query.limit);
  const last = page[page.length - 1];
  res.json({ items: page, nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null });
}));

router.get('/:workspaceId/dashboard', ...workspaceMiddleware('dashboard:read'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const result = await getDashboard(req.workspaceId!);
  res.json({ ...result.dashboard, cacheHit: result.hit });
}));

export default router;

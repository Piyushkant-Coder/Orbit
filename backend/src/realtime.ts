import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { Role } from '@prisma/client';
import { prisma } from './db';
import { getEnv } from './config/env';

export type RealtimeEvent =
  | 'board:created' | 'board:updated' | 'board:deleted'
  | 'list:created' | 'list:updated' | 'list:moved' | 'list:deleted'
  | 'task:created' | 'task:updated' | 'task:moved' | 'task:deleted'
  | 'label:created' | 'label:updated' | 'label:deleted'
  | 'member:removed' | 'member:role_changed' | 'activity:created';

interface EventData {
  workspaceId: string;
  boardId?: string;
  actorId?: string;
  data: unknown;
}

let realtime: Server | undefined;

export function configureRealtime(io: Server): void {
  realtime = io;
}

export function publishRealtime(event: RealtimeEvent, payload: EventData): void {
  if (!realtime) return;
  const envelope = { ...payload, emittedAt: new Date().toISOString() };
  const isBoardEvent = event.startsWith('board:') || event.startsWith('list:') || event.startsWith('task:');
  const room = isBoardEvent && payload.boardId
    ? `board:${payload.boardId}`
    : `workspace:${payload.workspaceId}`;
  realtime.to(room).emit(event, envelope);
  realtime.to(`workspace:${payload.workspaceId}`).emit('activity:created', envelope);
}

export function evictWorkspaceMember(userId: string, workspaceId: string): void {
  const userRoom = realtime?.in(`user:${userId}`);
  if (!userRoom) return;
  userRoom.emit('member:removed', {
    workspaceId,
    actorId: undefined,
    data: { userId },
    emittedAt: new Date().toISOString(),
  });
  for (const socket of realtime?.sockets.sockets.values() ?? []) {
    if (socket.data.userId !== userId) continue;
    for (const [boardId, joinedWorkspaceId] of socket.data.joinedBoards ?? []) {
      if (joinedWorkspaceId === workspaceId) {
        void socket.leave(`board:${boardId}`);
        socket.data.joinedBoards.delete(boardId);
      }
    }
    if (socket.data.joinedWorkspaces?.has(workspaceId)) {
      void socket.leave(`workspace:${workspaceId}`);
      socket.data.joinedWorkspaces.delete(workspaceId);
    }
  }
}

export function installRealtimeHandlers(io: Server): void {
  configureRealtime(io);
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') return next(new Error('UNAUTHORIZED'));
      const decoded = jwt.verify(token, getEnv().ACCESS_TOKEN_SECRET, {
        algorithms: ['HS256'], issuer: 'workspace-api', audience: 'workspace-client',
      }) as { sub: string };
      socket.data.userId = decoded.sub;
      socket.data.joinedBoards = new Map<string, string>();
      socket.data.joinedWorkspaces = new Set<string>();
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    void socket.join(`user:${userId}`);

    socket.on('join:workspace', async (input: { workspaceId?: string }, ack?: (result: unknown) => void) => {
      const membership = input?.workspaceId
        ? await prisma.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId: input.workspaceId } } })
        : null;
      if (!membership) return ack?.({ ok: false, code: 'NOT_FOUND' });
      await socket.join(`workspace:${input.workspaceId}`);
      socket.data.joinedWorkspaces.add(input.workspaceId);
      ack?.({ ok: true, role: membership.role as Role });
    });

    socket.on('join:board', async (input: { workspaceId?: string; boardId?: string }, ack?: (result: unknown) => void) => {
      const board = input?.workspaceId && input?.boardId
        ? await prisma.board.findFirst({
          where: { id: input.boardId, workspaceId: input.workspaceId, workspace: { memberships: { some: { userId } } } },
          select: { id: true },
        })
        : null;
      if (!board) return ack?.({ ok: false, code: 'NOT_FOUND' });
      await socket.join(`workspace:${input.workspaceId}`);
      await socket.join(`board:${input.boardId}`);
      socket.data.joinedWorkspaces.add(input.workspaceId);
      socket.data.joinedBoards.set(input.boardId, input.workspaceId);
      ack?.({ ok: true });
    });

    socket.on('leave:board', async (input: { boardId?: string }, ack?: (result: unknown) => void) => {
      if (input?.boardId) {
        await socket.leave(`board:${input.boardId}`);
        socket.data.joinedBoards.delete(input.boardId);
      }
      ack?.({ ok: true });
    });
  });
}

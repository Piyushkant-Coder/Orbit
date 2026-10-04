import request from 'supertest';
import type { AddressInfo } from 'net';
import { io as createSocketClient, Socket } from 'socket.io-client';
import { app, io, prisma, server } from './index';
import { closeEmailQueue, emailQueue } from './queue/email';
import { hashToken } from './utils/tokens';

type Session = { token: string; user: { id: string; email: string }; workspaceId: string };

const password = 'correct horse battery staple';
let sequence = 0;

async function signup(email = `user-${Date.now()}-${sequence++}@example.com`, name = 'Test User'): Promise<Session> {
  const response = await request(app).post('/api/auth/signup').send({ email, name, password }).expect(201);
  const workspaces = await request(app).get('/api/workspaces').set('Authorization', `Bearer ${response.body.accessToken}`).expect(200);
  return { token: response.body.accessToken, user: response.body.user, workspaceId: workspaces.body.items[0].id };
}

function auth(session: Session) {
  return { Authorization: `Bearer ${session.token}` };
}

function connectSocket(url: string, token?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createSocketClient(url, {
      ...(token ? { auth: { token } } : {}),
      transports: ['websocket'],
      reconnection: false,
      timeout: 3000,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}

function emitAck<T>(socket: Socket, event: string, input: unknown): Promise<T> {
  return new Promise((resolve) => socket.emit(event, input, resolve));
}

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.taskLabel.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.list.deleteMany();
  await prisma.board.deleteMany();
  await prisma.label.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  await closeEmailQueue();
});

describe('health endpoints', () => {
  it('reports API, liveness, and database readiness', async () => {
    await request(app).get('/api').expect(200).expect(({ body }) => expect(body.status).toBe('ok'));
    await request(app).get('/api/health').expect(200).expect(({ body }) => expect(body.status).toBe('ok'));
    await request(app).get('/api/health/ready').expect(200).expect(({ body }) => {
      expect(body.status).toBe('ready');
      expect(body.database).toBe('ok');
      expect(['ok', 'degraded']).toContain(body.redis);
    });
  });
});

describe('authentication', () => {
  it('supports signup, login, and the authenticated me endpoint', async () => {
    const session = await signup('auth@example.com', 'Auth User');
    expect(session.user.email).toBe('auth@example.com');
    const me = await request(app).get('/api/auth/me').set(auth(session)).expect(200);
    expect(me.body.user.email).toBe('auth@example.com');
    const login = await request(app).post('/api/auth/login').send({ email: 'auth@example.com', password }).expect(200);
    expect(login.body.accessToken).toEqual(expect.any(String));
    const initialCookie = login.headers['set-cookie']?.[0].split(';')[0];
    expect(initialCookie).toBeTruthy();
    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', initialCookie!).expect(200);
    expect(refresh.body.accessToken).toEqual(expect.any(String));
    const rotatedCookie = refresh.headers['set-cookie']?.[0].split(';')[0];
    expect(rotatedCookie).toBeTruthy();
    await request(app).post('/api/auth/logout').set('Cookie', rotatedCookie!).expect(204);
    await request(app).post('/api/auth/refresh').set('Cookie', rotatedCookie!).expect(401);
  });

  it('keeps forgot-password responses non-enumerating and resets a password with a real token', async () => {
    const session = await signup('reset@example.com');
    await request(app).post('/api/auth/forgot-password').send({ email: 'reset@example.com' }).expect(200);
    const rawToken = 'a'.repeat(48);
    await prisma.passwordResetToken.create({
      data: { userId: session.user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) },
    });
    await request(app).post('/api/auth/reset-password').send({ token: rawToken, password: 'new password secure' }).expect(200);
    await request(app).post('/api/auth/reset-password').send({ token: rawToken, password: 'another secure password' }).expect(400);
    const sessions = await prisma.refreshToken.findMany({ where: { userId: session.user.id } });
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every(({ revokedAt }) => revokedAt !== null)).toBe(true);
    await request(app).post('/api/auth/login').send({ email: 'reset@example.com', password: 'new password secure' }).expect(200);
  });
});

describe('workspace tenancy and RBAC', () => {
  it('isolates workspaces and prevents a non-member from reading one', async () => {
    const owner = await signup();
    const other = await signup();
    await request(app).get(`/api/workspaces/${owner.workspaceId}`).set(auth(other)).expect(404);
    const board = await request(app).post(`/api/workspaces/${owner.workspaceId}/boards`).set(auth(owner)).send({ name: 'Private board' }).expect(201);
    expect(board.body.board.workspaceId).toBe(owner.workspaceId);
    const boards = await request(app).get(`/api/workspaces/${other.workspaceId}/boards`).set(auth(other)).expect(200);
    expect(boards.body.items).toHaveLength(0);
  });

  it('enforces member permissions after accepting an invitation', async () => {
    const owner = await signup();
    const member = await signup('member@example.com', 'Member');
    const invite = await request(app).post(`/api/workspaces/${owner.workspaceId}/invitations`).set(auth(owner))
      .send({ email: member.user.email, role: 'VIEWER' }).expect(201);
    const token = invite.body.inviteUrl.split('/').pop();
    await request(app).post(`/api/invitations/${token}/accept`).set(auth(member)).expect(201);
    await request(app).post(`/api/workspaces/${owner.workspaceId}/boards`).set(auth(member)).send({ name: 'Denied' }).expect(403);
    await request(app).get(`/api/workspaces/${owner.workspaceId}/members`).set(auth(member)).expect(200);
  });
});

describe('boards, lists, and tasks', () => {
  it('creates and reads a board, list, and task through authenticated routes', async () => {
    const owner = await signup();
    const board = await request(app).post(`/api/workspaces/${owner.workspaceId}/boards`).set(auth(owner))
      .send({ name: 'Planning', description: 'Sprint board' }).expect(201);
    const list = await request(app).post(`/api/workspaces/${owner.workspaceId}/boards/${board.body.board.id}/lists`).set(auth(owner))
      .send({ name: 'Todo' }).expect(201);
    const task = await request(app).post(`/api/workspaces/${owner.workspaceId}/lists/${list.body.list.id}/tasks`).set(auth(owner))
      .send({ title: 'Ship integration tests' }).expect(201);
    expect(task.body.task.title).toBe('Ship integration tests');
    const boardDetails = await request(app).get(`/api/workspaces/${owner.workspaceId}/boards/${board.body.board.id}`).set(auth(owner)).expect(200);
    expect(boardDetails.body.board.lists[0].id).toBe(list.body.list.id);
    await request(app).get(`/api/workspaces/${owner.workspaceId}/tasks/${task.body.task.id}`).set(auth(owner)).expect(200);
  });

  it('enforces task versions and ordering anchors, then supports search and cursor pagination', async () => {
    const owner = await signup();
    const workspacePath = `/api/workspaces/${owner.workspaceId}`;
    const board = await request(app).post(`${workspacePath}/boards`).set(auth(owner))
      .send({ name: 'Planning' }).expect(201);
    const firstList = await request(app).post(`${workspacePath}/boards/${board.body.board.id}/lists`).set(auth(owner))
      .send({ name: 'Todo' }).expect(201);
    const secondList = await request(app).post(`${workspacePath}/boards/${board.body.board.id}/lists`).set(auth(owner))
      .send({ name: 'Doing', afterId: firstList.body.list.id }).expect(201);
    const label = await request(app).post(`${workspacePath}/labels`).set(auth(owner))
      .send({ name: 'Priority', color: '#ff5500' }).expect(201);
    const task = await request(app).post(`${workspacePath}/lists/${firstList.body.list.id}/tasks`).set(auth(owner))
      .send({ title: 'Prepare release', labelIds: [label.body.label.id] }).expect(201);
    expect(task.body.task.labels).toEqual([expect.objectContaining({ id: label.body.label.id, name: 'Priority' })]);
    const anotherTask = await request(app).post(`${workspacePath}/lists/${firstList.body.list.id}/tasks`).set(auth(owner))
      .send({ title: 'Review release notes', afterId: task.body.task.id }).expect(201);
    await request(app).post(`${workspacePath}/lists/${firstList.body.list.id}/tasks`).set(auth(owner))
      .send({ title: 'Check release metrics', afterId: anotherTask.body.task.id }).expect(201);

    const updated = await request(app).patch(`${workspacePath}/tasks/${task.body.task.id}`).set(auth(owner))
      .send({ expectedVersion: task.body.task.version, title: 'Prepare Orbit release' }).expect(200);
    expect(updated.body.task.version).toBe(task.body.task.version + 1);
    const racingUpdates = await Promise.all([
      request(app).patch(`${workspacePath}/tasks/${task.body.task.id}`).set(auth(owner))
        .send({ expectedVersion: updated.body.task.version, description: 'Concurrent edit A' }),
      request(app).patch(`${workspacePath}/tasks/${task.body.task.id}`).set(auth(owner))
        .send({ expectedVersion: updated.body.task.version, description: 'Concurrent edit B' }),
    ]);
    expect(racingUpdates.map(({ status }) => status).sort()).toEqual([200, 409]);
    await request(app).patch(`${workspacePath}/tasks/${task.body.task.id}`).set(auth(owner))
      .send({ expectedVersion: task.body.task.version, title: 'Stale update' }).expect(409);

    await request(app).post(`${workspacePath}/tasks/${anotherTask.body.task.id}/move`).set(auth(owner))
      .send({ toListId: secondList.body.list.id, afterId: '00000000-0000-4000-8000-000000000000' }).expect(409);
    const moved = await request(app).post(`${workspacePath}/tasks/${anotherTask.body.task.id}/move`).set(auth(owner))
      .send({ toListId: secondList.body.list.id, afterId: null }).expect(200);
    expect(moved.body.task.listId).toBe(secondList.body.list.id);

    const searched = await request(app).get(`${workspacePath}/tasks`).query({ q: 'Orbit release', labelId: label.body.label.id })
      .set(auth(owner)).expect(200);
    expect(searched.body.items.map((item: { id: string }) => item.id)).toContain(task.body.task.id);
    const page = await request(app).get(`${workspacePath}/tasks`).query({ listId: firstList.body.list.id, sort: 'position', limit: 1 })
      .set(auth(owner)).expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.nextCursor).toEqual(expect.any(String));
  });

  it('invalidates the dashboard cache after a successful board mutation', async () => {
    const owner = await signup();
    const workspacePath = `/api/workspaces/${owner.workspaceId}`;
    await request(app).get(`${workspacePath}/dashboard`).set(auth(owner)).expect(200)
      .expect(({ body }) => {
        expect(body.boardCount).toBe(0);
        expect(body.cacheHit).toBe(false);
      });
    const cached = await request(app).get(`${workspacePath}/dashboard`).set(auth(owner)).expect(200);
    expect(cached.body.cacheHit).toBe(true);

    await request(app).post(`${workspacePath}/boards`).set(auth(owner)).send({ name: 'Fresh board' }).expect(201);
    const refreshed = await request(app).get(`${workspacePath}/dashboard`).set(auth(owner)).expect(200);
    expect(refreshed.body.boardCount).toBe(1);
    expect(refreshed.body.cacheHit).toBe(false);
  });
});

describe('invitations', () => {
  it('exposes an invitation, accepts it for the matching user, and rejects mismatched users', async () => {
    const owner = await signup();
    const invited = await signup('invited@example.com');
    const mismatch = await signup('mismatch@example.com');
    const invitation = await request(app).post(`/api/workspaces/${owner.workspaceId}/invitations`).set(auth(owner))
      .send({ email: invited.user.email, role: 'MEMBER' }).expect(201);
    const token = invitation.body.inviteUrl.split('/').pop();
    const invitationDetails = await request(app).get(`/api/invitations/${token}`).expect(200);
    expect(invitationDetails.body.email).toBe(invited.user.email);
    await request(app).post(`/api/invitations/${token}/accept`).set(auth(mismatch)).expect(403);
    await request(app).post(`/api/invitations/${token}/accept`).set(auth(invited)).expect(201);
  });
});

describe('workspace management endpoints', () => {
  it('covers workspace, member, invitation, board, list, label, task, and activity lifecycle routes', async () => {
    const owner = await signup('lifecycle-owner@example.com');
    const guest = await signup('lifecycle-guest@example.com');
    const workspacePath = `/api/workspaces/${owner.workspaceId}`;

    const createdWorkspace = await request(app).post('/api/workspaces').set(auth(owner))
      .send({ name: 'Secondary workspace' }).expect(201);
    const secondaryId = createdWorkspace.body.workspace.id as string;
    await request(app).get(`/api/workspaces/${secondaryId}`).set(auth(owner)).expect(200);
    const workspaces = await request(app).get('/api/workspaces').set(auth(owner)).expect(200);
    expect(workspaces.body.items.map((item: { id: string }) => item.id)).toContain(secondaryId);

    const invitation = await request(app).post(`${workspacePath}/invitations`).set(auth(owner))
      .send({ email: guest.user.email, role: 'MEMBER' }).expect(201);
    const initialEmailJob = await emailQueue.getJob(
      `invite-email:${invitation.body.invitation.id}:${new Date(invitation.body.invitation.createdAt).getTime()}`,
    );
    expect(initialEmailJob?.data.to).toBe(guest.user.email);
    await request(app).get(`${workspacePath}/invitations`).set(auth(owner)).expect(200)
      .expect(({ body }) => expect(body.items.map((item: { id: string }) => item.id)).toContain(invitation.body.invitation.id));
    const acceptedToken = invitation.body.inviteUrl.split('/').pop();
    await request(app).post(`/api/invitations/${acceptedToken}/accept`).set(auth(guest)).expect(201);
    await request(app).patch(`${workspacePath}/members/${guest.user.id}`).set(auth(owner))
      .send({ role: 'VIEWER' }).expect(200);
    await request(app).post(`${workspacePath}/boards`).set(auth(guest)).send({ name: 'Denied board' }).expect(403);
    await request(app).patch(`${workspacePath}/members/${guest.user.id}`).set(auth(owner))
      .send({ role: 'MEMBER' }).expect(200);

    const pending = await request(app).post(`${workspacePath}/invitations`).set(auth(owner))
      .send({ email: 'pending-lifecycle@example.com', role: 'VIEWER' }).expect(201);
    const previousToken = pending.body.inviteUrl.split('/').pop();
    const resent = await request(app).post(`${workspacePath}/invitations/${pending.body.invitation.id}/resend`)
      .set(auth(owner)).expect(200);
    const resendEmailJob = await emailQueue.getJob(
      `invite-email:${resent.body.invitation.id}:${new Date(resent.body.invitation.expiresAt).getTime()}`,
    );
    expect(resendEmailJob?.data.to).toBe('pending-lifecycle@example.com');
    const currentToken = resent.body.inviteUrl.split('/').pop();
    await request(app).get(`/api/invitations/${previousToken}`).expect(404);
    await request(app).delete(`${workspacePath}/invitations/${pending.body.invitation.id}`).set(auth(owner)).expect(204);
    await request(app).get(`/api/invitations/${currentToken}`).expect(200)
      .expect(({ body }) => expect(body.expired).toBe(true));
    await request(app).delete(`${workspacePath}/members/${guest.user.id}`).set(auth(owner)).expect(204);

    const board = await request(app).post(`${workspacePath}/boards`).set(auth(owner))
      .send({ name: 'Lifecycle board' }).expect(201);
    await request(app).patch(`${workspacePath}/boards/${board.body.board.id}`).set(auth(owner))
      .send({ name: 'Updated board' }).expect(200);
    const firstList = await request(app).post(`${workspacePath}/boards/${board.body.board.id}/lists`).set(auth(owner))
      .send({ name: 'First list' }).expect(201);
    const secondList = await request(app).post(`${workspacePath}/boards/${board.body.board.id}/lists`).set(auth(owner))
      .send({ name: 'Second list', afterId: firstList.body.list.id }).expect(201);
    await request(app).patch(`${workspacePath}/lists/${firstList.body.list.id}`).set(auth(owner))
      .send({ name: 'Renamed list' }).expect(200);
    await request(app).post(`${workspacePath}/lists/${firstList.body.list.id}/move`).set(auth(owner))
      .send({ afterId: secondList.body.list.id }).expect(200);

    const label = await request(app).post(`${workspacePath}/labels`).set(auth(owner))
      .send({ name: 'Lifecycle label', color: '#336699' }).expect(201);
    await request(app).get(`${workspacePath}/labels`).set(auth(owner)).expect(200);
    await request(app).patch(`${workspacePath}/labels/${label.body.label.id}`).set(auth(owner))
      .send({ name: 'Updated label' }).expect(200);
    const task = await request(app).post(`${workspacePath}/lists/${firstList.body.list.id}/tasks`).set(auth(owner))
      .send({ title: 'Lifecycle task', labelIds: [label.body.label.id] }).expect(201);
    await request(app).post(`${workspacePath}/tasks/${task.body.task.id}/move`).set(auth(owner))
      .send({ toListId: secondList.body.list.id, afterId: null }).expect(200);
    await request(app).get(`${workspacePath}/activity`).query({ limit: 2 }).set(auth(owner)).expect(200);
    await request(app).delete(`${workspacePath}/tasks/${task.body.task.id}`).set(auth(owner)).expect(204);
    await request(app).delete(`${workspacePath}/labels/${label.body.label.id}`).set(auth(owner)).expect(204);
    await request(app).delete(`${workspacePath}/lists/${firstList.body.list.id}`).set(auth(owner)).expect(204);
    await request(app).delete(`${workspacePath}/boards/${board.body.board.id}`).set(auth(owner)).expect(204);
  });
});

describe('realtime', () => {
  it('authenticates sockets, gates workspace joins, and delivers committed board events', async () => {
    const owner = await signup('socket-owner@example.com');
    const stranger = await signup('socket-stranger@example.com');
    const member = await signup('socket-member@example.com');
    const invitation = await request(app).post(`/api/workspaces/${owner.workspaceId}/invitations`)
      .set(auth(owner)).send({ email: member.user.email, role: 'MEMBER' }).expect(201);
    const invitationToken = invitation.body.inviteUrl.split('/').pop();
    await request(app).post(`/api/invitations/${invitationToken}/accept`).set(auth(member)).expect(201);
    const existingBoard = await request(app).post(`/api/workspaces/${owner.workspaceId}/boards`)
      .set(auth(owner)).send({ name: 'Existing board' }).expect(201);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}`;
    let ownerSocket: Socket | undefined;
    let strangerSocket: Socket | undefined;
    let memberSocket: Socket | undefined;

    try {
      await expect(connectSocket(url)).rejects.toThrow('UNAUTHORIZED');
      strangerSocket = await connectSocket(url, stranger.token);
      expect(await emitAck(strangerSocket, 'join:workspace', { workspaceId: owner.workspaceId }))
        .toEqual({ ok: false, code: 'NOT_FOUND' });
      expect(await emitAck(strangerSocket, 'join:board', {
        workspaceId: owner.workspaceId,
        boardId: existingBoard.body.board.id,
      })).toEqual({ ok: false, code: 'NOT_FOUND' });

      ownerSocket = await connectSocket(url, owner.token);
      expect(await emitAck(ownerSocket, 'join:workspace', { workspaceId: owner.workspaceId }))
        .toEqual({ ok: true, role: 'OWNER' });
      expect(await emitAck(ownerSocket, 'join:board', {
        workspaceId: owner.workspaceId,
        boardId: existingBoard.body.board.id,
      })).toEqual({ ok: true });
      memberSocket = await connectSocket(url, member.token);
      expect(await emitAck(memberSocket, 'join:board', {
        workspaceId: owner.workspaceId,
        boardId: existingBoard.body.board.id,
      })).toEqual({ ok: true });

      const eventReceived = new Promise<Record<string, unknown>>((resolve) => {
        ownerSocket?.once('board:created', resolve);
      });
      const created = await request(app).post(`/api/workspaces/${owner.workspaceId}/boards`)
        .set(auth(owner)).send({ name: 'Realtime board' }).expect(201);
      const event = await eventReceived;
      expect(event).toEqual(expect.objectContaining({
        workspaceId: owner.workspaceId,
        actorId: owner.user.id,
        data: expect.objectContaining({ id: created.body.board.id }),
        emittedAt: expect.any(String),
      }));
      expect(await prisma.board.findUnique({ where: { id: created.body.board.id } })).not.toBeNull();

      const removedEvent = new Promise<Record<string, unknown>>((resolve) => {
        memberSocket?.once('member:removed', resolve);
      });
      await request(app).delete(`/api/workspaces/${owner.workspaceId}/members/${member.user.id}`)
        .set(auth(owner)).expect(204);
      expect(await removedEvent).toEqual(expect.objectContaining({
        workspaceId: owner.workspaceId,
        data: { userId: member.user.id },
      }));
      let receivedAfterEviction = false;
      memberSocket.on('board:created', () => { receivedAfterEviction = true; });
      await request(app).post(`/api/workspaces/${owner.workspaceId}/boards`).set(auth(owner))
        .send({ name: 'After eviction' }).expect(201);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(receivedAfterEviction).toBe(false);
    } finally {
      ownerSocket?.disconnect();
      strangerSocket?.disconnect();
      memberSocket?.disconnect();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    }
  });
});

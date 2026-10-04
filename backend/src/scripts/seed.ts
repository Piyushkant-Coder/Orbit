import argon2 from 'argon2';
import { PrismaClient, Role, TaskStatus } from '@prisma/client';

const prisma = new PrismaClient();

const workspaceId = '10000000-0000-4000-8000-000000000001';
const secondWorkspaceId = '10000000-0000-4000-8000-000000000002';
const boardId = '20000000-0000-4000-8000-000000000001';
const todoListId = '30000000-0000-4000-8000-000000000001';
const doingListId = '30000000-0000-4000-8000-000000000002';
const labelId = '40000000-0000-4000-8000-000000000001';
const taskId = '50000000-0000-4000-8000-000000000001';

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seed data is disabled in production');
  }

  const password = process.env.DEMO_USER_PASSWORD || 'OrbitDemo2026!';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'owner@orbit.local' },
      update: { name: 'Olivia Owner', passwordHash },
      create: { email: 'owner@orbit.local', name: 'Olivia Owner', passwordHash },
    }),
    prisma.user.upsert({
      where: { email: 'admin@orbit.local' },
      update: { name: 'Avery Admin', passwordHash },
      create: { email: 'admin@orbit.local', name: 'Avery Admin', passwordHash },
    }),
    prisma.user.upsert({
      where: { email: 'member@orbit.local' },
      update: { name: 'Morgan Member', passwordHash },
      create: { email: 'member@orbit.local', name: 'Morgan Member', passwordHash },
    }),
    prisma.user.upsert({
      where: { email: 'viewer@orbit.local' },
      update: { name: 'Val Viewer', passwordHash },
      create: { email: 'viewer@orbit.local', name: 'Val Viewer', passwordHash },
    }),
    prisma.user.upsert({
      where: { email: 'isolation@orbit.local' },
      update: { name: 'Indigo Isolation', passwordHash },
      create: { email: 'isolation@orbit.local', name: 'Indigo Isolation', passwordHash },
    }),
  ]);
  const [owner, admin, member, viewer, isolationOwner] = users;

  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: { name: 'Orbit Demo Workspace' },
    create: { id: workspaceId, name: 'Orbit Demo Workspace' },
  });
  await prisma.workspace.upsert({
    where: { id: secondWorkspaceId },
    update: { name: 'Orbit Isolation Workspace' },
    create: { id: secondWorkspaceId, name: 'Orbit Isolation Workspace' },
  });

  for (const [user, targetWorkspaceId, role] of [
    [owner, workspaceId, Role.OWNER],
    [admin, workspaceId, Role.ADMIN],
    [member, workspaceId, Role.MEMBER],
    [viewer, workspaceId, Role.VIEWER],
    [isolationOwner, secondWorkspaceId, Role.OWNER],
  ] as const) {
    await prisma.membership.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId: targetWorkspaceId } },
      update: { role },
      create: { userId: user.id, workspaceId: targetWorkspaceId, role },
    });
  }

  await prisma.board.upsert({
    where: { id: boardId },
    update: { name: 'Product Launch Board' },
    create: { id: boardId, workspaceId, name: 'Product Launch Board', description: 'A seeded board for exploring Orbit.' },
  });
  await prisma.list.upsert({
    where: { id: todoListId },
    update: { name: 'To do', position: 'A' },
    create: { id: todoListId, workspaceId, boardId, name: 'To do', position: 'A' },
  });
  await prisma.list.upsert({
    where: { id: doingListId },
    update: { name: 'In progress', position: 'a' },
    create: { id: doingListId, workspaceId, boardId, name: 'In progress', position: 'a' },
  });
  await prisma.label.upsert({
    where: { id: labelId },
    update: { name: 'Launch', color: '#2f6b53' },
    create: { id: labelId, workspaceId, name: 'Launch', color: '#2f6b53' },
  });
  await prisma.task.upsert({
    where: { id: taskId },
    update: { title: 'Prepare the launch checklist', listId: todoListId, assigneeId: member.id },
    create: {
      id: taskId,
      workspaceId,
      boardId,
      listId: todoListId,
      title: 'Prepare the launch checklist',
      description: 'Review onboarding, docs, and release readiness.',
      status: TaskStatus.TODO,
      position: 'A',
      assigneeId: member.id,
      createdById: owner.id,
    },
  });
  await prisma.taskLabel.upsert({
    where: { taskId_labelId: { taskId, labelId } },
    update: {},
    create: { taskId, labelId, workspaceId },
  });
}

seed()
  .then(async () => {
    console.log('Demo users, workspaces, and board seeded.');
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error('Demo seed failed:', error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });

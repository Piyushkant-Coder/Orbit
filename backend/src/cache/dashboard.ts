import Redis from 'ioredis';
import { prisma } from '../db';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 200,
  lazyConnect: true,
});

redis.on('error', (error) => console.error('Dashboard cache Redis error:', error));

export interface Dashboard {
  boardCount: number;
  memberCount: number;
  tasksByStatus: unknown;
  tasksByAssignee: unknown;
  recentActivity: unknown;
}

export async function computeDashboard(workspaceId: string): Promise<Dashboard> {
  const [boards, members, counts, assignees, activity] = await Promise.all([
    prisma.board.count({ where: { workspaceId } }),
    prisma.membership.count({ where: { workspaceId } }),
    prisma.task.groupBy({ by: ['status'], where: { workspaceId }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ['assigneeId'], where: { workspaceId }, _count: { _all: true } }),
    prisma.activityLog.findMany({
      where: { workspaceId },
      include: { actor: { select: { id: true, name: true, email: true, createdAt: true, updatedAt: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
    }),
  ]);
  return { boardCount: boards, memberCount: members, tasksByStatus: counts, tasksByAssignee: assignees, recentActivity: activity };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 200): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), timeoutMs)),
  ]);
}

export async function getDashboard(workspaceId: string): Promise<{ dashboard: Dashboard; hit: boolean }> {
  try {
    if (redis.status === 'wait') await withTimeout(redis.connect());
    const version = (await withTimeout(redis.get(`ws:${workspaceId}:ver`))) ?? '0';
    const key = `dash:${workspaceId}:v${version}`;
    const cached = await withTimeout(redis.get(key));
    if (cached) return { dashboard: JSON.parse(cached) as Dashboard, hit: true };
    const dashboard = await computeDashboard(workspaceId);
    await withTimeout(redis.set(key, JSON.stringify(dashboard), 'EX', 60));
    return { dashboard, hit: false };
  } catch (error) {
    console.error('Dashboard cache unavailable; using database:', error);
    return { dashboard: await computeDashboard(workspaceId), hit: false };
  }
}

export async function invalidateDashboard(workspaceId: string): Promise<void> {
  try {
    if (redis.status === 'wait') await withTimeout(redis.connect());
    await withTimeout(redis.incr(`ws:${workspaceId}:ver`));
  } catch (error) {
    console.error('Dashboard cache invalidation failed:', error);
  }
}

export async function closeDashboardCache(): Promise<void> {
  if (redis.status === 'end') return;
  if (redis.status !== 'ready') {
    redis.disconnect();
    return;
  }
  await redis.quit();
}

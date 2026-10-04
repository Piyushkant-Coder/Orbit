import { Prisma } from '@prisma/client';

export const ACTIVITY_ACTIONS = [
  'workspace.created', 'member.added', 'member.removed', 'member.role_changed',
  'invitation.created', 'invitation.revoked', 'board.created', 'board.updated',
  'board.deleted', 'list.created', 'list.updated', 'list.moved', 'list.deleted',
  'task.created', 'task.updated', 'task.moved', 'task.deleted', 'label.created',
  'label.updated', 'label.deleted',
] as const;

export type ActivityAction = typeof ACTIVITY_ACTIONS[number];

export async function recordActivity(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    actorId?: string;
    action: ActivityAction;
    entityType: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
  }
): Promise<void> {
  await tx.activityLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? {},
    },
  });
}

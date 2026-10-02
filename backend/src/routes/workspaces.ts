import { Router } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { WorkspaceRequest, loadWorkspaceMembership, requireWorkspacePermission } from '../middleware/workspaceContext';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../utils/asyncHandler';
import { canChangeRole, canInvite, canRemove } from '../authz/permissions';
import { createOpaqueToken, hashToken } from '../utils/tokens';
import { getEnv } from '../config/env';

const router = Router();
const uuid = z.string().uuid();
const nameSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
const roleSchema = z.object({ role: z.nativeEnum(Role) }).strict();
const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), role: z.nativeEnum(Role) }).strict();

function workspaceMiddleware(action: string) {
  return [authenticate, loadWorkspaceMembership, requireWorkspacePermission(action)];
}

function publicInvitation(invitation: { id: string; email: string; role: Role; expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null; createdAt: Date }) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt: invitation.revokedAt,
    createdAt: invitation.createdAt,
  };
}

router.post('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const input = nameSchema.parse(req.body);
  const userId = req.userId!;
  const result = await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({ data: { name: input.name } });
    await tx.membership.create({ data: { userId, workspaceId: workspace.id, role: Role.OWNER } });
    await tx.activityLog.create({
      data: { workspaceId: workspace.id, actorId: userId, action: 'workspace.created', entityType: 'workspace', entityId: workspace.id },
    });
    return workspace;
  });
  res.status(201).json({ workspace: result, role: Role.OWNER });
}));

router.get('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const memberships = await prisma.membership.findMany({
    where: { userId: req.userId },
    include: { workspace: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json({
    items: memberships.map(({ workspace, role }) => ({ ...workspace, role })),
    nextCursor: null,
  });
}));

router.get('/:workspaceId', ...workspaceMiddleware('workspace:read'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const workspace = await prisma.workspace.findUnique({ where: { id: req.workspaceId } });
  if (!workspace) throw new AppError('NOT_FOUND', 'Workspace not found', 404);
  res.json({ workspace, role: req.workspaceRole });
}));

router.get('/:workspaceId/members', ...workspaceMiddleware('member:list'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const members = await prisma.membership.findMany({
    where: { workspaceId: req.workspaceId },
    include: { user: { select: { id: true, email: true, name: true, createdAt: true, updatedAt: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ items: members, nextCursor: null });
}));

router.patch('/:workspaceId/members/:userId', ...workspaceMiddleware('member:changeRole'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const targetId = uuid.parse(req.params.userId);
  if (targetId === req.userId) throw new AppError('FORBIDDEN', 'You cannot change your own role', 403);
  const { role } = roleSchema.parse(req.body);
  const target = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId: targetId, workspaceId: req.workspaceId! } } });
  if (!target) throw new AppError('NOT_FOUND', 'Member not found', 404);
  if (!canChangeRole(req.workspaceRole!, target.role, role)) throw new AppError('FORBIDDEN', 'Role change is not allowed', 403);
  const updated = await prisma.$transaction(async (tx) => {
    const member = await tx.membership.update({ where: { id: target.id }, data: { role } });
    await tx.activityLog.create({
      data: {
        workspaceId: req.workspaceId!, actorId: req.userId, action: 'member.role_changed', entityType: 'member', entityId: targetId,
        metadata: { userId: targetId, from: target.role, to: role },
      },
    });
    return member;
  });
  res.json({ member: updated });
}));

router.delete('/:workspaceId/members/:userId', ...workspaceMiddleware('member:remove'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const targetId = uuid.parse(req.params.userId);
  if (targetId === req.userId) throw new AppError('FORBIDDEN', 'You cannot remove yourself', 403);
  const target = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId: targetId, workspaceId: req.workspaceId! } } });
  if (!target) throw new AppError('NOT_FOUND', 'Member not found', 404);
  if (!canRemove(req.workspaceRole!, target.role)) throw new AppError('FORBIDDEN', 'Member removal is not allowed', 403);
  await prisma.$transaction(async (tx) => {
    await tx.membership.delete({ where: { id: target.id } });
    await tx.task.updateMany({ where: { workspaceId: req.workspaceId!, assigneeId: targetId }, data: { assigneeId: null } });
    await tx.activityLog.create({
      data: { workspaceId: req.workspaceId!, actorId: req.userId, action: 'member.removed', entityType: 'member', entityId: targetId },
    });
  });
  res.status(204).send();
}));

router.post('/:workspaceId/invitations', ...workspaceMiddleware('invitation:create'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const input = inviteSchema.parse(req.body);
  if (!canInvite(req.workspaceRole!, input.role)) throw new AppError('FORBIDDEN', 'You cannot invite that role', 403);
  const existingMember = await prisma.membership.findFirst({ where: { workspaceId: req.workspaceId!, user: { email: input.email } } });
  if (existingMember) throw new AppError('CONFLICT', 'That email is already a workspace member', 409);
  const rawToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invitation = await prisma.$transaction(async (tx) => {
    await tx.invitation.updateMany({
      where: { workspaceId: req.workspaceId!, email: input.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const created = await tx.invitation.create({
      data: { workspaceId: req.workspaceId!, email: input.email, role: input.role, tokenHash: hashToken(rawToken), invitedById: req.userId, expiresAt },
    });
    await tx.activityLog.create({
      data: { workspaceId: req.workspaceId!, actorId: req.userId, action: 'invitation.created', entityType: 'invitation', entityId: created.id },
    });
    return created;
  });
  res.status(201).json({
    invitation: publicInvitation(invitation),
    inviteUrl: `${getEnv().APP_BASE_URL}/invite/${rawToken}`,
  });
}));

router.get('/:workspaceId/invitations', ...workspaceMiddleware('invitation:list'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const invitations = await prisma.invitation.findMany({
    where: { workspaceId: req.workspaceId!, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: invitations.map(publicInvitation), nextCursor: null });
}));

router.post('/:workspaceId/invitations/:invitationId/resend', ...workspaceMiddleware('invitation:resend'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const invitationId = uuid.parse(req.params.invitationId);
  const existing = await prisma.invitation.findFirst({
    where: { id: invitationId, workspaceId: req.workspaceId!, acceptedAt: null, revokedAt: null },
  });
  if (!existing) throw new AppError('NOT_FOUND', 'Invitation not found', 404);
  const rawToken = createOpaqueToken();
  const invitation = await prisma.$transaction(async (tx) => {
    const updated = await tx.invitation.update({
      where: { id: invitationId },
      data: { tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    await tx.activityLog.create({
      data: { workspaceId: req.workspaceId!, actorId: req.userId, action: 'invitation.created', entityType: 'invitation', entityId: invitationId },
    });
    return updated;
  });
  res.json({ invitation: publicInvitation(invitation), inviteUrl: `${getEnv().APP_BASE_URL}/invite/${rawToken}` });
}));

router.delete('/:workspaceId/invitations/:invitationId', ...workspaceMiddleware('invitation:revoke'), asyncHandler(async (req: WorkspaceRequest, res) => {
  const invitationId = uuid.parse(req.params.invitationId);
  const invitation = await prisma.invitation.findFirst({ where: { id: invitationId, workspaceId: req.workspaceId!, acceptedAt: null, revokedAt: null } });
  if (!invitation) throw new AppError('NOT_FOUND', 'Invitation not found', 404);
  await prisma.$transaction([
    prisma.invitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } }),
    prisma.activityLog.create({
      data: { workspaceId: req.workspaceId!, actorId: req.userId, action: 'invitation.revoked', entityType: 'invitation', entityId: invitationId },
    }),
  ]);
  res.status(204).send();
}));

export default router;

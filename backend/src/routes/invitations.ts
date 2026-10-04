import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../utils/asyncHandler';
import { hashToken } from '../utils/tokens';
import { invalidateDashboard } from '../cache/dashboard';

const router = Router();
const tokenSchema = z.string().min(40).max(100);

router.get('/:token', asyncHandler(async (req, res) => {
  const token = tokenSchema.parse(req.params.token);
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { workspace: true },
  });
  if (!invitation) throw new AppError('NOT_FOUND', 'Invitation not found', 404);
  res.json({
    workspaceName: invitation.workspace.name,
    email: invitation.email,
    role: invitation.role,
    expired: invitation.expiresAt <= new Date() || Boolean(invitation.revokedAt || invitation.acceptedAt),
  });
}));

router.post('/:token/accept', authenticate, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const token = tokenSchema.parse(req.params.token);
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invitation) throw new AppError('NOT_FOUND', 'Invitation not found', 404);
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });
  if (!user) throw new AppError('UNAUTHENTICATED', 'User no longer exists', 401);
  if (invitation.email !== user.email) throw new AppError('INVITATION_EMAIL_MISMATCH', 'Invitation email does not match the authenticated user', 403);
  if (invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) throw new AppError('CONFLICT', 'Invitation is no longer valid', 409);
  await prisma.$transaction(async (tx) => {
    await tx.membership.upsert({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId: invitation.workspaceId } },
      update: {},
      create: { userId: req.userId!, workspaceId: invitation.workspaceId, role: invitation.role },
    });
    await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
    await tx.activityLog.create({
      data: { workspaceId: invitation.workspaceId, actorId: req.userId, action: 'member.added', entityType: 'member', entityId: req.userId },
    });
  });
  await invalidateDashboard(invitation.workspaceId);
  res.status(201).json({ workspaceId: invitation.workspaceId, role: invitation.role });
}));

export default router;

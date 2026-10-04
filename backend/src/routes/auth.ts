import { Router, Response } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { Role } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../middleware/errorHandler';
import { AuthenticatedRequest, authenticate } from '../middleware/authenticate';
import { asyncHandler } from '../utils/asyncHandler';
import { createAccessToken, createOpaqueToken, hashToken } from '../utils/tokens';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../utils/cookies';
import { getEnv } from '../config/env';
import { enqueuePasswordResetEmail } from '../queue/email';

const router = Router();
const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(10).max(128),
}).strict();
const loginSchema = signupSchema.pick({ email: true, password: true }).strict();
const passwordResetRequestSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict();
const passwordResetSchema = z.object({ token: z.string().min(40).max(200), password: z.string().min(10).max(128) }).strict();

function userDto(user: { id: string; email: string; name: string; createdAt: Date; updatedAt: Date }) {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt, updatedAt: user.updatedAt };
}

async function issueRefreshToken(userId: string, familyId = randomUUID()) {
  const rawToken = createOpaqueToken();
  const token = await prisma.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + getEnv().REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });
  return { rawToken, token };
}

router.post('/signup', asyncHandler(async (req, res) => {
  const input = signupSchema.parse(req.body);
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash },
      });
      const workspace = await tx.workspace.create({ data: { name: `${input.name}'s Workspace` } });
      await tx.membership.create({
        data: { userId: user.id, workspaceId: workspace.id, role: Role.OWNER },
      });
      await tx.activityLog.create({
        data: { workspaceId: workspace.id, actorId: user.id, action: 'workspace.created', entityType: 'workspace', entityId: workspace.id },
      });
      return user;
    });
    const { rawToken } = await issueRefreshToken(result.id);
    setRefreshCookie(res, rawToken);
    res.status(201).json({ accessToken: createAccessToken(result.id), user: userDto(result) });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      throw new AppError('CONFLICT', 'An account with that email already exists', 409);
    }
    throw error;
  }
}));

router.post('/login', asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const valid = user ? await argon2.verify(user.passwordHash, input.password) : await argon2.hash(input.password);
  if (!user || !valid) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }
  const { rawToken } = await issueRefreshToken(user.id);
  setRefreshCookie(res, rawToken);
  res.json({ accessToken: createAccessToken(user.id), user: userDto(user) });
}));

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const input = passwordResetRequestSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (user) {
    const rawToken = createOpaqueToken();
    await prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    await enqueuePasswordResetEmail({
      type: 'password-reset',
      to: user.email,
      userName: user.name,
      resetUrl: `${getEnv().APP_BASE_URL}/reset-password?token=${encodeURIComponent(rawToken)}`,
    });
  }
  res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const input = passwordResetSchema.parse(req.body);
  const tokenHash = hashToken(input.token);
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const result = await prisma.$transaction(async (tx) => {
    const resetToken = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) return false;
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: resetToken.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
    await tx.refreshToken.updateMany({ where: { userId: resetToken.userId }, data: { revokedAt: new Date() } });
    return true;
  });
  if (!result) throw new AppError('RESET_INVALID', 'This password reset link is invalid or expired', 400);
  res.json({ message: 'Password reset successfully' });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const rawToken = readRefreshCookie(req);
  if (!rawToken) {
    clearRefreshCookie(res);
    throw new AppError('REFRESH_INVALID', 'Refresh token is invalid', 401);
  }
  const tokenHash = hashToken(rawToken);
  const env = getEnv();
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.refreshToken.findUnique({ where: { tokenHash } });
    if (!current || current.revokedAt || current.expiresAt <= new Date()) {
      return { kind: 'invalid' as const };
    }
    const claimed = await tx.refreshToken.updateMany({
      where: { id: current.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      const withinGrace = current.usedAt && Date.now() - current.usedAt.getTime() <= env.REFRESH_REUSE_GRACE_SECONDS * 1000;
      if (withinGrace) return { kind: 'retry' as const };
      await tx.refreshToken.updateMany({ where: { familyId: current.familyId }, data: { revokedAt: new Date() } });
      return { kind: 'invalid' as const };
    }
    const nextRaw = createOpaqueToken();
    const next = await tx.refreshToken.create({
      data: {
        userId: current.userId,
        familyId: current.familyId,
        tokenHash: hashToken(nextRaw),
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });
    await tx.refreshToken.update({ where: { id: current.id }, data: { replacedById: next.id } });
    return { kind: 'success' as const, userId: current.userId, nextRaw };
  });
  if (result.kind === 'retry') throw new AppError('REFRESH_RETRY', 'Refresh already completed in another request', 401);
  if (result.kind === 'invalid') {
    clearRefreshCookie(res);
    throw new AppError('REFRESH_INVALID', 'Refresh token is invalid', 401);
  }
  setRefreshCookie(res, result.nextRaw);
  res.json({ accessToken: createAccessToken(result.userId) });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const rawToken = readRefreshCookie(req);
  if (rawToken) {
    const token = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (token) await prisma.refreshToken.updateMany({ where: { familyId: token.familyId }, data: { revokedAt: new Date() } });
  }
  clearRefreshCookie(res);
  res.status(204).send();
}));

router.get('/me', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    include: { memberships: { include: { workspace: true } } },
  });
  if (!user) throw new AppError('UNAUTHENTICATED', 'User no longer exists', 401);
  res.json({
    user: userDto(user),
    memberships: user.memberships.map((membership) => ({
      workspaceId: membership.workspaceId,
      workspaceName: membership.workspace.name,
      role: membership.role,
    })),
  });
}));

export default router;

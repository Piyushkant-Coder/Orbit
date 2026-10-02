import { Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from './errorHandler';
import { AuthenticatedRequest } from './authenticate';
import { requirePermission } from '../authz/permissions';
import { z } from 'zod';

export interface WorkspaceRequest extends AuthenticatedRequest {
  workspaceId?: string;
  workspaceRole?: Role;
}

export function loadWorkspaceMembership(
  req: WorkspaceRequest,
  _res: Response,
  next: NextFunction
): void {
  const workspaceId = req.params.workspaceId;
  if (!workspaceId || !z.string().uuid().safeParse(workspaceId).success) {
    next(new AppError('VALIDATION_ERROR', 'workspaceId must be a valid UUID', 400));
    return;
  }
  if (!workspaceId || !req.userId) {
    next(new AppError('NOT_FOUND', 'Workspace not found', 404));
    return;
  }

  prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: req.userId, workspaceId } },
  }).then((membership) => {
    if (!membership) {
      next(new AppError('NOT_FOUND', 'Workspace not found', 404));
      return;
    }
    req.workspaceId = workspaceId;
    req.workspaceRole = membership.role;
    next();
  }).catch(next);
}

export function requireWorkspacePermission(action: string) {
  return (req: WorkspaceRequest, _res: Response, next: NextFunction): void => {
    if (!req.workspaceRole) {
      next(new AppError('NOT_FOUND', 'Workspace not found', 404));
      return;
    }
    try {
      requirePermission(req.workspaceRole, action);
      next();
    } catch (error) {
      next(error);
    }
  };
}

import { Role } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

export const PERMISSION_MATRIX: Record<string, Set<Role>> = {
  // Read actions (all roles)
  'workspace:read': new Set([Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER]),
  'member:list': new Set([Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER]),
  'board:read': new Set([Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER]),
  'task:read': new Set([Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER]),
  'label:read': new Set([Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER]),
  'activity:read': new Set([Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER]),
  'dashboard:read': new Set([Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER]),

  // Write actions (OWNER, ADMIN, MEMBER)
  'task:create': new Set([Role.OWNER, Role.ADMIN, Role.MEMBER]),
  'task:update': new Set([Role.OWNER, Role.ADMIN, Role.MEMBER]),
  'task:move': new Set([Role.OWNER, Role.ADMIN, Role.MEMBER]),
  'task:delete': new Set([Role.OWNER, Role.ADMIN, Role.MEMBER]),
  'list:create': new Set([Role.OWNER, Role.ADMIN, Role.MEMBER]),
  'list:update': new Set([Role.OWNER, Role.ADMIN, Role.MEMBER]),
  'list:move': new Set([Role.OWNER, Role.ADMIN, Role.MEMBER]),

  // Admin actions (OWNER, ADMIN)
  'list:delete': new Set([Role.OWNER, Role.ADMIN]),
  'board:create': new Set([Role.OWNER, Role.ADMIN]),
  'board:update': new Set([Role.OWNER, Role.ADMIN]),
  'board:delete': new Set([Role.OWNER, Role.ADMIN]),
  'label:update': new Set([Role.OWNER, Role.ADMIN]),
  'label:delete': new Set([Role.OWNER, Role.ADMIN]),

  // Invitation & member actions (OWNER, ADMIN)
  'invitation:create': new Set([Role.OWNER, Role.ADMIN]),
  'invitation:list': new Set([Role.OWNER, Role.ADMIN]),
  'invitation:revoke': new Set([Role.OWNER, Role.ADMIN]),
  'invitation:resend': new Set([Role.OWNER, Role.ADMIN]),
  'member:remove': new Set([Role.OWNER, Role.ADMIN]),
  'member:changeRole': new Set([Role.OWNER, Role.ADMIN]),

  // Label creation (OWNER, ADMIN, MEMBER)
  'label:create': new Set([Role.OWNER, Role.ADMIN, Role.MEMBER]),
};

export function requirePermission(role: Role, action: string): void {
  const allowedRoles = PERMISSION_MATRIX[action];

  if (!allowedRoles || !allowedRoles.has(role)) {
    throw new AppError('FORBIDDEN', `Permission denied for action: ${action}`, 403);
  }
}

export function canInvite(actorRole: Role, inviteRole: Role): boolean {
  if (inviteRole === Role.OWNER) {
    return false; // Nobody can invite an OWNER
  }

  if (actorRole === Role.OWNER) {
    return true; // OWNER can invite anyone except OWNER
  }

  if (actorRole === Role.ADMIN) {
    return inviteRole === Role.MEMBER || inviteRole === Role.VIEWER;
  }

  return false;
}

export function canRemove(actorRole: Role, targetRole: Role): boolean {
  if (targetRole === Role.OWNER) {
    return false; // OWNER can never be removed
  }

  if (actorRole === Role.OWNER) {
    return true; // OWNER can remove anyone except themselves
  }

  if (actorRole === Role.ADMIN) {
    return targetRole === Role.MEMBER || targetRole === Role.VIEWER;
  }

  return false;
}

export function canChangeRole(
  actorRole: Role,
  targetCurrentRole: Role,
  newRole: Role
): boolean {
  if (newRole === Role.OWNER || targetCurrentRole === Role.OWNER) {
    return false; // Cannot assign or change OWNER
  }

  if (actorRole === Role.OWNER) {
    return true; // OWNER can change anyone's role
  }

  if (actorRole === Role.ADMIN) {
    // ADMIN can only change non-ADMIN roles to MEMBER or VIEWER
    if (targetCurrentRole === Role.ADMIN) {
      return false;
    }
    return newRole === Role.MEMBER || newRole === Role.VIEWER;
  }

  return false;
}

import { Role } from '@prisma/client';
import { canChangeRole, canInvite, canRemove, requirePermission } from './permissions';

describe('permission matrix', () => {
  it('allows read actions for every role', () => {
    for (const role of Object.values(Role)) {
      expect(() => requirePermission(role, 'workspace:read')).not.toThrow();
    }
  });

  it('does not allow viewers to mutate tasks', () => {
    expect(() => requirePermission(Role.VIEWER, 'task:update')).toThrow();
    expect(() => requirePermission(Role.MEMBER, 'task:update')).not.toThrow();
  });

  it('limits invitations by actor role', () => {
    expect(canInvite(Role.OWNER, Role.ADMIN)).toBe(true);
    expect(canInvite(Role.ADMIN, Role.ADMIN)).toBe(false);
    expect(canInvite(Role.ADMIN, Role.MEMBER)).toBe(true);
    expect(canInvite(Role.OWNER, Role.OWNER)).toBe(false);
  });

  it('protects owners and self-management is handled by routes', () => {
    expect(canRemove(Role.OWNER, Role.OWNER)).toBe(false);
    expect(canRemove(Role.ADMIN, Role.ADMIN)).toBe(false);
    expect(canChangeRole(Role.OWNER, Role.OWNER, Role.ADMIN)).toBe(false);
    expect(canChangeRole(Role.ADMIN, Role.MEMBER, Role.ADMIN)).toBe(false);
    expect(canChangeRole(Role.ADMIN, Role.MEMBER, Role.VIEWER)).toBe(true);
  });
});

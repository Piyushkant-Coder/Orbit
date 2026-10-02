# Phase 2 Report: Authentication and Tenancy

## Built

- Argon2id signup and login with normalized email addresses.
- HS256 access tokens with issuer, audience, expiry, and no role claims.
- Opaque refresh-token cookies with SHA-256 storage, rotation, family revocation, reuse detection, and a 10-second grace window.
- Logout that revokes the refresh-token family and clears the cookie.
- `/api/auth/me` with current memberships and roles.
- Workspace creation/listing/reading.
- Database-backed membership loading on every workspace request.
- Server-side permission enforcement for member and invitation operations.
- Member role changes and removals with owner protection, self-management protection, assignee cleanup, and activity logs.
- Invitation creation, listing, revocation, public inspection, resend, and authenticated acceptance.
- Zod strict request validation and authentication rate limiting.
- Prisma migration plus raw SQL constraints for one owner per workspace and no owner invitations.
- Focused permission unit tests.

## Gate results

- Backend build: passed.
- Backend lint: passed with existing bootstrap `console` warnings.
- Permission tests: 4 passed.
- Prisma migration: applied successfully to local PostgreSQL.
- Docker Compose services: PostgreSQL, Redis, backend, and frontend running.
- Auth smoke test: signup, `/me`, workspace listing, and refresh passed.
- Workspace smoke test: workspace creation, member listing, invitation creation, and public invitation inspection passed.
- Database constraint verification: one-owner index and invitation role check present.

## Decisions

- A signup creates one initial workspace and owner membership so the API is immediately usable.
- Invitation email delivery remains a Phase 2 best-effort stub; BullMQ processing is implemented in Phase 5.
- Refresh reuse within the configured grace period returns `REFRESH_RETRY`; reuse after the grace period revokes the complete family.

## Not done

- Full invitation email queue/worker.
- Complete integration test matrix against isolated test databases.
- Boards, lists, tasks, realtime mutation events, cache, and background processing.

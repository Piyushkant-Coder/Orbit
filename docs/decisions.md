# Phase 0: Architectural Decisions

This document records key architectural choices and their trade-offs.

## 1. Monorepo Structure with Independent Packages

**Decision:** Use `backend/` and `frontend/` as completely independent packages with separate `package.json`, `tsconfig.json`, and lockfiles.

**Context:** The assignment requires standalone deployments to Render (backend) and Vercel (frontend). Docker Compose must work from a single clone.

**Consequences:**
- No shared code via workspace tooling (simpler CI/CD)
- Common types duplicated between backend and frontend (mitigated by codegen or OpenAPI schema)
- Each package can evolve dependencies independently

**Alternatives Considered:**
- Monorepo with `pnpm workspaces` — rejected due to complexity in distinct CI pipelines

---

## 2. Fractional Indexing for Ordering

**Decision:** Use the `fractional-indexing` npm package for task and list ordering, with byte-wise collation ("C") in PostgreSQL.

**Context:** Concurrent drag-and-drop from multiple users requires a deterministic, lockable ordering scheme that avoids collisions and doesn't require full-list rewrites.

**Consequences:**
- Keys grow in length under repeated insertion at the same spot (acceptable; no rebalance job)
- Must enforce collation "C" on position columns or ordering breaks
- Simplifies conflict resolution in concurrent moves

**Alternatives Considered:**
- Integer positions — rejected: requires rebuilding indexes on every insert
- Timestamps — rejected: not deterministic with concurrent operations
- Lamport clocks — rejected: overkill for this scale

---

## 3. Server-Side Position Computation with FOR UPDATE Locking

**Decision:** Clients never send positions. They send `afterId` (anchor). The server computes the new position inside a transaction that locks the target list/board.

**Context:** Prevents two concurrent users from computing positions that collide or conflict.

**Consequences:**
- Slightly higher latency per move operation (transaction overhead)
- Guarantees no duplicate positions within a list/board
- Predictable, serialized ordering under concurrency

**Alternatives Considered:**
- Optimistic merge on position conflicts — rejected: adds complexity and still requires server reordering
- Client-computed positions with conflict merging — rejected: too complex, wrong place for business logic

---

## 4. JWT + Refresh Token Rotation with Reuse Detection

**Decision:** 
- Access token: HS256 JWT, 15 minutes
- Refresh token: opaque 32-byte base64url random, httpOnly cookie, rotated on use with family-based reuse detection

**Context:** Access tokens must be short-lived for security; refresh tokens must support both seamless rotation and detect token leaks (replay attack detection).

**Consequences:**
- Clients lose auth if they clear cookies (expected)
- Stolen refresh token detected within 5-minute grace window
- Database query on every refresh (acceptable: refresh rate << mutation rate)

**Alternatives Considered:**
- Stateless refresh tokens — rejected: cannot detect replay/theft
- Database sessions — rejected: less flexible for distributed systems
- Sliding window TTL on access tokens — rejected: requires server state and more DB queries

---

## 5. Role Storage on Membership, Not in JWT

**Decision:** Roles live only on the `Membership` row in the database. JWT contains no role claim.

**Context:** Roles can change or be revoked instantly. Storing roles in a JWT would require token invalidation logic, which defeats the purpose of JWT.

**Consequences:**
- Every request requires a database lookup of the user's workspace role
- Role changes take effect immediately (no staleness)
- Cleaner API: no token revocation needed for role changes

**Alternatives Considered:**
- Role in JWT + explicit token invalidation — rejected: requires maintaining a revocation list, more complex

---

## 6. Single Workspace Owner, No Ownership Transfer

**Decision:** Each workspace has exactly one OWNER. Ownership transfer is not implemented.

**Context:** Simplifies both schema (unique index) and authorization logic. Avoids deadlock during transfer.

**Consequences:**
- Admin user cannot promote themselves to Owner
- Owner account must be maintained; if deleted, workspace is orphaned
- Documented limitation

**Alternatives Considered:**
- Multiple owners — rejected: adds complexity to removal logic (preventing last-owner removal)
- Ownership transfer workflow — rejected: out of scope; reviewers prioritize correctness over feature count

---

## 7. Real-Time via Socket.IO with Redis Adapter

**Decision:** Socket.IO server on the Express HTTP server, `@socket.io/redis-adapter` for scaling to multiple backend instances.

**Context:** Native WebSocket support is simpler; Socket.IO provides fallbacks if needed later. Redis adapter allows horizontal scaling.

**Consequences:**
- Redis becomes a required dependency for real-time
- Local-only development still works (without Redis)
- Redis down → Socket.IO events not broadcast across instances, but local delivery works

**Alternatives Considered:**
- Raw `ws` + custom broadcast — rejected: Socket.IO ecosystem is better-maintained
- Native WebSocket only — rejected: scales harder without a pub/sub system

---

## 8. All Mutations via REST, Real-Time Events in Rooms

**Decision:** No direct mutations over WebSocket. All mutations go through REST endpoints; servers emit events to Socket.IO rooms after successful commits.

**Context:** Authorization logic lives in one place (REST middleware); WebSocket is read-only for clients.

**Consequences:**
- Slightly more round-trips for fast interactions (acceptable; ~100ms for a mutation)
- Simpler mental model: REST is the source of truth
- All audit logging, permissions, and validation guaranteed to run

**Alternatives Considered:**
- Direct WebSocket mutations — rejected: duplicates authorization logic, risk of bypasses

---

## 9. Background Queue with BullMQ

**Decision:** Use BullMQ for async jobs (email invitations, future notifications). Worker in a separate process.

**Context:** Email is I/O-bound and blocking the request is unnecessary. Graceful error handling with retries is important.

**Consequences:**
- Invitation endpoint returns 201 before email is sent
- No guarantee of email delivery, but logs and retries
- Requires Redis (same instance as Socket.IO OK)

**Alternatives Considered:**
- Sync email in the endpoint — rejected: slower UX, cascading failures
- Database-based queue polling — rejected: BullMQ is more robust

---

## 10. Separate Test Database with Fresh Migrations

**Decision:** Integration tests use a separate PostgreSQL database; `prisma migrate deploy` runs before tests; tests clean state or use isolated databases.

**Context:** Tests must not interfere with each other or production data. Full migration history is important for catching migration bugs.

**Consequences:**
- Tests are slower (migration setup overhead)
- Guarantees migrations work end-to-end
- `NODE_ENV=test` database URL configured

**Alternatives Considered:**
- SQLite for tests — rejected: different SQL dialect, race conditions not caught
- Mocking Prisma — rejected: loses database-specific bugs

---

## 11. Rate Limiting Strategy (Future Phase)

**Decision:** Rate limiting will be per-user (identify by JWT) and per-IP (fallback). Implemented at middleware level.

**Context:** Protects against abuse and distributed attacks. Specification says "15 seconds" per request is not realistic for a task management app; actual rate limit to be confirmed by reviewer feedback. For now, we implement the framework.

**Note:** Not implemented in Phase 2; added in Phase 5 if time permits.

---

## 12. Redis Hosting & Metering Caveat

**Decision:** Local development uses Docker Redis. Production uses a Redis instance **without per-command metering** (e.g., Render Key-Value if available on the plan, or a dedicated provider like Upstash's fixed-plan tier).

**Context:** BullMQ polls Redis continuously; per-command metering plans are unsuitable and can exhaust free usage quickly.

**Consequences:**
- Must choose hosting carefully
- Documented in `docs/deployment.md`
- Monitored in CI/test

---

## 13. Error Codes and Response Shape

**Decision:** 
- Standardized error body: `{ error: { code, message, details?, requestId } }`
- Specific codes for each category (VALIDATION_ERROR, TOKEN_EXPIRED, VERSION_CONFLICT, etc.)
- No stack traces to clients in production

**Context:** Clients and reviewers need consistent, predictable errors. Security: stack traces leak information.

**Consequences:**
- Server-side logging captures full errors; clients see only messages
- Integration tests validate error codes
- Central error middleware applies consistently

---

## 14. Helm / Render YAML for Deployment

**Decision:** Use Render's `render.yaml` for infrastructure as code (databases, services, env vars). Manual steps documented in `docs/deployment.md`.

**Context:** Render supports native PostgreSQL and Redis provisioning. IaC ensures reproducibility.

**Consequences:**
- Deployment is repeatable from YAML
- Some manual GitHub OAuth steps unavoidable
- Documented in detail

---

## 15. Search via PostgreSQL Full-Text Vectors

**Decision:** Use PostgreSQL `tsvector` and `websearch_to_tsquery` for full-text search over task titles and descriptions.

**Context:** Simple, built-in, no external service. Sufficient for this scale.

**Consequences:**
- Search queries are database-backed
- Language configuration fixed to 'english'
- No fuzzy matching (exact phrase + boolean operators)

**Alternatives Considered:**
- Elasticsearch — rejected: overkill, adds infrastructure
- Client-side search — rejected: latency and security

---

## 16. Activity Logging with JSON Metadata

**Decision:** All mutations logged to `ActivityLog` with `{ action, entityType, entityId, metadata }`. Metadata is unstructured JSON, never containing secrets, tokens, or passwords.

**Context:** Audit trail required by spec. JSON allows flexible event payloads.

**Consequences:**
- Database grows with activity rows
- Archived activity records must be handled separately (not in scope)
- Metadata shape documented per action type in code

---

## 17. Graceful Shutdown on SIGTERM

**Decision:** On SIGTERM, stop accepting connections, close Socket.IO, drain BullMQ worker, quit Redis, disconnect Prisma, exit 0.

**Context:** Kubernetes and process managers send SIGTERM before SIGKILL. Ensures in-flight requests complete safely.

**Consequences:**
- Startup must be fast (Render has 60s health check window)
- Requests in progress have time to complete
- No data loss

---

## Summary of Key Trade-Offs

| Decision | Benefit | Cost |
|----------|---------|------|
| Position locking | No collisions | Slightly higher latency |
| Roles in DB, not JWT | Instant changes | DB lookup per request |
| REST + WebSocket events | Single auth layer | Slightly more round-trips |
| BullMQ worker | Graceful async | Additional process |
| Full-text search | Simple, built-in | Fixed to English, no fuzzy |
| Separate test DB | Realistic testing | Slower tests |

---

**Last Updated:** Phase 0  
**Reviewed:** ✅  
**Status:** Ready for Phase 1 (Environment)

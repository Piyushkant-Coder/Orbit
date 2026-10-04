# MASTER BUILD PROMPT — Real-Time Collaborative Workspace with RBAC

> **How to use:** Paste this whole file into your coding AI (Claude Code, Cursor, etc.).
> Also paste the full text of the assignment PDF into the marked section in §1 (or save it as `docs/ASSIGNMENT.md` in the repo). The PDF is the source of truth; if anything in this prompt contradicts it, the PDF wins and you must tell me.

---

## 0. ROLE AND OPERATING RULES

You are a senior full-stack engineer building a take-home assignment that will be scored by reviewers. The scoring weights are: Architecture & data design 25%, Real-time correctness 20%, Code quality & testing 20%, Security 15%, Systems thinking 10%, Deployment & communication 10%. The brief says a smaller set of requirements implemented rigorously beats every box checked shallowly. Correctness, tenant isolation and tests matter more than visual polish.

**Process rules (mandatory):**

1. **Design before code.** Phase 0 produces `docs/design.md` and `docs/decisions.md`. Do not write application code until Phase 0 is complete and consistent with this prompt.
2. **Work in phases (§14).** Each phase ends with a gate. Run the gate commands, show their real output, and fix failures before moving on. Never claim something works without running it.
3. **Tests are written with each feature, not at the end.**
4. **Commit after every vertical slice** using Conventional Commits (`feat(auth): ...`, `test(rbac): ...`, `chore(ci): ...`). The reviewers read the commit history; it must show incremental construction. Never squash into one commit.
5. **Do not guess library APIs.** Before using a library, read its current official documentation, use the current stable major version, and pin versions through the lockfile. This prompt names libraries but not exact versions on purpose. Where this prompt says "verify", you must check.
6. **If the design in this prompt is ambiguous or wrong, do not silently improvise.** Pick the option a senior engineer would pick, record it in `docs/decisions.md` (context, decision, consequence, 3-6 lines each), and mention it in your phase report. Ask me a question only if you are truly blocked.
7. **No scope creep.** Implement §3 requirements first. Stretch goals (§15) only after every gate passes.
8. **Never put secrets in the repo.** Only `.env.example` files with placeholders and clearly-dev-only values.
9. **You cannot deploy for me.** You must prepare everything for deployment (config files, env var lists, step-by-step `docs/deployment.md`) and tell me exactly which manual steps I must do.
10. **At the end of every phase, output a short report:** what was built, files added, gate results, decisions made, anything not done.

---

## 1. SOURCE OF TRUTH

Full-Stack Developer — Take-Home Assignment Real-Time Collaborative Workspace with Role-Based Access Control Level: Advanced  ·  Estimated Effort: 20–30 hours  ·  Submission Window: 10 calendar days from receipt  ·  Role: Full-Stack Developer (Senior / Advanced) Tags TypeScript  React / Next.js GitHub Actions (CI)  Node.js  Express or NestJS  JWT + Refresh Tokens  Vercel  Render PostgreSQL  Prisma  Redis  WebSockets  Docker Overview This assignment is deliberately closer to a real sprint ticket than a tutorial exercise. You will design and build a multi-tenant, real-time collaborative workspace — think a scaled-down Linear or Asana — where multiple organizations, each with their own members and permission levels, manage boards and tasks together and see each other's changes appear live, without refreshing the page. The functional surface area is intentionally larger than a CRUD app: you'll need to reason about concurrency (two people editing the same task at once), authorization (who is allowed to do what, and where that's enforced), performance under repeated reads, and what happens when a dependent service (the database, the cache, the socket connection) is briefly unavailable. We're evaluating engineering judgment as much as feature completion. Aim of the Project • Evaluate your ability to design a multi-tenant data model and enforce authorization boundaries consistently across the stack — not just hide UI elements. • Assess your handling of real-time state: concurrent edits, race conditions, and keeping multiple connected clients in sync without polling. • See how you make architectural trade-offs under partial ambiguity — caching strategy, queue usage, schema normalization — and whether you can explain the reasoning. • Confirm you can build for production conditions: automated tests, CI, containerized local dev, and a live deployment that survives a cold start. Functional Requirements • Multi-tenant workspaces — A user can create a workspace (organization) or be invited into one by email. All data (boards, tasks, members) is scoped to a workspace; there must be no way for one workspace's data to leak into another via the API. • Role-based access control — Roles of Owner, Admin, Member, and Viewer, each with distinct permissions (e.g. only Owner/Admin can invite or remove members; Viewer is read-only). Enforce this server-side on every mutating endpoint, not just in the UI. • Boards, lists & tasks — Workspaces contain boards; boards contain ordered lists (columns); lists contain ordered tasks. Task order and list order must persist correctly under concurrent drag-and-drop from different users.• Real-time sync — When one user creates, edits, moves, or deletes a task, every other connected client viewing that board reflects the change within roughly a second, via WebSockets (Socket.IO, native ws, or equivalent) — not polling. • Authentication — Email/password signup and login with hashed passwords (bcrypt/argon2), short-lived access tokens, and a refresh-token rotation flow. Explain your token storage and revocation strategy in the README. • Activity log — Every meaningful mutation (task created/moved/deleted, member added/removed, role changed) is recorded and queryable per workspace, with actor, action, and timestamp. • Search & filtering — Full-text search over task titles/descriptions plus filtering by assignee, label, and status, returned paginated (not the entire dataset in one response). • Caching — At least one genuinely expensive read path (e.g. a workspace dashboard/summary endpoint) is backed by Redis with a sane invalidation strategy, not cached forever or never invalidated. • Background processing — At least one operation (e.g. a daily digest email, a notification, an export job) runs asynchronously via a job queue (BullMQ, or equivalent) rather than blocking the request that triggered it. • Validation & error handling — Consistent request validation, meaningful HTTP status codes, and no unhandled promise rejections or stack traces leaking to the client. Stretch goals (optional): presence indicators (who's currently viewing a board), optimistic UI updates with conflict resolution, rate limiting per user/IP, or exporting a board to CSV/PDF via the background queue. Only attempt these once every requirement above is solid. Suggested Steps • 1. Design before coding. Write a short design note (half a page is fine): entity-relationship diagram covering workspaces/users/roles/boards/tasks, and how authorization is enforced at the API layer. This is the single highest-leverage step — rushing it costs you later. • 2. Stand up the environment. Docker Compose for Postgres, Redis, and the app itself, so `docker compose up` gets a contributor running locally with no manual setup. • 3. Build auth and tenancy first. Signup/login, refresh-token flow, workspace creation/invites, and role enforcement — everything else depends on this being correct. • 4. Build the core REST/GraphQL API. Boards, lists, tasks, ordering, search, pagination. Write integration tests against a real (test) database as you go, not after. • 5. Add the real-time layer. Wire WebSocket events for the mutations above; verify with two browser windows logged in as different users in the same workspace. • 6. Add caching and the background queue. Pick one expensive read for Redis and one side-effect for the job queue; be ready to justify why those two. • 7. Build the frontend. React/Next.js consuming the real API and socket events — board view, drag-and-drop, member/role management, activity log, search. • 8. Set up CI. A GitHub Actions workflow that installs dependencies, runs lint, and runs your test suite on every push. • 9. Deploy it. Frontend to Vercel, backend (API + WebSocket server) to Render, with managed or hosted Postgres and Redis. Confirm the deployed frontend talks to the deployed backend in real time, not localhost. • 10. Write the README. Architecture diagram or description, setup instructions, environment variables, the trade-offs you made under time pressure, and what you'd do next with more time.Technical Requirements • Language: TypeScript strongly preferred on both frontend and backend. • Frontend: React or Next.js. • Backend: Node.js with Express or NestJS, exposing REST or GraphQL, plus a WebSocket server. • Database: PostgreSQL with a schema-first ORM (Prisma or TypeORM) and versioned migrations checked into the repo. • Cache / queue: Redis, used for both response caching and backing the background job queue. • Containerization: a working Dockerfile per service and a docker-compose.yml that brings up the full stack locally. • CI: GitHub Actions running lint and the automated test suite on every push. • Testing: unit tests for business logic (authorization rules, ordering logic) plus integration tests for at least the auth and task-mutation endpoints. • Deployment: frontend live on Vercel, backend (API + WebSockets) live on Render, database and Redis hosted (Render managed Postgres/Redis, Neon + Upstash, or equivalent). • Source control: a public (or shared-access) GitHub repository with an incremental commit history that reflects how the system was actually built. Submission Guidelines • GitHub repository link, including the CI workflow file and passing build badge/status. • Live Vercel URL for the frontend and live Render URL for the backend API/WebSocket server. • A short design note or README section covering the data model, authorization enforcement, caching/queue choices, and known limitations. • Two working test accounts in different roles (e.g. an Owner and a Member of the same workspace) so we can verify RBAC without asking you for credentials. • Instructions to reproduce the local Docker Compose environment from a clean checkout. Evaluation Criteria Area What we're looking for Architecture & data design Real-time correctness Sound multi-tenant schema, sensible normalization, consistent authorization enforcement. Weight 25% Concurrent edits and ordering behave correctly across multiple connected clients. Code quality & testing Security Clean structure, meaningful automated tests, CI actually passing. 20% 20% Auth/token handling, authorization checks server-side, no obvious injection/XSS gaps. 15%Systems thinking Deployment & communication Justified use of caching and background jobs; graceful handling of dependency failures. 10% Both services live and connected; README/design note clearly explains decisions. Expected Outcome 10% By the end of this assignment you will have shipped a system that behaves like a small piece of production software: multiple organizations use it in isolation from one another, permissions are enforced consistently rather than assumed, several people can work on the same board at once and see each other's changes live, and the system stays coherent under a restart or a cold cache. It will be reachable at two public URLs — a Vercel frontend and a Render backend — with CI green on the latest commit.

---

## 2. PRODUCT SUMMARY

A multi-tenant workspace app (a scaled-down Linear/Asana). Users belong to workspaces with roles (Owner, Admin, Member, Viewer). Workspaces contain boards; boards contain ordered lists (columns); lists contain ordered tasks. Several users can drag and edit at the same time and see each other's changes live over WebSockets. Everything is scoped to a workspace and authorization is enforced on the server for every endpoint.

---

## 3. REQUIREMENTS TRACEABILITY (every item must be satisfied and proven)

| ID | Requirement from the PDF | Where designed | Proof required |
|---|---|---|---|
| F1 | Multi-tenant workspaces: create one or be invited by email; all data scoped to a workspace; no cross-workspace leak via the API | §5, §6, §7 | Cross-tenant integration test suite (§12) |
| F2 | RBAC: Owner/Admin/Member/Viewer with distinct permissions; only Owner/Admin invite or remove members; Viewer read-only; enforced server-side on every mutating endpoint | §6 | Table-driven test: every mutating route x every role |
| F3 | Boards → ordered lists → ordered tasks; task order AND list order persist correctly under concurrent drag-and-drop from different users | §8 | Concurrency tests (§12) |
| F4 | Real-time sync within about a second via WebSockets, not polling | §9 | Two-socket-client test measuring latency |
| F5 | Auth: email/password, hashed (argon2/bcrypt), short-lived access tokens, refresh-token rotation; README explains storage and revocation | §10 | Auth integration tests + README section |
| F6 | Activity log: task created/moved/deleted, member added/removed, role changed; queryable per workspace with actor, action, timestamp | §5, §7 | Tests asserting one log row per mutation, none on rollback |
| F7 | Search and filtering: full-text over task title/description plus filter by assignee, label, status; paginated | §7, §8.4 | Search tests incl. tenant isolation and page caps |
| F8 | Caching: at least one expensive read in Redis with sane invalidation | §11.1 | Cache hit/miss/invalidation/Redis-down tests |
| F9 | Background processing: at least one operation via a job queue (BullMQ) not blocking the request | §11.2 | Test that the response returns before the job runs; retry test |
| F10 | Validation and error handling: consistent validation, meaningful status codes, no unhandled rejections, no stack traces to clients | §13 | Error-contract tests |
| T1 | TypeScript on both ends | §4 | `strict: true` in both tsconfigs |
| T2 | Frontend React/Next.js | §16 | |
| T3 | Backend Node + Express or NestJS, REST or GraphQL, plus a WebSocket server | §4, §7, §9 | |
| T4 | PostgreSQL + Prisma/TypeORM with versioned migrations checked in | §5 | `prisma/migrations/` committed; `migrate deploy` in CI |
| T5 | Redis for both response caching and the job queue | §11 | |
| T6 | A Dockerfile per service and a docker-compose.yml that brings up the full stack | §17 | Verified from a fresh clone |
| T7 | GitHub Actions: lint + tests on every push | §18 | Green run, badge in README |
| T8 | Unit tests (authorization rules, ordering logic) + integration tests (at least auth and task mutation endpoints) | §12 | |
| T9 | Frontend on Vercel, backend (API + WebSockets) on Render, hosted Postgres and Redis | §19 | Both URLs live and connected |
| T10 | Public/shared GitHub repo with incremental commit history | §0 rule 4 | |
| S1 | Submission: repo link + CI file + passing badge; Vercel URL; Render URL; README/design note (data model, authz enforcement, caching/queue choices, known limitations); two test accounts in different roles in the same workspace; instructions to reproduce Docker Compose from a clean checkout | §19, §20 | |

---

## 4. LOCKED TECH STACK

| Concern | Choice |
|---|---|
| Language | TypeScript, `strict: true`, everywhere |
| Runtime | Current Node LTS. Pick one major version and use it identically in Dockerfiles, CI `setup-node`, and `engines` |
| Backend | Express (current major; if you use 4.x, wrap async handlers so rejections reach the error middleware) |
| Validation | Zod (every body, query and param) |
| ORM / DB | Prisma + PostgreSQL. Follow the current Prisma docs for generator/config/driver-adapter requirements of the version you install |
| Redis client | ioredis |
| Queue | BullMQ |
| Realtime | Socket.IO (server and client) + `@socket.io/redis-adapter` |
| Password hashing | `argon2` (argon2id). If native install fails in Docker, use `@node-rs/argon2` |
| JWT | `jsonwebtoken` (HS256, algorithm pinned on verify) or `jose` |
| Ordering | `fractional-indexing` npm package |
| Logging | pino + pino-http, with redaction of `authorization`, `cookie`, `password` |
| Security middleware | helmet, express-rate-limit, cors |
| Email | nodemailer over SMTP |
| Backend tests | Vitest (or Jest) + Supertest + socket.io-client, against REAL Postgres and Redis |
| Frontend | Next.js App Router, React, TanStack Query, `socket.io-client`, dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`), Tailwind CSS, react-hook-form + zod |
| Frontend tests | Vitest for pure logic (ordering helpers, permission helpers) |
| CI | GitHub Actions |
| Local | Docker Compose |
| Hosting | Vercel (frontend), Render (API + WebSocket; worker), Neon or Render Postgres, Render Key Value or another Redis-compatible host (see §19) |

---

## 5. DATA MODEL

### 5.1 Principles

- Every tenant-owned table has `workspaceId`.
- **Tenancy is enforced in the database, not just in code:** child tables reference parents with **composite foreign keys that include `workspaceId`**, so a task can never point at a list from another workspace, and a label can never be attached to a task from another workspace.
- Roles live on `Membership`, never on `User` and never inside the JWT.
- Ordering uses fractional-index strings.

### 5.2 Prisma schema (authoritative design)

Treat this as the design. If the Prisma validator complains about syntax for your installed version, fix the syntax without weakening any constraint, index, or relation. Use `@db.Uuid` ids.

```prisma
generator client { provider = "prisma-client-js" } // adapt to the installed Prisma version per its docs
datasource db { provider = "postgresql" url = env("DATABASE_URL") }

enum Role { OWNER ADMIN MEMBER VIEWER }
enum TaskStatus { TODO IN_PROGRESS DONE }

model User {
  id            String   @id @default(uuid()) @db.Uuid
  email         String   @unique            // always stored trimmed + lowercase
  name          String
  passwordHash  String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  memberships   Membership[]
  refreshTokens RefreshToken[]
  assignedTasks Task[] @relation("TaskAssignee")
  createdTasks  Task[] @relation("TaskCreator")
  activity      ActivityLog[]
  invitesSent   Invitation[]
}

model Workspace {
  id          String   @id @default(uuid()) @db.Uuid
  name        String
  createdAt   DateTime @default(now())
  memberships Membership[]
  invitations Invitation[]
  boards      Board[]
  lists       List[]
  tasks       Task[]
  labels      Label[]
  taskLabels  TaskLabel[]
  activity    ActivityLog[]
}

model Membership {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid
  workspaceId String   @db.Uuid
  role        Role
  createdAt   DateTime @default(now())
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  @@unique([userId, workspaceId])
  @@index([workspaceId])
}

model Invitation {
  id          String    @id @default(uuid()) @db.Uuid
  workspaceId String    @db.Uuid
  email       String                      // lowercase
  role        Role                        // never OWNER (enforced in code and by a CHECK constraint in raw SQL)
  tokenHash   String    @unique           // sha256 hex of the raw token
  invitedById String?   @db.Uuid
  expiresAt   DateTime
  acceptedAt  DateTime?
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  invitedBy   User?     @relation(fields: [invitedById], references: [id], onDelete: SetNull)
  @@index([workspaceId, email])
}

model RefreshToken {
  id           String    @id @default(uuid()) @db.Uuid
  userId       String    @db.Uuid
  familyId     String    @db.Uuid
  tokenHash    String    @unique          // sha256 hex of the opaque token
  expiresAt    DateTime
  usedAt       DateTime?
  revokedAt    DateTime?
  replacedById String?   @db.Uuid
  createdAt    DateTime  @default(now())
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([familyId])
}

model Board {
  id          String   @id @default(uuid()) @db.Uuid
  workspaceId String   @db.Uuid
  name        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  lists       List[]
  @@unique([id, workspaceId])
  @@index([workspaceId, createdAt])
}

model List {
  id          String   @id @default(uuid()) @db.Uuid
  workspaceId String   @db.Uuid
  boardId     String   @db.Uuid
  name        String
  position    String                       // fractional index; column collation "C" (see §5.4)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  board       Board     @relation(fields: [boardId, workspaceId], references: [id, workspaceId], onDelete: Cascade)
  tasks       Task[]
  @@unique([id, workspaceId])
  @@unique([id, workspaceId, boardId])
  @@unique([boardId, position])
}

model Task {
  id           String     @id @default(uuid()) @db.Uuid
  workspaceId  String     @db.Uuid
  boardId      String     @db.Uuid         // immutable: tasks never move between boards
  listId       String     @db.Uuid
  title        String
  description  String?
  status       TaskStatus @default(TODO)
  position     String                       // fractional index; column collation "C"
  assigneeId   String?    @db.Uuid
  createdById  String?    @db.Uuid
  version      Int        @default(1)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  searchVector Unsupported("tsvector")?     // GENERATED column, created via edited SQL (see §5.5)
  workspace    Workspace  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  list         List       @relation(fields: [listId, workspaceId, boardId], references: [id, workspaceId, boardId], onDelete: Cascade)
  assignee     User?      @relation("TaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  createdBy    User?      @relation("TaskCreator", fields: [createdById], references: [id], onDelete: SetNull)
  labels       TaskLabel[]
  @@unique([id, workspaceId])
  @@unique([listId, position])
  @@index([workspaceId, createdAt(sort: Desc), id(sort: Desc)])
  @@index([workspaceId, assigneeId])
  @@index([workspaceId, status])
  @@index([searchVector], type: Gin)
}

model Label {
  id          String   @id @default(uuid()) @db.Uuid
  workspaceId String   @db.Uuid
  name        String
  color       String                        // "#RRGGBB"
  createdAt   DateTime @default(now())
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  tasks       TaskLabel[]
  @@unique([workspaceId, name])
  @@unique([id, workspaceId])
}

model TaskLabel {
  taskId      String @db.Uuid
  labelId     String @db.Uuid
  workspaceId String @db.Uuid
  task        Task      @relation(fields: [taskId, workspaceId], references: [id, workspaceId], onDelete: Cascade)
  label       Label     @relation(fields: [labelId, workspaceId], references: [id, workspaceId], onDelete: Cascade)
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  @@id([taskId, labelId])
  @@index([labelId])
}

model ActivityLog {
  id          String   @id @default(uuid()) @db.Uuid
  workspaceId String   @db.Uuid
  actorId     String?  @db.Uuid
  action      String                        // see §5.6
  entityType  String                        // "task" | "list" | "board" | "member" | "invitation" | "label" | "workspace"
  entityId    String?
  metadata    Json     @default("{}")       // never contains secrets, tokens or password data
  createdAt   DateTime @default(now())
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  actor       User?     @relation(fields: [actorId], references: [id], onDelete: SetNull)
  @@index([workspaceId, createdAt(sort: Desc), id(sort: Desc)])
}
```

### 5.3 Rules the schema cannot express (implement in raw-SQL migrations)

1. **Exactly one Owner per workspace:**
   `CREATE UNIQUE INDEX "Membership_one_owner_per_workspace" ON "Membership"("workspaceId") WHERE "role" = 'OWNER';`
2. **Invitations can never grant OWNER:** a CHECK constraint `"role" <> 'OWNER'` on `Invitation`.
3. **Assignee must be a workspace member.** A composite FK to `Membership` cannot be used because `ON DELETE SET NULL` would null `workspaceId` too. Enforce in the service layer on every assign, and when a member is removed, null their `assigneeId` on that workspace's tasks in the same transaction.

### 5.4 CRITICAL: collation of position columns

Fractional-index keys only sort correctly under **byte-wise ordering**. The default database collation is often locale-aware and will mis-order keys such as `Zz`, `a0`, `a1`. In a dedicated migration, run:
```sql
ALTER TABLE "List" ALTER COLUMN "position" TYPE TEXT COLLATE "C";
ALTER TABLE "Task" ALTER COLUMN "position" TYPE TEXT COLLATE "C";
```
Add a test that inserts keys `a0`, `a1`, `Zz`, `b0` and asserts `ORDER BY position` returns them in plain JavaScript string order (`<` comparison). In all application code, compare positions with `<`, `>`, never `localeCompare`.

### 5.5 Full-text search column

Run `prisma migrate dev --create-only`, then **edit the generated SQL** so `"searchVector"` becomes:
```sql
"searchVector" tsvector GENERATED ALWAYS AS (
  to_tsvector('english', coalesce("title",'') || ' ' || coalesce("description",''))
) STORED
```
with the GIN index Prisma generated. Queries must use the same `'english'` configuration (`websearch_to_tsquery('english', $q)`).

**Migration-drift check (verify):** after raw-SQL edits, confirm `prisma migrate diff` (migrations → schema) is empty, or that the tooling does not attempt to drop the custom objects. If it does, record it in `docs/decisions.md`, keep the custom objects, and ensure `prisma migrate deploy` (which never checks drift) is what CI/production use.

### 5.6 Activity actions (exhaustive list; define as a TypeScript const union)

`workspace.created`, `member.added`, `member.removed`, `member.role_changed`, `invitation.created`, `invitation.revoked`, `board.created`, `board.updated`, `board.deleted`, `list.created`, `list.updated`, `list.moved`, `list.deleted`, `task.created`, `task.updated`, `task.moved`, `task.deleted`, `label.created`, `label.updated`, `label.deleted`.

Metadata examples: `task.moved` → `{title, fromListId, toListId}`; `task.deleted` → `{title}` (snapshot, since the row is gone); `member.role_changed` → `{userId, from, to}`.

---

## 6. AUTHORIZATION DESIGN

### 6.1 Enforcement pipeline (every workspace route)

```
authenticate → loadMembership(workspaceId) → requirePermission(action) → (body/target-aware rule) → service
```

- `authenticate`: verify the access JWT (`Authorization: Bearer`), pin algorithm, check `exp`. Expired → 401 `TOKEN_EXPIRED`; otherwise 401 `UNAUTHENTICATED`. Set `req.user = {id}`.
- `loadMembership`: look up `Membership(userId, workspaceId)` **from the database on every request**. No membership (or workspace does not exist) → **404 `NOT_FOUND`** (never 403, so existence is not leaked). Because roles are read per request, role changes and removals take effect immediately.
- `requirePermission(action)`: uses the matrix below. Insufficient role → 403 `FORBIDDEN`.
- Services **always** receive `workspaceId` and include it in every query (`where: { id, workspaceId }`). Never fetch a tenant-owned row by `id` alone. A row that exists in another workspace is a 404.
- Never read `workspaceId`, `role`, `actorId` or `userId` from request bodies for authorization. Zod schemas use `.strict()` to reject unknown fields (mass-assignment protection).
- When a body references other entities (`toListId`, `afterId`, `assigneeId`, `labelIds`), validate in the service that each belongs to the same workspace (and, for tasks, the same board). Violations → 404 for unknown/foreign ids (or 409 `STALE_REFERENCE` for reorder anchors, see §8).

### 6.2 Permission matrix (implement as a single typed module `authz/permissions.ts`)

| Action | OWNER | ADMIN | MEMBER | VIEWER |
|---|:-:|:-:|:-:|:-:|
| workspace:read, member:list, board:read, task:read, label:read, activity:read, dashboard:read | ✔ | ✔ | ✔ | ✔ |
| task:create, task:update, task:move, task:delete | ✔ | ✔ | ✔ | ✘ |
| list:create, list:update, list:move | ✔ | ✔ | ✔ | ✘ |
| list:delete | ✔ | ✔ | ✘ | ✘ |
| board:create, board:update, board:delete | ✔ | ✔ | ✘ | ✘ |
| label:create | ✔ | ✔ | ✔ | ✘ |
| label:update, label:delete | ✔ | ✔ | ✘ | ✘ |
| invitation:create, invitation:list, invitation:revoke, invitation:resend | ✔ | ✔ | ✘ | ✘ |
| member:remove, member:changeRole | ✔ | ✔ | ✘ | ✘ |

### 6.3 Target-aware rules (pure functions, unit tested)

- `canInvite(actorRole, inviteRole)`: OWNER may invite ADMIN, MEMBER, VIEWER. ADMIN may invite MEMBER, VIEWER. Nobody may invite OWNER.
- `canRemove(actorRole, targetRole)`: OWNER may remove ADMIN, MEMBER, VIEWER. ADMIN may remove MEMBER, VIEWER. **The OWNER can never be removed** (ownership transfer is intentionally not implemented; see §21).
- `canChangeRole(actorRole, targetCurrentRole, newRole)`: nobody can change the OWNER's role or assign OWNER. OWNER may set ADMIN/MEMBER/VIEWER on any non-owner. ADMIN may change a MEMBER or VIEWER to MEMBER or VIEWER only (cannot promote to ADMIN, cannot touch ADMINs).
- A user cannot change their own role or remove themselves via these endpoints.

Violations → 403 `FORBIDDEN` with a specific message.

### 6.4 UI is not security

The frontend hides or disables controls by role for convenience only. The README must say the server is the enforcement layer.

---

## 7. REST API (all routes are prefixed `/api`)

Conventions: JSON; `201` on create, `200` on read/update, `204` on delete; ids are UUIDs (malformed id → 400 `VALIDATION_ERROR`); list endpoints return `{ items, nextCursor }`; error shape in §13.

**Health**
- `GET /api/health` → 200 `{status:"ok"}` (no dependencies; used by Render).
- `GET /api/health/ready` → checks DB (required) and Redis (optional). DB down → 503. Redis down → 200 with `{redis:"degraded"}`.

**Auth**
- `POST /api/auth/signup` `{email,name,password}` → 201 `{accessToken, user}` + refresh cookie. Duplicate email → 409.
- `POST /api/auth/login` `{email,password}` → 200 `{accessToken, user}` + cookie. Bad credentials → 401 `INVALID_CREDENTIALS` (same message for unknown email and wrong password; always run a dummy argon2 verify for unknown emails to equalize timing).
- `POST /api/auth/refresh` (cookie only) → 200 `{accessToken}` + rotated cookie.
- `POST /api/auth/logout` → 204; revokes the token family; clears cookie. Idempotent.
- `GET /api/auth/me` → `{user, memberships:[{workspaceId, workspaceName, role}]}`.

**Workspaces and members**
- `POST /api/workspaces` `{name}` → creates workspace + OWNER membership in one transaction (+ log `workspace.created`).
- `GET /api/workspaces` → the caller's workspaces with their role.
- `GET /api/workspaces/:workspaceId` → workspace + caller's role.
- `GET /api/workspaces/:workspaceId/members`
- `PATCH /api/workspaces/:workspaceId/members/:userId` `{role}`
- `DELETE /api/workspaces/:workspaceId/members/:userId`

**Invitations**
- `POST /api/workspaces/:workspaceId/invitations` `{email, role}` → 201 `{invitation, inviteUrl}` (see §10.4 for why the URL is returned).
- `GET /api/workspaces/:workspaceId/invitations` → pending invitations.
- `DELETE /api/workspaces/:workspaceId/invitations/:invitationId` → revoke.
- `POST /api/workspaces/:workspaceId/invitations/:invitationId/resend` → rotates the token, re-enqueues the email.
- `GET /api/invitations/:token` (public) → `{workspaceName, email, role, expired?}` for the accept page.
- `POST /api/invitations/:token/accept` (authenticated) → creates the membership.

**Boards and lists**
- `GET /api/workspaces/:workspaceId/boards`, `POST` (same path) `{name, description?}`
- `GET /api/workspaces/:workspaceId/boards/:boardId` → board + its lists ordered by `position`
- `PATCH` / `DELETE` the same path
- `POST /api/workspaces/:workspaceId/boards/:boardId/lists` `{name, afterId?}`
- `PATCH /api/workspaces/:workspaceId/lists/:listId` `{name}`
- `POST /api/workspaces/:workspaceId/lists/:listId/move` `{afterId: uuid|null}`
- `DELETE /api/workspaces/:workspaceId/lists/:listId`

**Tasks**
- `POST /api/workspaces/:workspaceId/lists/:listId/tasks` `{title, description?, status?, assigneeId?, labelIds?, afterId?}` (omitting `afterId` appends at the end)
- `GET /api/workspaces/:workspaceId/tasks/:taskId`
- `PATCH /api/workspaces/:workspaceId/tasks/:taskId` `{expectedVersion, title?, description?, status?, assigneeId?|null, labelIds?}` (`labelIds` replaces the set)
- `POST /api/workspaces/:workspaceId/tasks/:taskId/move` `{toListId, afterId: uuid|null}`
- `DELETE /api/workspaces/:workspaceId/tasks/:taskId`
- `GET /api/workspaces/:workspaceId/tasks` (search + filter + pagination, §8.4)

**Labels**
- `GET`/`POST /api/workspaces/:workspaceId/labels`, `PATCH`/`DELETE …/labels/:labelId`

**Activity and dashboard**
- `GET /api/workspaces/:workspaceId/activity?cursor&limit&actorId&action&entityType`
- `GET /api/workspaces/:workspaceId/dashboard`

**Limits (Zod):** workspace/board/list/label name 1-80 chars; task title 1-200; description up to 10,000; password 10-128 chars; email max 254; JSON body limit 100 KB; `limit` default 25, max 100.

---

## 8. ORDERING, CONCURRENCY AND SEARCH

### 8.1 Fractional indexing with server-side anchors

- Clients never send positions. They send an **anchor**: `afterId` = the id of the item they dropped it after (`null` = top of the list). The server computes the key. This is robust when other users changed the list meanwhile.
- Key generation uses `generateKeyBetween(pred, succ)` from `fractional-indexing`.

### 8.2 Algorithm for moving/creating a task (inside one transaction)

1. Lock the **target list row**: `SELECT id FROM "List" WHERE id = $1::uuid AND "workspaceId" = $2::uuid FOR UPDATE` (via `$queryRaw` on the transaction client). No row → 404. Only the target list is locked, so two moves cannot deadlock each other.
2. Load the task (`WHERE id AND workspaceId`) for a move; verify `toList.boardId == task.boardId` (else 400: cross-board moves are not supported).
3. Resolve `pred`: if `afterId` is null → no predecessor; otherwise load the task `afterId` in the target list, `WHERE id = afterId AND listId = target AND workspaceId`. Not found, or equal to the moved task → **409 `STALE_REFERENCE`** (the client refetches). Not-found-because-foreign-workspace is the same 409/404 outcome and leaks nothing.
4. Resolve `succ`: the first task in the target list with `position > pred.position` (or the first task overall if no `pred`), **excluding the moved task**.
5. `newKey = generateKeyBetween(pred?.position ?? null, succ?.position ?? null)`.
6. `UPDATE` the task: `listId`, `position`, `version = version + 1`.
7. Insert the activity row in the same transaction. Commit. Then emit realtime events (§9) and invalidate caches (§11).

Because the list row is locked, concurrent moves into the same list are serialized and never produce duplicate positions. The `@@unique([listId, position])` constraint is the safety net: if it ever fires (P2002), retry the whole transaction once or twice, then return 409.

**Lists** use the same algorithm with the **Board row** lock and `@@unique([boardId, position])`.

Key growth under repeated insertion at the same spot is accepted and documented as a known limitation (no rebalance job).

### 8.3 Editing conflicts (optimistic locking)

- `version` increments on every successful change to a task (edits and moves).
- `PATCH` requires `expectedVersion`. Implement as a single statement: `UPDATE ... WHERE id = ? AND "workspaceId" = ? AND version = ?`. Zero rows → look the task up; if it exists respond **409 `VERSION_CONFLICT`** including the current task DTO; if not → 404.
- The frontend, on `VERSION_CONFLICT`, auto-rebases: if the server's current values for the fields the user edited still equal the user's base values, retry once with the new version; otherwise show a small "Task changed by someone else" dialog offering reload.
- Moves do not take `expectedVersion` (the position algorithm handles concurrency) but bump `version`.
- Delete is idempotent in effect; deleting a missing task → 404.

### 8.4 Search and filtering (`GET /tasks`)

Query params: `boardId?`, `listId?`, `q?`, `assigneeId?`, `labelId?`, `status?` (TODO|IN_PROGRESS|DONE), `sort?` (`position` | `newest`, default `newest`), `limit`, `cursor`.

- `sort=position` requires `listId`; keyset cursor over `(position, id)`.
- `sort=newest`: keyset cursor over `(createdAt DESC, id DESC)`.
- Cursor is an opaque base64url JSON; invalid → 400.
- Fetch `limit + 1` rows to compute `nextCursor`.
- When `q` is present use `$queryRaw` with `Prisma.sql` fragments: `"searchVector" @@ websearch_to_tsquery('english', ${q})`. **Never interpolate user input into SQL strings.** Always `WHERE "workspaceId" = ...`. Return ids and hydrate through Prisma (assignee, labels) preserving order.
- Cap `limit` at 100; the endpoint never returns an unbounded set.

### 8.5 Task DTO

`{ id, workspaceId, boardId, listId, title, description, status, position, assignee: {id,name}|null, labels: [{id,name,color}], version, createdBy: {id,name}|null, createdAt, updatedAt }`

---

## 9. REAL-TIME DESIGN

- Socket.IO server shares the Express HTTP server. Client uses `transports: ["websocket"]` (no long-polling fallback) so sync is genuinely socket-based.
- **Handshake auth:** client passes `auth` as a **function** so every (re)connect uses the latest access token. Server middleware verifies the JWT, sets `socket.data.userId`; failure → `next(new Error("UNAUTHORIZED"))`.
- **Client → server messages (acknowledged, no mutations):** `join:workspace {workspaceId}`, `join:board {workspaceId, boardId}`, `leave:board {boardId}`. On join the server re-checks membership in the DB and that the board belongs to that workspace; failure → ack `{ok:false, code}`. Joined rooms: `workspace:{id}`, `board:{id}`. Track `socket.data.joined = Map<boardId, workspaceId>` plus joined workspace ids.
- **All mutations go through REST**, so authorization lives in exactly one place. The server broadcasts the result to rooms.
- **Emit only after the transaction commits.** Implement a `withTx` helper that collects domain events during the transaction and publishes them after commit.
- **Events and rooms**
  - `board:{id}` room: `task:created`, `task:updated`, `task:moved`, `task:deleted`, `list:created`, `list:updated`, `list:moved`, `list:deleted`.
  - `workspace:{id}` room: `board:created|updated|deleted`, `member:added|removed|role_changed`, `label:created|updated|deleted`, `activity:created`.
- **Payload envelope:** `{ workspaceId, boardId?, actorId, data, emittedAt }` where `data` is the full DTO (for deletes: `{id}`; for moved tasks, the full updated DTO including `listId`, `position`, `version`).
- **Client rules:** apply an event only if its `version` is greater than the cached entity's version (upsert by id); keep a per-board set of deleted ids so a late update cannot resurrect a deleted task; sort lists and tasks with plain string comparison on `position`, tie-break by `id`.
- **Member removal / role change:** on removal, `io.in("user:"+userId)` sockets leave every room belonging to that workspace (use `socket.data.joined`) and receive `member:removed`. Every socket also joins `user:{userId}` on connect.
- **Resync:** on every reconnect the client re-joins rooms, then invalidates and refetches the active board, workspace, and activity queries, so events missed during downtime are recovered.
- **Redis adapter:** use `@socket.io/redis-adapter` with dedicated pub/sub connections. If Redis is down, local delivery must keep working; log and continue (verify behaviour).
- **Latency target:** an event reaches other clients within about 1 second of the REST response.

---

## 10. AUTHENTICATION AND TOKENS

### 10.1 Passwords
argon2id, library defaults or stronger. Verify with the library's `verify`. Never log passwords.

### 10.2 Access token
JWT HS256, 15 minutes (`ACCESS_TOKEN_TTL_SECONDS=900`), claims `sub`, `iat`, `exp`, `iss`, `aud`. Secret ≥ 32 random bytes from env (validated at boot). Held **in memory** in the frontend only (never localStorage). No role in the token.

### 10.3 Refresh token (rotation with reuse detection)

- Opaque random value (32 bytes, base64url). Store only its SHA-256 hash. Cookie name `rt`: `HttpOnly; Secure (in prod); SameSite=Lax; Path=/api/auth; Max-Age=7 days`.
- Rotation on `POST /api/auth/refresh` inside a transaction:
  1. Find by hash. Not found → 401 `REFRESH_INVALID` (clear cookie).
  2. If `revokedAt` set or expired → 401.
  3. Atomically claim: `UPDATE ... SET usedAt = now() WHERE id = ? AND usedAt IS NULL`. If this claims the row: insert a new token with the same `familyId`, set `replacedById`, return a new access token and cookie.
  4. If already used: if `usedAt` is within the **grace window (10 s, `REFRESH_REUSE_GRACE_SECONDS`)** return 401 `REFRESH_RETRY` **without revoking** (this is a benign multi-tab race: the winner already refreshed the shared cookie). Otherwise treat as **token reuse/theft: revoke every token in the family** and return 401 `REFRESH_INVALID`.
- Frontend: a single-flight refresh promise inside a tab, and a cross-tab lock via `navigator.locks` (Web Locks API) where available. On `REFRESH_RETRY`, retry once.
- Logout revokes the whole family. Optionally add a scheduled cleanup of expired tokens (document if skipped).
- Removing a user from a workspace does **not** revoke their refresh tokens (they may belong to other workspaces). Because membership is checked from the DB on every request, removal is effective immediately.

### 10.4 Invitations
- 32-byte random token, stored only as a SHA-256 hash; 7-day expiry; bound to the invited **email** (lowercase).
- Creating an invitation: reject if the email already belongs to a member (409); revoke any older pending invitation for the same `(workspaceId, email)`; insert in a transaction; commit; then enqueue the email job (best effort, see §11.2).
- Response includes `inviteUrl` = `${APP_BASE_URL}/invite/${rawToken}`. **Why:** reviewers cannot receive real email, so the inviter can copy and open the link. The raw token is only ever returned to the inviter at creation/resend time.
- Accepting: user must be logged in; their email must match the invitation email (case-insensitive) else 403 `INVITATION_EMAIL_MISMATCH`; invitation must be pending and unexpired else 410/409 as appropriate; in one transaction create the membership, set `acceptedAt`, write `member.added`.

### 10.5 Cross-origin deployment strategy (important)
Vercel and Render are different sites, and third-party cookies are increasingly blocked. Therefore:
- **REST goes through a Next.js rewrite:** `/api/:path*` → `${BACKEND_URL}/api/:path*`. The browser sees the API as same-origin, so the refresh cookie is first-party and CORS is not needed for REST.
- **WebSockets connect directly to the Render URL** (`NEXT_PUBLIC_WS_URL`), authenticated with the access token in the handshake (no cookie needed). Configure Socket.IO CORS to allow only `FRONTEND_ORIGIN`.
- `BACKEND_URL` and `NEXT_PUBLIC_*` values are baked at build time by Next.js; pass them as build args in Docker and set them in Vercel project settings.
- **Fallback only if the rewrite proves unusable on Vercel:** cookie `SameSite=None; Secure` plus CORS with `credentials: true` and an Origin allowlist. If you take the fallback, document why.
- For cookie-authenticated endpoints (`refresh`, `logout`) also verify the `Origin` header against `FRONTEND_ORIGIN` as CSRF defense in depth.
- Test the deployed flow in Chrome and Safari/private windows early (Phase 1 smoke deploy).

### 10.6 Rate limiting (security, minimal)
`express-rate-limit` on `/api/auth/login`, `/signup`, `/refresh`, and invitation accept (for example 10 requests/minute/IP for login and signup). Set `app.set("trust proxy", 1)` behind Render so the client IP is correct. In-memory store is acceptable; document it. Return 429 `RATE_LIMITED`.

---

## 11. CACHING AND BACKGROUND JOBS

### 11.1 Redis cache: the workspace dashboard

`GET /api/workspaces/:workspaceId/dashboard` aggregates: task counts per status, tasks per assignee (including unassigned), board count, member count, and the 10 most recent activity entries. This is the genuinely expensive read.

**Versioned-key invalidation (avoids stale-write races):**
- Per-workspace version counter `ws:{id}:ver` in Redis.
- Read path: `ver = GET ws:{id}:ver` (default 0) → `GET dash:{id}:v{ver}`; on miss compute from Postgres and `SET ... EX 60`.
- Write path: after any workspace mutation commits (task/board/list/label/member/invitation changes), `INCR ws:{id}:ver` before responding. Old keys expire by TTL.
- The 60 s TTL is the backstop, not the strategy.
- **Graceful degradation:** every Redis call is wrapped with a short timeout (≈200 ms) and try/catch. Redis failure → compute from the DB and return 200; never fail the request because of the cache. Use an ioredis client for caching with `maxRetriesPerRequest: 1` and `enableOfflineQueue: false`.
- Document the known edge: if Redis was down when a mutation happened, a stale entry can live up to 60 s.

### 11.2 Background job: invitation email (BullMQ)

- Queue `email`, job `send-invitation-email`, `jobId = invite-email:${invitationId}:${tokenGeneration}` for idempotency, data `{invitationId, to, workspaceName, inviterName, inviteUrl}` (the URL contains the raw token; note in the README that Redis is trusted infrastructure).
- Options: `attempts: 5`, exponential backoff starting at 2 s, `removeOnComplete` and `removeOnFail` with sensible counts.
- **Connections:** the API's `Queue` connection uses `enableOfflineQueue: false` so enqueue fails fast when Redis is down; catch the error, log it, and still return 201 (the inviter can use **resend** or copy the link). The `Worker` connection **must** use `maxRetriesPerRequest: null`.
- Processor sends through Resend's HTTPS API when `RESEND_API_KEY` is configured; a legacy Resend SMTP URL in `SMTP_URL` is recognized and its key is used for HTTPS delivery. Other `SMTP_URL` values (including local **Mailpit**, SMTP on 1025 with a web UI on 8025) continue to use nodemailer. If no delivery provider is configured, fail and retry the job; never log invitation or password-reset links.
- Hosting the worker: separate entrypoint `worker.ts` (Compose service `worker`, same backend image, different command). If a separate Render worker is unavailable on the chosen plan (verify current Render plans), run it **in-process** when `RUN_WORKER_IN_PROCESS=true`. The worker start function must be shared by both paths.
- Test: the HTTP response returns before the job completes; a failing processor is retried; enqueue failure does not fail the request.

### 11.3 Redis hosting caveat (verify)
BullMQ polls Redis continuously and can exhaust request-count-metered free tiers (for example Upstash's). Prefer a Redis-compatible instance with no per-command metering for free use (for example Render Key Value, if available on the plan). If you use a TLS URL, use `rediss://`. Record the choice in `docs/decisions.md`.

---

## 12. TEST PLAN (must exist and pass)

Run integration tests against real Postgres and Redis. Use a separate test database; apply migrations with `prisma migrate deploy` before the run. Run integration test files serially (or with isolated databases) to avoid cross-test interference. Clean state between tests.

**Unit tests**
- Permission matrix: every action x every role (expected allow/deny).
- `canInvite`, `canRemove`, `canChangeRole`: all role combinations, including self-targeting and OWNER-protection cases.
- Ordering: `generateKeyBetween` usage helper; ordering under random insert sequences stays strictly increasing; plain string comparison matches DB ordering (collation test from §5.4).
- Cursor encode/decode and invalid-cursor handling.
- Token hashing and the refresh-rotation decision function (claim / grace-retry / reuse-revoke / expired / revoked).

**Integration tests (Supertest)**
- **Auth:** signup, duplicate email 409, login success/failure (identical error for unknown email and wrong password), refresh rotation, reuse outside grace revokes the family, reuse inside grace returns `REFRESH_RETRY` without revoking, logout revokes, expired access token → `TOKEN_EXPIRED`.
- **Tenant isolation (F1):** users A and B in different workspaces. For every workspace-scoped endpoint, A calling with B's workspace id → 404; A using B's board/list/task/label ids under A's own workspace id → 404/409; moving a task to a foreign list, assigning a non-member, attaching a foreign label → rejected. Search never returns another workspace's tasks.
- **RBAC (F2):** a table-driven test iterating over **every mutating endpoint** and each of the four roles, asserting 2xx vs 403. Include target-aware rules (Admin cannot remove an Admin or change an Owner; Owner cannot be removed).
- **Task mutations:** create, update, move, delete; optimistic-lock 409 with current DTO; activity row created exactly once per mutation; **no activity row when the transaction rolls back**.
- **Concurrency (F3):** (a) 10 simultaneous moves of different tasks into the same list, same anchor → all succeed, positions unique, final order deterministic; (b) simultaneous reordering of lists by two users; (c) 5 concurrent `PATCH` with the same `expectedVersion` → exactly one 200, others 409; (d) move concurrent with delete → no 500.
- **Search (F7):** full-text match on title and description; filters by assignee, label, status; combined filters; pagination across several pages without duplicates or gaps; `limit` cap; malicious `q` strings (quotes, `;--`) are handled safely.
- **Cache (F8):** first dashboard read is a miss and the second a hit; a task mutation makes the next read fresh; **Redis unavailable → 200 from the DB**; flush Redis (cold cache) → still correct.
- **Queue (F9):** invitation returns 201 before email is processed; the job is processed and retried on failure; enqueue failure still returns 201.
- **Errors (F10):** validation errors 400 with the standard shape; unknown route 404; unexpected exceptions return 500 with a generic message and **no stack trace** when `NODE_ENV=production`; unknown body fields rejected.
- **Realtime (F4):** two authenticated socket clients in the same board room as different users; user A moves/creates/edits/deletes via REST; client B receives the matching event within 1000 ms; a socket from another workspace never receives it; a removed member stops receiving events; unauthenticated socket is rejected; a Viewer can read events but REST mutations return 403.

**Frontend tests (Vitest):** ordering/reorder helper (anchor computation after a drag), version-guarded cache upsert, permission helper.

---

## 13. ERROR CONTRACT AND ROBUSTNESS

Error body: `{ "error": { "code": "...", "message": "...", "details"?: [...], "requestId": "..." } }`.

| Code | HTTP |
|---|---|
| VALIDATION_ERROR | 400 |
| UNAUTHENTICATED, TOKEN_EXPIRED, INVALID_CREDENTIALS, REFRESH_INVALID, REFRESH_RETRY | 401 |
| FORBIDDEN, INVITATION_EMAIL_MISMATCH | 403 |
| NOT_FOUND | 404 |
| CONFLICT, VERSION_CONFLICT, STALE_REFERENCE | 409 |
| RATE_LIMITED | 429 |
| SERVICE_UNAVAILABLE | 503 |
| INTERNAL | 500 |

- Central error middleware maps `AppError` subclasses, Zod errors and Prisma errors (`P2002` → 409, `P2025` → 404, `P2003` → 409). Anything else → 500 `INTERNAL` with a generic message; the stack is logged server-side only.
- Request id middleware; include the id in logs and error bodies.
- `process.on("unhandledRejection")` and `uncaughtException`: log fatally, run graceful shutdown, exit non-zero. (These are last resorts; the code itself must not produce unhandled rejections: every async path is awaited or has `.catch`.)
- **Graceful shutdown on SIGTERM:** stop accepting connections, close Socket.IO, close the BullMQ worker, quit Redis, disconnect Prisma, then exit.
- Server binds `0.0.0.0` and uses `process.env.PORT`.
- Env validated with Zod at boot; the app refuses to start with a missing/invalid required variable.
- DB down: requests fail with 503 `SERVICE_UNAVAILABLE` (generic). Redis down: cache bypassed, enqueue failures swallowed (logged), Socket.IO adapter errors logged.
- Helmet enabled, `x-powered-by` disabled, strict body size limit, CORS limited to `FRONTEND_ORIGIN`.

---

## 14. PHASES AND GATES

Phase order follows the PDF's suggested steps.

**Phase 0: Design (PDF step 1).** Create `docs/design.md` (ERD as a Mermaid diagram, authorization pipeline, permission matrix, ordering/concurrency design, realtime design, token design, cache/queue design, failure-mode table) and `docs/decisions.md`. *Gate:* every ID in §3 is mapped to a section; no contradictions with the PDF.

**Phase 1: Environment (step 2, plus early deploy smoke test).** Monorepo with `backend/` and `frontend/` (independent packages, no workspace tooling required), Dockerfiles, compose, `.env.example`, lint/format/tsconfig strict, CI skeleton. Deploy a "hello" backend (`/api/health`, a trivial Socket.IO echo) to Render and a hello frontend with the rewrite to Vercel to prove cookies, rewrite, and `wss://` work. *Gate:* `docker compose up --build` from a clean clone gets all services healthy; CI green; smoke deploy verified.

**Phase 2: Auth and tenancy (step 3).** Prisma schema + migrations (including raw-SQL parts and the collation migration), signup/login/refresh/logout/me, workspace create/list/get, members, invitations (+ email job stub), permissions module, middleware pipeline, error handling, rate limiting. *Gate:* all auth, tenant-isolation and RBAC tests for these endpoints pass; unit tests for permissions pass.

**Phase 3: Core API (step 4).** Boards, lists, tasks, labels, ordering with locking, optimistic versions, search/filter/pagination, activity log + endpoint. *Gate:* task-mutation, concurrency, search, activity tests pass; extend the RBAC and tenant tests to all new endpoints.

**Phase 4: Real-time (step 5).** Socket.IO server, rooms, events after commit, redis adapter, removal/kick logic. Minimal frontend board view (login, board, live updates) to verify with two browsers. *Gate:* realtime tests pass; manual two-browser check documented in your report.

**Phase 5: Cache and queue (step 6).** Dashboard cache with versioned keys, BullMQ email job and worker, graceful degradation. *Gate:* cache/queue/resilience tests pass (Redis down, cold cache).

**Phase 6: Frontend (step 7).** Complete UI per §16. *Gate:* `lint`, `typecheck`, `build`, frontend unit tests pass; manual run-through of every screen with two roles.

**Phase 7: CI (step 8).** Finalize the workflow per §18. *Gate:* green on the latest commit.

**Phase 8: Deployment (step 9).** Prepare `render.yaml` (optional blueprint, verify against current Render docs), `docs/deployment.md` with exact steps, env var tables, seed instructions. *Gate (with my help):* both URLs live, deployed frontend ↔ deployed backend over `wss://`, seed loaded.

**Phase 9: README and final audit (step 10).** Write the README (§20), run the final audit (§22), produce the traceability report.

---

## 15. STRETCH GOALS (only after Phase 9 passes)

Presence indicators; optimistic UI with richer conflict resolution; Redis-backed rate limiting; board export to CSV/PDF via the queue. Do not start any of these earlier.

---

## 16. FRONTEND SPECIFICATION

**Routes (App Router, authenticated pages are client components):**
- `/login`, `/signup`
- `/invite/[token]` (preview, then login/signup with email prefilled, then accept)
- `/w` (workspace list + create)
- `/w/[workspaceId]` (dashboard + board list + create board)
- `/w/[workspaceId]/b/[boardId]` (board view)
- `/w/[workspaceId]/members` (members, roles, invitations with copyable invite links)
- `/w/[workspaceId]/activity` (paginated, filterable log, live-updating)

**Auth bootstrap:** on load call `POST /api/auth/refresh`; if it succeeds fetch `/api/auth/me`; otherwise redirect to `/login`. Access token lives in memory; an API wrapper attaches it, and on `TOKEN_EXPIRED` performs a single-flight refresh then retries once. Route protection is a client-side convenience; the server is the authority.

**Board view:**
- Columns are lists ordered by `position`; each column loads tasks with `GET /tasks?listId=…&sort=position&limit=50` using an infinite query and a "Load more" control.
- Drag and drop with dnd-kit (tasks within and across lists; lists reorder horizontally). Compute `afterId` from the final index in the destination excluding the dragged item. Apply an **optimistic** cache update, call the move endpoint, replace with the server DTO, **roll back and toast on error**. On `STALE_REFERENCE` refetch the column.
- **Disable dragging while search/filters are active** (partial views make anchors ambiguous) and show a hint.
- Search box + filters (assignee, label, status) call the paginated tasks endpoint.
- Task drawer to edit title, description, status, assignee, labels with the version/auto-rebase behaviour from §8.3.
- Controls are hidden/disabled by role (Viewer sees no edit affordances).

**Realtime hook:** `socket.io-client` with `transports: ["websocket"]`, `auth: cb => cb({token})` returning the current token; join workspace/board rooms; apply events to the TanStack Query cache with the version rules from §9; show a small "Reconnecting…" indicator; refetch on reconnect.

**Cold start UX:** the first request after Render sleeps can take a long time. Show "Waking up the server…" after about 3 s without a response and retry with backoff on network errors. Document this in the README.

**Security:** never use `dangerouslySetInnerHTML`; render task text as plain text. Set basic security headers in `next.config` (X-Content-Type-Options, Referrer-Policy, frame protection). A strict CSP is listed as a known limitation unless you can verify it works with Next.js.

**States:** every screen has loading, empty and error states.

---

## 17. DOCKER AND LOCAL ENVIRONMENT

- `backend/Dockerfile` (multi-stage; use a Debian-slim base so Prisma and argon2 work; non-root user; `prisma generate` at build) and `frontend/Dockerfile` (multi-stage; standalone output; build args `BACKEND_URL`, `NEXT_PUBLIC_WS_URL`). The `worker` service reuses the backend image with a different command.
- `docker-compose.yml` services: `postgres` (healthcheck `pg_isready`), `redis` (healthcheck `redis-cli ping`), `mailpit`, `migrate` (one-shot: `prisma migrate deploy`, then the idempotent seed when `SEED_DEMO_DATA=true`), `api` (waits for `migrate` to complete successfully), `worker`, `web`.
- `docker compose up --build` from a clean clone must work with **no manual steps**, then: web http://localhost:3000, API http://localhost:4000, Mailpit http://localhost:8025. Compose passes `BACKEND_URL=http://api:4000` to the web build and `NEXT_PUBLIC_WS_URL=http://localhost:4000`.
- Provide `.env.example` for backend and frontend with every variable and a one-line description.
- Document the non-Docker dev flow too (run Postgres/Redis in Docker, apps on host).

**Backend environment variables:** `NODE_ENV`, `PORT`, `DATABASE_URL` (and `DIRECT_URL` if your provider needs a direct connection for migrations; follow Prisma docs), `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS`, `REFRESH_REUSE_GRACE_SECONDS`, `FRONTEND_ORIGIN`, `APP_BASE_URL`, `COOKIE_SECURE`, `TRUST_PROXY`, `SMTP_URL`, `MAIL_FROM`, `RUN_WORKER_IN_PROCESS`, `SEED_DEMO_DATA`, `LOG_LEVEL`.
**Frontend:** `BACKEND_URL`, `NEXT_PUBLIC_WS_URL`.

### Seed data (idempotent, upsert-based)
- Workspace **"Acme Demo"** with four users, one per role, password documented in the README (use a strong demo password): `owner@example.com`, `admin@example.com`, `member@example.com`, `viewer@example.com`.
- A second workspace **"Globex Demo"** with `other.owner@example.com`, used to demonstrate tenant isolation.
- In Acme: a board "Product Roadmap" with 3 lists, about 10 tasks with labels and assignees, and a few activity entries.

---

## 18. CI (GitHub Actions)

`.github/workflows/ci.yml`, triggered `on: push` (all branches) and `pull_request`.
- **backend job:** service containers Postgres and Redis with health checks; `actions/setup-node` with npm cache; `npm ci`; `prisma generate`; `prisma migrate deploy` against the CI database; lint (zero warnings allowed); `tsc --noEmit`; tests.
- **frontend job:** `npm ci`; lint; typecheck; unit tests; `next build`.
- Optional: a job that runs `docker build` for both Dockerfiles.
- Add the status badge to the top of the README. The latest commit must be green.

---

## 19. DEPLOYMENT

- **Frontend → Vercel.** Project root `frontend/`. Set `BACKEND_URL` (Render API URL) and `NEXT_PUBLIC_WS_URL` (same Render URL, `https://`; Socket.IO upgrades to `wss://`).
- **Backend → Render web service** (root `backend/`, Docker or Node runtime). Health check path `/api/health`. Release/pre-deploy step runs `prisma migrate deploy`. Set `TRUST_PROXY=1`, `COOKIE_SECURE=true`, `FRONTEND_ORIGIN`, `APP_BASE_URL` (the Vercel URL), `JWT_ACCESS_SECRET`, DB and Redis URLs.
- **Worker:** separate Render background worker if the plan allows; otherwise `RUN_WORKER_IN_PROCESS=true` on the web service (verify current plan features before deciding; record the decision).
- **Postgres:** Neon (use the provider's pooled URL for the app and a direct URL for migrations if required) or Render Postgres (verify retention/expiry limits of the free tier). **Redis:** see §11.3.
- **Seed the deployed database once** (document the exact command, run from a trusted machine or a Render shell).
- **Verify:** the deployed frontend opens, login works, and in the browser Network tab the WebSocket connects to `wss://<render-host>/socket.io/…` (not localhost); two browsers as different roles see live updates; the Viewer cannot mutate.
- **Cold start:** Render free web services sleep when idle; the first request can be slow. The UI handles it (§16) and the README states it. Optionally describe an external uptime ping as a mitigation (not a requirement).
- Provide `docs/deployment.md` with every manual step I must perform, in order.

---

## 20. README REQUIREMENTS (all sections required)

1. Title, CI badge, live URLs (Vercel + Render), repo link.
2. Test accounts table (role, email, password) for the deployed environment, including at least an Owner and a Member of the same workspace.
3. Architecture overview + diagram (Mermaid), and a repo map.
4. **Data model:** ERD and a note on composite-FK tenancy.
5. **Authorization enforcement:** the pipeline, the matrix, target-aware rules, "UI is not security".
6. **Authentication, token storage and revocation strategy:** access token in memory, refresh token as an HttpOnly hashed-at-rest rotating cookie, reuse detection, grace window, logout, why the Next.js rewrite is used, known limitation (a stolen access token is valid up to 15 minutes).
7. **Ordering and concurrency:** fractional indexing, row locks, optimistic versions, collation note.
8. **Real-time design:** rooms, events, emit-after-commit, resync on reconnect.
9. **Caching and queue choices and justification:** why the dashboard, why invitation email, invalidation strategy, failure behaviour.
10. Search design (tsvector, GIN, pagination).
11. Setup: Docker Compose from a clean checkout (exact commands), non-Docker dev, running tests, seed.
12. Environment variables table.
13. Deployment notes (including cold-start behaviour).
14. **Trade-offs made under time pressure** and **known limitations** (§21).
15. **What I would do next.**

---

## 21. INTENTIONAL SCOPE CUTS AND KNOWN LIMITATIONS (document them; do not implement)

Ownership transfer; leaving a workspace voluntarily; workspace rename/delete; password reset and email verification; cross-board task moves; position rebalancing (keys grow under repeated insertion at one spot); no access-token denylist (≤ 15 min exposure); in-memory rate-limit store; strict CSP; presence and CSV export unless done as stretch goals; the shown invite link is returned to the inviter by design.

---

## 22. FINAL AUDIT (Phase 9, mandatory, show the results)

Produce a table with one row per ID in §3: **requirement → implementing files → test names → status (PASS/FAIL/PARTIAL)**. Do not mark PASS without a passing test or a documented manual verification. Then run and report:

1. `grep`/review of **every Prisma and raw-SQL call on tenant-owned tables** confirming `workspaceId` is in the filter.
2. Every mutating route is covered by the RBAC test table (list the routes from the router and diff against the test).
3. No `localeCompare` on positions; no string-interpolated SQL; no `dangerouslySetInnerHTML`; no secrets or `.env` files committed.
4. `docker compose up --build` from a fresh clone works, and the services are reachable.
5. `lint`, `typecheck`, all tests, and both builds pass; CI is green.
6. A "clean-clone" dry run of the README instructions.
7. A list of anything not done, partially done, or that I need to do manually.

Do not say "everything is complete" unless every row is PASS. Be explicit about gaps.

---

## 23. BEGIN

Start with **Phase 0**. Produce `docs/design.md` and `docs/decisions.md`, list any contradictions you found between this prompt and the PDF, then stop and report before writing application code.

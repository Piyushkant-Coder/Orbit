# Orbit Collaborative Workspace

Orbit is a full-stack workspace app for teams to coordinate work on boards and tasks. It includes PostgreSQL-backed multi-tenant data, role-based authorization, real-time updates, Redis caching, and queued email.

## Features

- Multiple isolated workspaces with Owner, Admin, Member, and Viewer roles.
- Boards, ordered lists, tasks, labels, search, filtering, cursor pagination, and activity history.
- JWT access tokens with rotating HttpOnly refresh cookies.
- Invitation and password-reset email jobs, with local Mailpit support.
- Optimistic task updates and Socket.IO synchronization.
- Redis dashboard caching with database fallback.

## Prerequisites

- Docker Desktop with Docker Compose v2 (recommended), or Node.js 22+, PostgreSQL 16+, and Redis 7+.
- Ports 3000, 3001, 5432, 6379, 8025, and 1025 available for the full local Compose stack.

## Start the application with Docker

From the repository root:

```powershell
docker compose up --build
```

Compose waits for PostgreSQL and Redis health, runs Prisma migrations in a one-shot migration service, then starts the backend, worker, and frontend. The local URLs are:

- Web app: <http://localhost:3000>
- API: <http://localhost:3001/api>
- Mailpit inbox: <http://localhost:8025>

Check backend liveness and readiness:

```powershell
Invoke-RestMethod http://localhost:3001/api/health
Invoke-RestMethod http://localhost:3001/api/health/ready
```

Stop the services without deleting the local database:

```powershell
docker compose down
```

The default Compose credentials and token secrets are for local development only. Do not expose this configuration publicly. For deployment, use strong secrets and a publicly reachable app URL; see [docs/deployment.md](docs/deployment.md).

## Seed a local demo

After the stack is healthy:

```powershell
docker compose run --rm -e NODE_ENV=development backend npm run db:seed
```

The repeatable seed creates:

- `owner@orbit.local` — Owner
- `admin@orbit.local` — Admin
- `member@orbit.local` — Member
- `viewer@orbit.local` — Viewer
- `isolation@orbit.local` — Owner of a separate workspace

The default local demo password is `OrbitDemo2026!`. Set `DEMO_USER_PASSWORD` when running the seed to use a different value. The seed refuses to run when `NODE_ENV=production`; change the local demo password before using these accounts beyond a local demonstration.

## Local development without Docker

Start PostgreSQL and Redis, then configure the backend:

```powershell
cd backend
Copy-Item .env.example .env
npm ci
npm run db:generate
npm run db:migrate:dev
npm run dev
```

In another terminal:

```powershell
cd frontend
Copy-Item .env.example .env
npm ci
npm run dev
```

For local work outside Compose, start the email worker separately with `npm run worker` from `backend/`, or use the in-process worker setting as appropriate for your environment. The SMTP default in Compose routes messages to Mailpit; configure real SMTP and a public `APP_BASE_URL` for external recipients.

## Tests and quality gates

With PostgreSQL and Redis available locally, from `backend/`:

```powershell
npm test
npm run lint
npm run build
```

The backend test command applies Prisma migrations to the `integration_test` schema in the local `workspace_dev` database before running tests. Tests clear records only in that schema. Never point the test database URL at production data.

From `frontend/`:

```powershell
npm run type-check
npm run lint
npm test -- --run
npm run build
```

GitHub Actions runs backend build/lint/integration tests, frontend type-check/lint/tests/build, and Docker image builds.

## Project layout

- `backend/` — Express API, Prisma schema and migrations, Socket.IO, Redis cache, BullMQ email worker, and tests.
- `frontend/` — Next.js Pages Router UI and browser-side session/realtime code.
- `docs/` — Architecture, decisions, deployment, phase notes, and endpoint verification.
- `docker-compose.yml` — Local PostgreSQL, Redis, Mailpit, migration, backend, worker, and frontend services.
- `.github/workflows/ci.yml` — Required CI checks.

## Architecture and API

The API is rooted at `/api`. Main route groups:

- `/auth` — signup, login, token refresh, logout, current user, and password recovery.
- `/workspaces` — workspace and member management, invitations, boards, lists, tasks, labels, dashboard, and activity.
- `/invitations` — public invitation preview and authenticated acceptance.
- `/health` and `/health/ready` — liveness and dependency readiness.

See [docs/design.md](docs/design.md), [docs/decisions.md](docs/decisions.md), and [docs/priority1-verification.md](docs/priority1-verification.md) for authorization rules, data relationships, runtime decisions, and tested API behavior.

## Known limitations

- Fractional order keys do not yet automatically rebalance after extensive repeated inserts.
- Ownership transfer and offline-first operation are not implemented.
- Multi-instance Socket.IO event delivery requires Redis; the app retains local event delivery without it.
- Real external email delivery requires valid provider credentials, a verified sender, and a non-local `APP_BASE_URL`.

# Real-Time Collaborative Workspace with RBAC

A full-stack, production-ready collaborative workspace application featuring real-time updates, role-based access control, and multi-tenant architecture.

## Features

- **Multi-tenant Workspaces**: Complete data isolation between organizations
- **Role-Based Access Control (RBAC)**: Owner, Admin, Member, Viewer roles with granular permissions
- **Real-time Collaboration**: WebSocket-powered live updates across connected clients
- **Task Management**: Boards, lists, and tasks with drag-and-drop reordering
- **Activity Audit Trail**: Complete history of all mutations
- **Search & Filtering**: Full-text search with multiple filter options
- **Email Invitations**: Async job queue for sending invitations
- **Optimistic Locking**: Conflict resolution for concurrent edits
- **Caching**: Redis-backed caching for expensive reads
- **Authentication**: JWT + refresh token rotation with reuse detection

## Project Structure

```
.
├── backend/                 # Express + Prisma + Socket.IO server
│   ├── src/
│   │   ├── config/         # Configuration validation
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API route handlers
│   │   ├── services/       # Business logic
│   │   ├── types/          # TypeScript types
│   │   ├── authz/          # Authorization logic
│   │   ├── utils/          # Utility functions
│   │   ├── worker/         # Background job worker
│   │   └── index.ts        # Server entry point
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema
│   │   └── migrations/     # Database migrations
│   ├── tests/              # Integration tests
│   └── Dockerfile
├── frontend/               # Next.js React application
│   ├── src/
│   │   ├── app/            # Next.js app directory
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Client utilities
│   │   ├── store/          # Zustand state management
│   │   └── types/          # TypeScript types
│   └── Dockerfile
├── docs/                   # Documentation
│   ├── design.md          # System design
│   ├── decisions.md       # Architectural decisions
│   └── deployment.md      # Deployment guide
├── docker-compose.yml     # Local development setup
└── .github/
    └── workflows/
        └── ci.yml         # GitHub Actions CI pipeline
```

## Getting Started

### Prerequisites

- Docker & Docker Compose (recommended for development)
- Node.js 20+ (if running locally)
- PostgreSQL 16+ (if not using Docker)
- Redis 7+ (if not using Docker)

### Quick Start with Docker

```bash
# Clone the repository
git clone <repo-url>
cd Aashita\ Asignment

# Start services
docker compose up --build

# Run migrations (in a new terminal)
docker exec workspace_backend npm run db:migrate:deploy

# Seed database (optional)
docker exec workspace_backend npm run db:seed
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api
- WebSocket: ws://localhost:3001

### Local Development (without Docker)

#### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your local database URL

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate:dev

# Start development server
npm run dev
```

#### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Start development server
npm run dev
```

## API Documentation

### Authentication Endpoints

- `POST /api/auth/signup` - Create new user account
- `POST /api/auth/login` - Login with email and password
- `POST /api/auth/refresh` - Refresh access token using cookie
- `POST /api/auth/logout` - Logout and revoke token
- `GET /api/auth/me` - Get current user details

### Workspace Endpoints

- `POST /api/workspaces` - Create new workspace
- `GET /api/workspaces` - List user's workspaces
- `GET /api/workspaces/:id` - Get workspace details
- `PATCH /api/workspaces/:id` - Update workspace

### Board Endpoints

- `POST /api/workspaces/:workspaceId/boards` - Create board
- `GET /api/workspaces/:workspaceId/boards` - List boards
- `GET /api/workspaces/:workspaceId/boards/:boardId` - Get board details
- `PATCH /api/workspaces/:workspaceId/boards/:boardId` - Update board
- `DELETE /api/workspaces/:workspaceId/boards/:boardId` - Delete board

### Task Endpoints

- `POST /api/workspaces/:workspaceId/lists/:listId/tasks` - Create task
- `GET /api/workspaces/:workspaceId/tasks/:taskId` - Get task details
- `PATCH /api/workspaces/:workspaceId/tasks/:taskId` - Update task
- `POST /api/workspaces/:workspaceId/tasks/:taskId/move` - Move task
- `DELETE /api/workspaces/:workspaceId/tasks/:taskId` - Delete task
- `GET /api/workspaces/:workspaceId/tasks` - Search and filter tasks

### Member Management

- `GET /api/workspaces/:workspaceId/members` - List workspace members
- `POST /api/workspaces/:workspaceId/invitations` - Invite member
- `GET /api/workspaces/:workspaceId/invitations` - List pending invitations
- `DELETE /api/workspaces/:workspaceId/members/:memberId` - Remove member
- `PATCH /api/workspaces/:workspaceId/members/:memberId` - Change member role

### Activity & Analytics

- `GET /api/workspaces/:workspaceId/activity` - Get activity log
- `GET /api/workspaces/:workspaceId/dashboard` - Get workspace dashboard (cached)

## Testing

### Run All Tests

```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test
```

### Run Tests in Watch Mode

```bash
cd backend
npm run test:watch
```

### Coverage Report

```bash
cd backend
npm test -- --coverage
```

## Authentication & Tokens

### Access Token

- **Type**: JWT (HS256)
- **TTL**: 15 minutes (configurable)
- **Storage**: In-memory only (not in localStorage)
- **Claims**: `sub` (user ID), `iat`, `exp`, `iss`, `aud`

### Refresh Token

- **Type**: Opaque random 32-byte token
- **Storage**: Secure httpOnly cookie
- **Family-based Reuse Detection**:
  - Within grace window (5 minutes): Returns `REFRESH_RETRY` status
  - Outside grace window: Revokes entire token family (security measure)
- **Rotation**: New token issued on every refresh

### Token Revocation

- **Access tokens**: Expire after TTL
- **Refresh tokens**: Can be revoked individually or by family
- **Member removal**: All tokens revoked immediately
- **Role changes**: Effective on next permission check (roles stored in DB, not in JWT)

## Database Migrations

### Create New Migration

```bash
cd backend
npm run db:migrate:dev
# Follow the prompts
```

### Review Pending Migrations

```bash
cd backend
npm run db:migrate:dev -- --create-only
```

### Deploy Migrations (Production)

```bash
cd backend
npm run db:migrate:deploy
```

## Deployment

See [docs/deployment.md](docs/deployment.md) for detailed deployment instructions including:

- Rendering backend on Render
- Frontend on Vercel
- Environment configuration
- Database setup
- Redis setup
- Email configuration

## Performance Considerations

### Caching Strategy

- Dashboard endpoint cached for 5 minutes with automatic invalidation
- Redis-backed cache with graceful fallback to database
- Cache keys versioned to handle schema changes

### Database Optimization

- Fractional indexing for efficient position-based ordering
- Indexed queries for common filters (assignee, status, labels)
- Composite indexes for pagination cursors
- Partial indexes where applicable

### Real-time Optimization

- Socket.IO Redis adapter for horizontal scaling
- Events emitted only after transaction commits
- Clients apply updates only if version is newer (prevents older updates)
- Automatic resync on reconnect

## Error Handling

All API errors follow a standard format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": [],
    "requestId": "uuid"
  }
}
```

### Common Error Codes

- `VALIDATION_ERROR` (400): Invalid request format
- `UNAUTHENTICATED` (401): Missing or invalid authentication
- `TOKEN_EXPIRED` (401): JWT token has expired
- `FORBIDDEN` (403): User lacks permission for action
- `NOT_FOUND` (404): Resource not found
- `VERSION_CONFLICT` (409): Optimistic lock conflict
- `SERVICE_UNAVAILABLE` (503): Database or critical service down

## Development Guidelines

### Code Style

- Strict TypeScript (`tsconfig.json` with `strict: true`)
- ESLint configuration for code quality
- Prettier for consistent formatting
- No `any` types allowed

### Commit Conventions

Uses Conventional Commits:

```
feat(auth): implement JWT refresh token rotation
fix(tasks): resolve concurrent move race condition
test(rbac): add permission matrix validation tests
docs: update deployment guide
chore(deps): upgrade prisma to 5.7.0
```

### Before Pushing

```bash
# Format code
npm run format

# Type check
npm run build

# Lint
npm run lint

# Test
npm test
```

## Contributing

1. Create a feature branch: `git checkout -b feature/description`
2. Make changes following the coding guidelines
3. Write tests for new functionality
4. Run the full test suite locally
5. Commit with conventional messages
6. Push and create a pull request

## Security Considerations

- **Tenant Isolation**: Enforced at middleware and query levels
- **Authorization**: Server-side enforcement on every mutation
- **Passwords**: Hashed with argon2id
- **Tokens**: Opaque refresh tokens with rotation
- **SQL Injection**: Prisma parameterized queries
- **CORS**: Restricted to configured frontend origins
- **Helmet**: Security headers enabled
- **Rate Limiting**: Per-user and per-IP limiting
- **Secrets**: Never committed; all env vars required

## Monitoring & Logging

### Development

- Structured logging with request IDs
- Full stack traces and error details
- WebSocket event logging

### Production

- Minimal stack traces (security)
- Request tracing with unique IDs
- Application health checks
- Integration with error tracking (Sentry optional)

## Known Limitations

1. **Position Key Growth**: No automatic rebalancing of fractional-index keys (acceptable for reasonable list sizes)
2. **Ownership Transfer**: Not implemented (single owner per workspace, by design)
3. **Offline Support**: No offline-first architecture (requires connected clients)
4. **Horizontal Scaling**: Requires Redis for Socket.IO adapter; local-only fallback available

## Troubleshooting

### Cannot connect to PostgreSQL

```bash
# Check if postgres service is running
docker ps | grep postgres

# View postgres logs
docker logs workspace_postgres
```

### Redis connection issues

```bash
# Test redis connection
redis-cli -u redis://localhost:6379 ping
```

### WebSocket connection failed

- Ensure `FRONTEND_ORIGIN` matches your frontend URL
- Check that WebSocket upgrade is not blocked by firewall/proxy
- Verify transports configuration (websocket only, no long-polling)

### Database migration conflicts

```bash
# Reset database (development only!)
npm run db:reset
```

## License

MIT

## Support

For issues and questions, please open a GitHub issue or contact the development team.

---

**Last Updated**: Phase 0 - Boilerplate  
**Version**: 1.0.0  
**Status**: Ready for Phase 1 (Environment)

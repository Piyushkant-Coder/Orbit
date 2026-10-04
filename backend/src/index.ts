import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { prisma } from './db';
import { validateEnv } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { createClient } from 'redis';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import workspaceRoutes from './routes/workspaces';
import invitationRoutes from './routes/invitations';
import phase3Routes from './routes/phase3';
import { installRealtimeHandlers } from './realtime';
import { startEmailWorker } from './queue/email';
import { closeDashboardCache } from './cache/dashboard';

const app: Express = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN,
    credentials: true,
  },
  transports: ['websocket'],
});

const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redis.on('error', (error) => console.error('Redis client error:', error));

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN,
  credentials: true,
}));
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(requestId);
app.use(requestLogger);

const authRateLimit = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000),
  limit: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many authentication requests', requestId: (res.getHeader('X-Request-ID') as string) || 'unknown' },
    });
  },
});

app.use('/api/auth', authRateLimit, authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/workspaces', phase3Routes);

// Health check endpoints
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/health/ready', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    let redisStatus = 'ok';
    
    try {
      await redis.ping();
    } catch {
      redisStatus = 'degraded';
    }
    
    res.status(200).json({
      status: 'ready',
      database: 'ok',
      redis: redisStatus,
    });
  } catch (_error) {
    res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database is not ready',
      },
    });
  }
});

// Root API route
app.get('/api', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

const pubClient = redis.duplicate();
const subClient = redis.duplicate();
let emailWorker: ReturnType<typeof startEmailWorker> | undefined;

installRealtimeHandlers(io);

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = Number(process.env.PORT || 3001);
const startServer = async () => {
  try {
    const env = validateEnv();
    await prisma.$connect();
    console.log('✓ Database connected');
    
    try {
      await redis.connect();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      await redis.ping();
      console.log('✓ Redis connected');
    } catch (redisError) {
      console.error('Redis unavailable; continuing with local realtime delivery:', redisError);
    }
    if (env.RUN_WORKER_IN_PROCESS) {
      emailWorker = startEmailWorker();
      console.log('✓ Email worker running in process');
    }
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✓ Server running on http://0.0.0.0:${PORT}`);
      console.log(`✓ WebSocket ready at ws://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    await emailWorker?.close();
    await closeDashboardCache();
    await redis.quit();
    console.log('Server shut down');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  validateEnv();
  startServer();
}

export { app, server, io, prisma, redis };

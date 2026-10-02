import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { PrismaClient } from '@prisma/client';
import { validateEnv } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { createClient } from 'redis';

const app: Express = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN,
    credentials: true,
  },
  transports: ['websocket'],
});

const prisma = new PrismaClient();
const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redis.on('error', (error) => console.error('Redis client error:', error));

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN,
  credentials: true,
}));
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(requestId);
app.use(requestLogger);

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
  } catch (error) {
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

// Socket.IO setup
const pubClient = redis.duplicate();
const subClient = redis.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
}).catch((error) => {
  console.error('Socket.IO Redis adapter connection failed:', error);
  // Continue without Redis adapter for local dev
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('UNAUTHORIZED'));
  }
  // Token verification will be implemented in Phase 2
  next();
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = Number(process.env.PORT || 3001);
const startServer = async () => {
  try {
    await prisma.$connect();
    console.log('✓ Database connected');
    
    await redis.ping();
    console.log('✓ Redis connected');
    
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

// Validate environment variables
validateEnv();

// Start the server
startServer();

export { app, server, io, prisma, redis };

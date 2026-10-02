import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url('Invalid DATABASE_URL'),
  REDIS_URL: z.string().url('Invalid REDIS_URL').optional(),
  ACCESS_TOKEN_SECRET: z.string().min(32, 'ACCESS_TOKEN_SECRET must be at least 32 bytes'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 bytes'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().default(604800),
  REFRESH_TOKEN_GRACE_PERIOD_SECONDS: z.coerce.number().default(300),
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().default(10),
  FRONTEND_ORIGIN: z.string().url('Invalid FRONTEND_ORIGIN'),
  APP_BASE_URL: z.string().url('Invalid APP_BASE_URL').default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  SENTRY_DSN: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
});

type Env = z.infer<typeof envSchema>;

let env: Env | null = null;

export function validateEnv(): Env {
  if (env) {
    return env;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Environment validation failed:');
    result.error.errors.forEach((error) => {
      console.error(`  ${error.path.join('.')}: ${error.message}`);
    });
    process.exit(1);
  }

  env = result.data;
  return env;
}

export function getEnv(): Env {
  if (!env) {
    validateEnv();
  }
  return env!;
}

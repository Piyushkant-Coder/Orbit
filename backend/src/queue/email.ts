import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import nodemailer from 'nodemailer';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export function createEmailRedisConnection(
  url = redisUrl,
  maxRetriesPerRequest: number | null = 1
): Redis {
  return new Redis(url, {
    maxRetriesPerRequest,
    enableOfflineQueue: maxRetriesPerRequest === null,
    lazyConnect: true,
  });
}

const queueRedis = createEmailRedisConnection();

async function addEmailJob(name: string, data: EmailJobData, jobId: string): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      emailQueue.add(name, data, { jobId }).then(() => undefined),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Email queue enqueue timed out')), 3000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export interface InvitationEmailData {
  type: 'invitation';
  invitationId: string;
  to: string;
  workspaceName: string;
  inviterName: string;
  inviteUrl: string;
  tokenGeneration: number;
}
export interface PasswordResetEmailData {
  type: 'password-reset';
  resetUrl: string;
  to: string;
  userName: string;
}

type EmailJobData = InvitationEmailData | PasswordResetEmailData;

interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export const emailQueue = new Queue<EmailJobData>('email', {
  connection: queueRedis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

export async function enqueueInvitationEmail(data: InvitationEmailData): Promise<void> {
  try {
    await addEmailJob(
      'send-invitation-email',
      data,
      `invite-email:${data.invitationId}:${data.tokenGeneration}`
    );
  } catch (error) {
    console.error('Invitation email enqueue failed; link remains available:', error);
  }
}

export async function enqueuePasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
  try {
    await addEmailJob(
      'send-password-reset-email',
      data,
      `password-reset:${data.to}:${data.resetUrl}`
    );
  } catch (error) {
    console.error('Password reset email enqueue failed:', error);
  }
}

function getResendApiKey(): string | undefined {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;

  const smtpUrl = process.env.SMTP_URL;
  if (!smtpUrl) return undefined;

  const url = new URL(smtpUrl);
  if (url.hostname !== 'smtp.resend.com' || url.username !== 'resend' || !url.password) {
    return undefined;
  }
  return decodeURIComponent(url.password);
}

export async function sendResendEmail(
  apiKey: string,
  email: OutgoingEmail,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(email),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Resend email request failed with status ${response.status}`);
  }

  const result: unknown = await response.json();
  if (
    typeof result !== 'object' ||
    result === null ||
    !('id' in result) ||
    typeof result.id !== 'string'
  ) {
    throw new Error('Resend returned an invalid email response');
  }
}

async function processEmail(job: Job<EmailJobData>): Promise<void> {
  const from = process.env.SMTP_FROM;
  if (!from) throw new Error('SMTP_FROM must be configured to send email');

  const email: OutgoingEmail =
    job.data.type === 'invitation'
      ? {
          from,
          to: job.data.to,
          subject: `Invitation to ${job.data.workspaceName}`,
          text: `${job.data.inviterName} invited you to ${job.data.workspaceName}: ${job.data.inviteUrl}`,
        }
      : {
          from,
          to: job.data.to,
          subject: 'Reset your Orbit password',
          text: `Hi ${job.data.userName}, reset your Orbit password here: ${job.data.resetUrl}\n\nThis link expires in one hour.`,
        };

  const resendApiKey = getResendApiKey();
  if (resendApiKey) {
    await sendResendEmail(resendApiKey, email);
    return;
  }

  const smtpUrl = process.env.SMTP_URL;
  if (!smtpUrl) {
    throw new Error('RESEND_API_KEY or SMTP_URL must be configured to send email');
  }

  const transport = nodemailer.createTransport(smtpUrl);
  try {
    await transport.sendMail(email);
  } finally {
    transport.close();
  }
}

export function startEmailWorker(): Worker<EmailJobData> {
  const workerRedis = createEmailRedisConnection(redisUrl, null);
  const worker = new Worker<EmailJobData>('email', processEmail, {
    connection: workerRedis,
  });
  worker.on('failed', (job, error) => console.error('Email job failed:', job?.id, error));
  return worker;
}

export async function closeEmailQueue(): Promise<void> {
  await emailQueue.close();
  if (queueRedis.status === 'end') return;
  if (queueRedis.status === 'ready') await queueRedis.quit();
  else queueRedis.disconnect();
}

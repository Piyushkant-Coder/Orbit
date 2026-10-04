import { Queue, Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';

const connection = {
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
  port: Number(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || 6379),
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
};

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

export const emailQueue = new Queue<EmailJobData>('email', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

export async function enqueueInvitationEmail(data: InvitationEmailData): Promise<void> {
  try {
    await emailQueue.add('send-invitation-email', data, {
      jobId: `invite-email:${data.invitationId}:${data.tokenGeneration}`,
    });
  } catch (error) {
    console.error('Invitation email enqueue failed; link remains available:', error);
  }
}

export async function enqueuePasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
  try {
    await emailQueue.add('send-password-reset-email', data, {
      jobId: `password-reset:${data.to}:${data.resetUrl}`,
    });
  } catch (error) {
    console.error('Password reset email enqueue failed:', error);
  }
}

async function processEmail(job: Job<EmailJobData>): Promise<void> {
  const smtpUrl = process.env.SMTP_URL;
  if (!smtpUrl) {
    console.log(`Email link for ${job.data.to}: ${'inviteUrl' in job.data ? job.data.inviteUrl : job.data.resetUrl}`);
    return;
  }
  const transport = nodemailer.createTransport(smtpUrl);
  if (job.data.type === 'invitation') {
    await transport.sendMail({
      from: process.env.SMTP_FROM || 'no-reply@example.com',
      to: job.data.to,
      subject: `Invitation to ${job.data.workspaceName}`,
      text: `${job.data.inviterName} invited you to ${job.data.workspaceName}: ${job.data.inviteUrl}`,
    });
    return;
  }
  await transport.sendMail({
    from: process.env.SMTP_FROM || 'no-reply@example.com',
    to: job.data.to,
    subject: 'Reset your Orbit password',
    text: `Hi ${job.data.userName}, reset your Orbit password here: ${job.data.resetUrl}\n\nThis link expires in one hour.`,
  });
}

export function startEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>('email', processEmail, {
    connection: { ...connection, maxRetriesPerRequest: null },
  });
  worker.on('failed', (job, error) => console.error('Invitation email job failed:', job?.id, error));
  return worker;
}

export async function closeEmailQueue(): Promise<void> {
  await emailQueue.close();
}

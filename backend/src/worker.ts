import { startEmailWorker } from './queue/email';

const worker = startEmailWorker();
console.log('Email worker started');

const shutdown = async () => {
  await worker.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

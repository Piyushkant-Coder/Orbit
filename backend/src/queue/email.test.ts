import { closeEmailQueue, createEmailRedisConnection } from './email';

describe('email Redis connection', () => {
  afterAll(async () => {
    await closeEmailQueue();
  });

  it('uses credentials and TLS settings from the Railway Redis URL', () => {
    const connection = createEmailRedisConnection(
      'rediss://orbit-worker:test-password@redis.example.com:6380/2'
    );

    expect(connection.options).toMatchObject({
      host: 'redis.example.com',
      port: 6380,
      username: 'orbit-worker',
      password: 'test-password',
      db: 2,
      tls: {},
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    connection.disconnect();
  });

  it('uses worker retry settings while connecting to the same authenticated Redis URL', () => {
    const connection = createEmailRedisConnection(
      'redis://orbit-worker:test-password@redis.example.com:6379/0',
      null
    );

    expect(connection.options).toMatchObject({
      host: 'redis.example.com',
      username: 'orbit-worker',
      password: 'test-password',
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
    });

    connection.disconnect();
  });
});

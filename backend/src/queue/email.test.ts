import { closeEmailQueue, createEmailRedisConnection, sendResendEmail } from './email';

describe('email Redis connection', () => {
  afterAll(async () => {
    await closeEmailQueue();
  });

  describe('Resend email delivery', () => {
    const email = {
      from: 'Orbit <no-reply@mail.example.com>',
      to: 'recipient@example.com',
      subject: 'Test',
      text: 'Test message',
    };

    it('sends email through the Resend HTTPS API', async () => {
      const fetcher = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
        new Response(JSON.stringify({ id: 'email-id' }), { status: 200 })
      );

      await sendResendEmail('test-api-key', email, fetcher);

      expect(fetcher).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(email),
        })
      );
    });

    it('fails the job when Resend rejects a request', async () => {
      const fetcher = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
        new Response('{}', { status: 401 })
      );

      await expect(sendResendEmail('invalid-api-key', email, fetcher)).rejects.toThrow(
        'Resend email request failed with status 401'
      );
    });
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

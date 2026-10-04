const redisMock = {
  status: 'wait',
  on: jest.fn(),
  connect: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
  get: jest.fn(),
  set: jest.fn(),
  incr: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
  disconnect: jest.fn(),
};

jest.doMock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => redisMock),
}));

describe('dashboard cache fallback', () => {
  it('serves database results and closes cleanly when Redis is unavailable', async () => {
    const { getDashboard, closeDashboardCache } = await import('./dashboard');
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const result = await getDashboard('00000000-0000-4000-8000-000000000000');
      expect(result.hit).toBe(false);
      expect(result.dashboard.boardCount).toBe(0);
      expect(result.dashboard.memberCount).toBe(0);
      await closeDashboardCache();
      expect(redisMock.disconnect).toHaveBeenCalledTimes(1);
    } finally {
      errorLog.mockRestore();
    }
  });
});

import { decodeCursor, encodeCursor, nextPosition } from './ordering';

describe('ordering utilities', () => {
  it('creates keys that sort between their anchors', () => {
    const middle = nextPosition('a0', 'a1');
    expect('a0' < middle).toBe(true);
    expect(middle < 'a1').toBe(true);
  });

  it('round-trips opaque cursors', () => {
    const cursor = encodeCursor({ id: 'task-id', position: 'a0' });
    expect(decodeCursor(cursor)).toEqual({ id: 'task-id', position: 'a0' });
  });

  it('rejects malformed cursors', () => {
    expect(() => decodeCursor('not-json')).toThrow('Invalid cursor');
  });
});

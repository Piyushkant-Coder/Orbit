import { describe, expect, it } from 'vitest';
import { applyRealtimeTask } from './board';

describe('board realtime guards', () => {
  it('ignores stale updates and accepts newer versions', () => {
    const current = [{ id: 'task', version: 3, title: 'new' }];
    expect(applyRealtimeTask(current, { id: 'task', version: 2, title: 'old' })).toEqual(current);
    expect(applyRealtimeTask(current, { id: 'task', version: 4, title: 'latest' })).toEqual([{ id: 'task', version: 4, title: 'latest' }]);
  });
  it('removes deleted tasks and appends new tasks', () => {
    const current = [{ id: 'task', version: 1 }];
    expect(applyRealtimeTask(current, { id: 'task', version: 1 }, true)).toEqual([]);
    expect(applyRealtimeTask(current, { id: 'other', version: 1 })).toHaveLength(2);
  });
});

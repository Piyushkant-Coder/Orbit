export interface RealtimeTask { id: string; version: number; [key: string]: unknown }

export function applyRealtimeTask(tasks: RealtimeTask[], incoming: RealtimeTask, deleted = false): RealtimeTask[] {
  if (deleted) return tasks.filter((task) => task.id !== incoming.id);
  const current = tasks.find((task) => task.id === incoming.id);
  if (current && incoming.version < current.version) return tasks;
  return current ? tasks.map((task) => task.id === incoming.id ? incoming : task) : [...tasks, incoming];
}

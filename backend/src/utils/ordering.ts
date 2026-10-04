export function nextPosition(previous: string | null, next: string | null): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  if (!previous && !next) return 'U';

  let prefix = '';
  for (let index = 0; index < 128; index += 1) {
    const previousValue = previous && index < previous.length ? alphabet.indexOf(previous[index]) : -1;
    const nextValue = next && index < next.length ? alphabet.indexOf(next[index]) : alphabet.length;
    if (previousValue < 0 && previous && index < previous.length) {
      throw new Error('Invalid previous position');
    }
    if (nextValue < 0 && next && index < next.length) {
      throw new Error('Invalid next position');
    }
    if (nextValue - previousValue > 1) {
      return `${prefix}${alphabet[Math.floor((previousValue + nextValue) / 2)]}`;
    }
    prefix += alphabet[Math.max(previousValue, 0)];
  }
  throw new Error('Unable to generate a position between the supplied anchors');
}

export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor<T>(value: string | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    throw new Error('Invalid cursor');
  }
}

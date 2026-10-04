/** Counts failures per key in a sliding window; blocks a key once it reaches `max`. In-memory only. */
export class FailureLimiter {
  private failures = new Map<string, number[]>();

  constructor(private max: number, private windowMs: number) {}

  private recent(key: string, now: number) {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  isBlocked(key: string, now = Date.now()) {
    return this.recent(key, now).length >= this.max;
  }

  fail(key: string, now = Date.now()) {
    this.failures.set(key, [...this.recent(key, now), now]);
  }
}

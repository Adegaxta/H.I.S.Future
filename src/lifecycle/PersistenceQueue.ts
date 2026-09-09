export type PersistenceWriter<T> = (value: T) => Promise<void>;

/**
 * Serializes persistence and coalesces queued snapshots to the newest state.
 * A failed write is never reported as flushed; callers can retry explicitly.
 */
export class PersistenceQueue<T> {
  private pending: T | null = null;
  private drainPromise: Promise<void> | null = null;

  constructor(private readonly write: PersistenceWriter<T>) {}

  enqueue(value: T): Promise<void> {
    this.pending = value;
    return this.startDrain();
  }

  flush(): Promise<void> {
    if (this.drainPromise) return this.drainPromise;
    return this.pending === null ? Promise.resolve() : this.startDrain();
  }

  hasPendingWrites(): boolean {
    return this.pending !== null || this.drainPromise !== null;
  }

  private async drain(): Promise<void> {
    while (this.pending !== null) {
      const value = this.pending;
      this.pending = null;
      try {
        await this.write(value);
      } catch (error) {
        // A newer snapshot supersedes this one; otherwise retain it for an explicit retry.
        if (this.pending === null) this.pending = value;
        throw error;
      }
    }
  }

  private startDrain(): Promise<void> {
    if (!this.drainPromise) {
      this.drainPromise = this.drain().finally(() => {
        this.drainPromise = null;
      });
    }
    return this.drainPromise;
  }
}

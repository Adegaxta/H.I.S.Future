export type PersistenceWriter<T> = (value: T) => Promise<void>;
export type PersistenceMerger<T> = (current: T, next: T) => T;

/**
 * Serializes persistence and coalesces queued snapshots to the newest state.
 * A failed write is never reported as flushed; callers can retry explicitly.
 */
export class PersistenceQueue<T> {
  private pending: T | null = null;
  private drainPromise: Promise<void> | null = null;

  constructor(
    private readonly write: PersistenceWriter<T>,
    private readonly merge: PersistenceMerger<T> = (_current, next) => next,
  ) {}

  enqueue(value: T): Promise<void> {
    this.pending = this.pending === null ? value : this.merge(this.pending, value);
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
        // Preserve failed work unless the configured merger can prove that a
        // newer request supersedes it.
        this.pending = this.pending === null ? value : this.merge(value, this.pending);
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

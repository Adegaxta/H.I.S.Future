export interface DestroyableLoadingTask<T> {
  promise: Promise<T>;
  destroy: () => Promise<void>;
}

export interface PdfDocumentLease<T> {
  promise: Promise<T>;
  release: (onDestroyed?: (durationMs: number) => void) => void;
}

/**
 * Owns the PDF.js loading task that takes ownership of the supplied byte buffer.
 * React StrictMode replays effects as release -> acquire; destruction is deferred
 * by one microtask so that replay reuses the task instead of consuming the same
 * transferred Uint8Array twice.
 */
export class PdfDocumentSession<T> {
  private generation = 0;
  private destroyed = false;
  private destroyPromise: Promise<void> | null = null;

  constructor(
    readonly data: Uint8Array,
    readonly task: DestroyableLoadingTask<T>,
  ) {}

  acquire(): PdfDocumentLease<T> {
    if (this.destroyed) throw new Error("No se puede reutilizar una sesión PDF destruida.");
    const generation = ++this.generation;
    let released = false;
    return {
      promise: this.task.promise,
      release: (onDestroyed) => {
        if (released) return;
        released = true;
        queueMicrotask(() => {
          if (this.generation !== generation || this.destroyed) return;
          this.destroyed = true;
          const started = performance.now();
          this.destroyPromise = this.task.destroy().finally(() => {
            onDestroyed?.(performance.now() - started);
          });
          void this.destroyPromise.catch(() => undefined);
        });
      },
    };
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }
}

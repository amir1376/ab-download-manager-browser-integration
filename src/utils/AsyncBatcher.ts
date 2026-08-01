export interface AsyncBatcherOptions {
    debounceMs: number
    maxWaitMs: number
}

interface PendingBatch<T, R> {
    items: T[]
    result: Promise<R>
    resolve: (result: R) => void
    reject: (reason: unknown) => void
    startedAt: number
    timer: ReturnType<typeof setTimeout> | null
}

/** Collects items with the same key after a short quiet period. */
export class AsyncBatcher<T, R> {
    private readonly batches = new Map<string, PendingBatch<T, R>>()

    constructor(
        private readonly flush: (items: T[]) => Promise<R>,
        private readonly options: AsyncBatcherOptions,
    ) {
    }

    enqueue(key: string, item: T): Promise<R> {
        let batch = this.batches.get(key)
        if (!batch) {
            let resolve!: (result: R) => void
            let reject!: (reason: unknown) => void
            const result = new Promise<R>((resolvePromise, rejectPromise) => {
                resolve = resolvePromise
                reject = rejectPromise
            })
            batch = {
                items: [],
                result,
                resolve,
                reject,
                startedAt: Date.now(),
                timer: null,
            }
            this.batches.set(key, batch)
        }

        batch.items.push(item)
        this.scheduleFlush(key, batch)
        return batch.result
    }

    private scheduleFlush(key: string, batch: PendingBatch<T, R>) {
        if (batch.timer !== null) {
            clearTimeout(batch.timer)
        }
        const elapsed = Date.now() - batch.startedAt
        const remainingMaxWait = Math.max(0, this.options.maxWaitMs - elapsed)
        batch.timer = setTimeout(() => {
            void this.flushBatch(key, batch)
        }, Math.min(this.options.debounceMs, remainingMaxWait))
    }

    private async flushBatch(key: string, batch: PendingBatch<T, R>) {
        if (this.batches.get(key) !== batch) {
            return
        }
        this.batches.delete(key)
        if (batch.timer !== null) {
            clearTimeout(batch.timer)
        }

        try {
            batch.resolve(await this.flush([...batch.items]))
        } catch (error) {
            batch.reject(error)
        }
    }
}

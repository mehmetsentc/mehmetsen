/**
 * Stand-in for `next/server` in the standalone crawler worker. Only `after()` is used
 * on the crawler path (AI usage telemetry); its callbacks are awaited before exit.
 */
const pending: Promise<unknown>[] = []

export function after(task: (() => unknown) | Promise<unknown>): void {
  const p = typeof task === 'function' ? Promise.resolve().then(task) : Promise.resolve(task)
  pending.push(p.catch((error) => console.warn('[worker] after() task failed', error)))
}

export async function drainAfter(): Promise<void> {
  while (pending.length) await Promise.all(pending.splice(0))
}

export class NextResponse {
  static json(): never {
    throw new Error('NextResponse is not available in the worker')
  }
}

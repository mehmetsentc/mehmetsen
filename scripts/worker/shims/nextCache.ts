/**
 * Stand-in for `next/cache` in the standalone crawler worker (FinOps, Railway).
 * There is no Next data cache here: cached loaders run directly, and tag/path
 * invalidation is a no-op (the worker never serves pages; Vercel keeps its own
 * time-based revalidation).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unstable_cache<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return fn
}
export function revalidateTag(tag: string): void {
  if (process.env.WORKER_DEBUG === '1') console.log('[worker] revalidateTag skipped', tag)
}
export function revalidatePath(path: string): void {
  if (process.env.WORKER_DEBUG === '1') console.log('[worker] revalidatePath skipped', path)
}
export function unstable_noStore(): void {}

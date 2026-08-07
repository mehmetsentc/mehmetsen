/**
 * Serializes Firestore one-shot reads to avoid SDK target race conditions
 * (React StrictMode + overlapping getDocs/getDoc can trigger ca9/b815 assertions).
 *
 * DEADLOCK GUARD: If a getDocs call hangs (no resolve/reject — e.g. Firestore
 * offline mode, network stall), the chain would block forever and every
 * subsequent read would queue indefinitely, making `loading` permanently true.
 * We advance the chain after CHAIN_ADVANCE_TIMEOUT_MS regardless, so the queue
 * drains even when an individual operation stalls.
 */
const CHAIN_ADVANCE_TIMEOUT_MS = 18_000

let chain: Promise<unknown> = Promise.resolve()

export function enqueueFirestoreRead<T>(operation: () => Promise<T>): Promise<T> {
  const result = chain.then(operation)
  // Advance the chain when the operation settles OR after a hard timeout —
  // whichever comes first. This prevents a single hung getDocs from
  // deadlocking all subsequent reads in the queue.
  chain = Promise.race([
    result.then(() => undefined, () => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, CHAIN_ADVANCE_TIMEOUT_MS)),
  ])
  return result
}

export function isFirestoreInternalError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('INTERNAL ASSERTION FAILED')
}

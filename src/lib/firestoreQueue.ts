/**
 * Serializes Firestore one-shot reads to avoid SDK target race conditions
 * (React StrictMode + overlapping getDocs/getDoc can trigger ca9/b815 assertions).
 */
let chain: Promise<unknown> = Promise.resolve()

export function enqueueFirestoreRead<T>(operation: () => Promise<T>): Promise<T> {
  const result = chain.then(operation)
  chain = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

export function isFirestoreInternalError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('INTERNAL ASSERTION FAILED')
}

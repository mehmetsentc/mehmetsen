/** Firestore `in` disjunction cap this app queries with (composite indexes are built for 10). */
export const FIRESTORE_IN_LIMIT = 10

export function chunkIds<T>(ids: readonly T[], size = FIRESTORE_IN_LIMIT): T[][] {
  if (ids.length === 0) return []
  const chunks: T[][] = []
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size))
  }
  return chunks
}

/**
 * Per-instance public-read circuit. No database write.
 * A tripped instance serves the last public snapshot instead of scanning again.
 * This does not see other instances or the Google Cloud total.
 */
const WINDOW_MS = 60_000
const TRIP_DOCUMENTS = 8_000

let windowStart = 0
let documents = 0
let open = false

export function publicReadCircuitOpen(): boolean {
  if (open && Date.now() - windowStart > WINDOW_MS) {
    open = false
    documents = 0
    windowStart = Date.now()
    console.info('[finops_circuit]', JSON.stringify({ state: 'closed' }))
  }
  return open
}

export function notePublicFirestoreReads(route: string, count: number): void {
  const n = Math.max(0, Math.round(count))
  if (!n) return
  const now = Date.now()
  if (!windowStart || now - windowStart > WINDOW_MS) {
    windowStart = now
    documents = 0
    if (open) {
      open = false
      console.info('[finops_circuit]', JSON.stringify({ state: 'closed', route }))
    }
  }
  documents += n
  console.info(
    '[finops_public_cache]',
    JSON.stringify({ route, cache: 'miss', documentsRead: n, windowDocuments: documents })
  )
  if (!open && documents >= TRIP_DOCUMENTS) {
    open = true
    console.warn(
      '[finops_circuit]',
      JSON.stringify({ state: 'open', route, windowDocuments: documents, windowMs: WINDOW_MS })
    )
  }
}

export function resetPublicReadBudgetForTests(): void {
  windowStart = 0
  documents = 0
  open = false
}

export const PUBLIC_READ_CIRCUIT_DOCUMENTS = TRIP_DOCUMENTS

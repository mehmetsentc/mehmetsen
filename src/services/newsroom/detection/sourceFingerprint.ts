/**
 * Per-source article fingerprints — event-driven change detection store.
 * Path: sourceFingerprints/{sourceId}/articles/{hash}
 */
import { createHash } from 'node:crypto'
import type { Firestore } from 'firebase-admin/firestore'
import { Collections } from '@/lib/firebase/collections'

export interface SourceArticleFingerprint {
  hash: string
  guid: string
  link: string
  title: string
  titleHash: string
  contentHash: string
  publishedAt: number | null
  lastSeenAt: number
  removedAt?: number | null
  newsId?: string | null
}

export function computeTitleHash(title: string): string {
  const normalized = title.trim().toLocaleLowerCase('tr-TR')
  return createHash('sha256').update(normalized).digest('hex').slice(0, 24)
}

export function computeContentHash(title: string, summary: string, content: string): string {
  const payload = `${title.trim()}|${summary.trim()}|${content.trim()}`.toLocaleLowerCase('tr-TR')
  return createHash('sha256').update(payload).digest('hex').slice(0, 32)
}

function articlesCollection(db: Firestore, sourceId: string) {
  return db.collection(Collections.SOURCE_FINGERPRINTS).doc(sourceId).collection('articles')
}

/**
 * Maximum fingerprints to load per source per run.
 *
 * Prior to this cap, every cron tick would read the entire fingerprint
 * sub-collection (frequently 1k–5k docs per source, growing forever) just
 * to do a diff against the latest 20–60 RSS items. The diff only cares
 * about *recent* known items — old fingerprints are dead weight, so we
 * scan the most recently seen ones and let stale entries fall out of
 * scope (a separate archive cron can hard-delete them).
 */
const FINGERPRINT_SCAN_LIMIT = 600

export async function loadSourceFingerprints(
  db: Firestore,
  sourceId: string
): Promise<Map<string, SourceArticleFingerprint>> {
  // Recency-ordered scan keeps the diff window small and bounded. Falls back
  // to an unordered scan only when the index/order field is missing on legacy
  // docs — we still cap the read at the same limit so a single source can
  // never blow up the daily Firestore read budget on its own.
  let docs
  try {
    const snap = await articlesCollection(db, sourceId)
      .orderBy('lastSeenAt', 'desc')
      .limit(FINGERPRINT_SCAN_LIMIT)
      .get()
    docs = snap.docs
  } catch {
    const snap = await articlesCollection(db, sourceId)
      .limit(FINGERPRINT_SCAN_LIMIT)
      .get()
    docs = snap.docs
  }

  const map = new Map<string, SourceArticleFingerprint>()
  for (const doc of docs) {
    map.set(doc.id, doc.data() as SourceArticleFingerprint)
  }
  return map
}

/**
 * Efficiently load fingerprints for ONLY the hashes currently in the RSS feed.
 *
 * Uses db.getAll() for point reads instead of a range scan — O(N_items) reads
 * (typically 20–60) instead of O(FINGERPRINT_SCAN_LIMIT = 600). This is the
 * hot-path replacement for loadSourceFingerprints in the per-run pipeline.
 *
 * Trade-off: "removed" detection is a no-op with this approach (stored only
 * contains hashes from the current feed, so nothing appears missing). Stale
 * fingerprints age out naturally; run a separate cleanup job to hard-delete them.
 */
export async function loadFingerprintsForHashes(
  db: Firestore,
  sourceId: string,
  hashes: string[]
): Promise<Map<string, SourceArticleFingerprint>> {
  if (hashes.length === 0) return new Map()
  const col = articlesCollection(db, sourceId)
  const refs = hashes.map((h) => col.doc(h))
  const snaps = await db.getAll(...refs)
  const map = new Map<string, SourceArticleFingerprint>()
  for (const snap of snaps) {
    if (snap.exists) map.set(snap.id, snap.data() as SourceArticleFingerprint)
  }
  return map
}

export async function upsertSourceFingerprint(
  db: Firestore,
  sourceId: string,
  fp: SourceArticleFingerprint
): Promise<void> {
  const now = Date.now()
  await articlesCollection(db, sourceId).doc(fp.hash).set(
    {
      ...fp,
      lastSeenAt: now,
      removedAt: null,
    },
    { merge: true }
  )
}

export async function markFingerprintRemoved(
  db: Firestore,
  sourceId: string,
  hash: string
): Promise<void> {
  await articlesCollection(db, sourceId).doc(hash).set(
    { removedAt: Date.now(), lastSeenAt: Date.now() },
    { merge: true }
  )
}

export async function linkFingerprintToNews(
  db: Firestore,
  sourceId: string,
  hash: string,
  newsId: string
): Promise<void> {
  await articlesCollection(db, sourceId).doc(hash).set({ newsId }, { merge: true })
}

export function buildFingerprintRecord(
  hash: string,
  guid: string,
  link: string,
  title: string,
  summary: string,
  content: string,
  publishedAt: number | null,
  newsId?: string | null
): SourceArticleFingerprint {
  return {
    hash,
    guid,
    link,
    title,
    titleHash: computeTitleHash(title),
    contentHash: computeContentHash(title, summary, content),
    publishedAt,
    lastSeenAt: Date.now(),
    removedAt: null,
    newsId: newsId ?? null,
  }
}

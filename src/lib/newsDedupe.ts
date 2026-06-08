/**
 * Shared dedupe for RSS ingestion — fingerprint + sourceUrl across news collections.
 */
import { createHash } from 'node:crypto'
import type { Firestore } from 'firebase-admin/firestore'
import { Collections } from '@/lib/firebase/collections'

/** Stable hash of canonical source URL (trailing slash stripped, lowercased). */
export function buildSourceUrlHash(sourceUrl: string): string {
  const normalized = sourceUrl.trim().toLowerCase().replace(/\/$/, '')
  return createHash('sha256').update(normalized).digest('hex').slice(0, 40)
}

async function existsByField(
  db: Firestore,
  collection: string,
  field: string,
  value: string
): Promise<boolean> {
  const snap = await db.collection(collection).where(field, '==', value).limit(1).get()
  return !snap.empty
}

/**
 * Returns true when the item already exists in `news`, `newsDrafts`, or `newsArchive`
 * (matched by rssFingerprint/fingerprint or sourceUrl/sourceHash).
 */
export async function isNewsItemDuplicate(
  db: Firestore,
  fingerprint: string,
  sourceUrl: string
): Promise<boolean> {
  const sourceHash = buildSourceUrlHash(sourceUrl)
  const checks = await Promise.all([
    existsByField(db, Collections.NEWS, 'rssFingerprint', fingerprint),
    existsByField(db, Collections.NEWS_DRAFTS, 'rssFingerprint', fingerprint),
    existsByField(db, Collections.NEWS_ARCHIVE, 'fingerprint', fingerprint),
    existsByField(db, Collections.NEWS, 'sourceUrl', sourceUrl),
    existsByField(db, Collections.NEWS_DRAFTS, 'sourceUrl', sourceUrl),
    existsByField(db, Collections.NEWS_ARCHIVE, 'sourceUrl', sourceUrl),
    existsByField(db, Collections.NEWS_ARCHIVE, 'sourceHash', sourceHash),
  ])
  return checks.some(Boolean)
}

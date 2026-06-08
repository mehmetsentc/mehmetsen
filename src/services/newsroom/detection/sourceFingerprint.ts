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

export async function loadSourceFingerprints(
  db: Firestore,
  sourceId: string
): Promise<Map<string, SourceArticleFingerprint>> {
  const snap = await articlesCollection(db, sourceId).get()
  const map = new Map<string, SourceArticleFingerprint>()
  for (const doc of snap.docs) {
    map.set(doc.id, doc.data() as SourceArticleFingerprint)
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

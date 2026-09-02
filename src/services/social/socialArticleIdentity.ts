import 'server-only'

import { randomUUID } from 'crypto'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  canAppearInSmartFeed,
  classifyPublicRead,
  publicReadMetaFromFirestoreDoc,
} from '@/services/editorial/publicReadPolicy'

export type SocialIdentityKind = 'pg_news' | 'firestore_legacy' | 'unresolved'

export type SocialIdentityResolveResult = {
  /** Durable social article id used in likes/saves/comments. */
  socialArticleId: string
  kind: Exclude<SocialIdentityKind, 'unresolved'>
  /** Present when a PG news row exists for this identity. */
  newsId: string | null
  firestoreId: string | null
}

function logSocialIdentity(stage: string, fields: Record<string, unknown>) {
  console.info('[social.identity]', {
    stage,
    correlationId: typeof fields.correlationId === 'string' ? fields.correlationId : undefined,
    code: fields.code,
    identityKind: fields.identityKind,
    hasNewsId: Boolean(fields.newsId),
    hasFirestoreId: Boolean(fields.firestoreId),
    keyLen: typeof fields.keyLen === 'number' ? fields.keyLen : undefined,
  })
}

/**
 * P18.3K — Exact-match only social identity.
 *
 * Priority:
 * 1) PG news by id | legacy_firestore_id | slug → news.id
 * 2) Exact Firestore doc id that is Smart Feed eligible
 *    (CANONICAL / SYSTEM_ALERT / LEGACY_ALLOWED) → doc.id
 *
 * Never creates news rows. Never fuzzy slug/title matching.
 */
export async function resolveSocialArticleIdentity(
  idOrSlugOrLegacy: string,
  opts: {
    correlationId?: string
    /** When true, skip Firestore fallback (batch reads that only need PG). */
    pgOnly?: boolean
    lookupPg: (key: string) => Promise<{ id: string; legacyFirestoreId: string | null } | null>
  }
): Promise<SocialIdentityResolveResult> {
  const key = idOrSlugOrLegacy.trim()
  const correlationId = opts.correlationId ?? randomUUID().slice(0, 8)
  if (!key) {
    logSocialIdentity('empty_key', { correlationId, code: 'ARTICLE_NOT_FOUND', keyLen: 0 })
    throw new Error('ARTICLE_NOT_FOUND')
  }

  const pg = await opts.lookupPg(key)
  if (pg?.id) {
    logSocialIdentity('pg_hit', {
      correlationId,
      code: 'OK',
      identityKind: 'pg_news',
      newsId: pg.id,
      firestoreId: pg.legacyFirestoreId,
      keyLen: key.length,
    })
    return {
      socialArticleId: pg.id,
      kind: 'pg_news',
      newsId: pg.id,
      firestoreId: pg.legacyFirestoreId,
    }
  }

  if (opts.pgOnly) {
    logSocialIdentity('pg_miss_pg_only', {
      correlationId,
      code: 'ARTICLE_NOT_FOUND',
      identityKind: 'unresolved',
      keyLen: key.length,
    })
    throw new Error('ARTICLE_NOT_FOUND')
  }

  // Exact document id only — no slug range / fuzzy matching for social writes.
  try {
    const snap = await getAdminFirestore().collection(Collections.NEWS).doc(key).get()
    if (!snap.exists) {
      logSocialIdentity('fs_miss', {
        correlationId,
        code: 'ARTICLE_NOT_FOUND',
        identityKind: 'unresolved',
        keyLen: key.length,
      })
      throw new Error('ARTICLE_NOT_FOUND')
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>
    const cls = classifyPublicRead(publicReadMetaFromFirestoreDoc(snap.id, data))
    if (!canAppearInSmartFeed(cls)) {
      logSocialIdentity('fs_ineligible', {
        correlationId,
        code: 'ARTICLE_NOT_FOUND',
        identityKind: 'unresolved',
        keyLen: key.length,
        readClass: cls,
      })
      throw new Error('ARTICLE_NOT_FOUND')
    }
    logSocialIdentity('fs_legacy_hit', {
      correlationId,
      code: 'OK',
      identityKind: 'firestore_legacy',
      firestoreId: snap.id,
      keyLen: key.length,
      readClass: cls,
    })
    return {
      socialArticleId: snap.id,
      kind: 'firestore_legacy',
      newsId: null,
      firestoreId: snap.id,
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'ARTICLE_NOT_FOUND') throw err
    logSocialIdentity('fs_error', {
      correlationId,
      code: 'ARTICLE_NOT_FOUND',
      identityKind: 'unresolved',
      keyLen: key.length,
    })
    throw new Error('ARTICLE_NOT_FOUND')
  }
}

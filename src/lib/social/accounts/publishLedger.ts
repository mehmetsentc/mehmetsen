/**
 * Account-scoped manual publish ledger — Firestore `socialPublishRecords`.
 *
 * One document per (news, account, format): `${newsId}__${accountId}__${format}`.
 * Reuses the repo's transactional claim pattern (deterministic id + Firestore
 * transaction + lease, as in newsQueueService / oauthState):
 *   - concurrent clicks / repeated requests: the second claim sees
 *     `publishing` with a live lease → `in_progress` (no second post)
 *   - `succeeded` blocks re-publishing to THAT account unless `force`
 *   - `uncertain` (platform may have accepted, response lost / lease expired)
 *     blocks until an operator acknowledges THAT record (by its exact id) —
 *     never auto-retried, never cleared by a general flag
 *
 * The same record id is used by the legacy (target-less) Onyeditivi path:
 * the lock key is derived from platform + external account id, so a legacy
 * call and an explicit-account call to the same real account share one lock.
 * Onyeditivi's legacy history on the news document is read (never migrated or
 * rewritten here) to avoid re-publishing news that already carries a post id.
 */
import 'server-only'
import { randomBytes } from 'node:crypto'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { SocialAccountPlatform } from './types'
import type { PublishFormat } from './capabilities'
import type { SocialPublishResult } from '../types'

export const PUBLISH_LEASE_MS = 10 * 60 * 1000
const NEWS_ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const HISTORY_LIMIT = 10

export type LedgerStatus = 'publishing' | 'succeeded' | 'failed' | 'uncertain'

export interface LedgerRecord {
  newsId: string
  accountId: string
  platform: SocialAccountPlatform
  format: PublishFormat
  status: LedgerStatus
  attemptId: string | null
  attempts: number
  leaseUntil: number | null
  externalPostId: string | null
  errorCode: string | null
  updatedAt: number
  updatedBy: string
  lastTrigger?: string
  acknowledgedBy?: string
  acknowledgedAt?: number
  history: Array<{ attemptId: string; status: LedgerStatus; at: number; by: string; externalPostId: string | null; errorCode: string | null }>
}

export function ledgerRecordId(newsId: string, accountId: string, format: PublishFormat): string {
  if (!NEWS_ID_RE.test(newsId)) throw new Error('invalid news id')
  return `${newsId}__${accountId}__${format}`
}

function col() {
  return getAdminFirestore().collection(Collections.SOCIAL_PUBLISH_RECORDS)
}

export type ClaimResult =
  | { ok: true; recordId: string; attemptId: string }
  | {
      ok: false
      code: 'in_progress' | 'already_published' | 'uncertain_previous_attempt' | 'invalid'
      externalPostId?: string | null
    }

export async function claimPublish(input: {
  newsId: string
  accountId: string
  platform: SocialAccountPlatform
  format: PublishFormat
  /** Re-publish over a `succeeded` record. Never overrides a live lease or an uncertain record. */
  force: boolean
  /** Exact record id the operator acknowledged as uncertain; any other value acknowledges nothing. */
  acknowledgeRecordId?: string | null
  /**
   * The attempt the operator saw when acknowledging. The acknowledgement holds
   * only while the record still carries this attempt — a newer uncertain
   * attempt needs a new, separate decision.
   */
  acknowledgeAttemptId?: string | null
  /**
   * Legacy (Onyeditivi) news-document field holding a post id for this
   * platform/format. Read only when no ledger record exists and `force` is
   * false: an existing id counts as already published (no backfill).
   */
  legacyNewsField?: string
  actorUid: string
  /** Free-form trigger label for diagnostics (composer, cron, after, …). */
  trigger?: string
  now: number
}): Promise<ClaimResult> {
  let recordId: string
  try {
    recordId = ledgerRecordId(input.newsId, input.accountId, input.format)
  } catch {
    return { ok: false, code: 'invalid' }
  }
  const db = getAdminFirestore()
  const ref = col().doc(recordId)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const d = snap.exists ? (snap.data() as LedgerRecord) : null
    const acknowledged =
      typeof input.acknowledgeRecordId === 'string' &&
      input.acknowledgeRecordId === recordId &&
      typeof input.acknowledgeAttemptId === 'string' &&
      !!d &&
      d.attemptId === input.acknowledgeAttemptId
    if (!d && !input.force && input.legacyNewsField) {
      const news = await tx.get(db.collection(Collections.NEWS).doc(input.newsId))
      const prior = news.exists ? (news.data() as Record<string, unknown> | undefined)?.[input.legacyNewsField] : undefined
      if (typeof prior === 'string' && prior.trim()) {
        return { ok: false as const, code: 'already_published' as const, externalPostId: prior.trim() }
      }
    }
    if (d) {
      if (d.status === 'publishing' && (d.leaseUntil ?? 0) > input.now) return { ok: false as const, code: 'in_progress' as const }
      if (d.status === 'publishing' && !acknowledged) {
        // Worker died mid-publish: the platform may have accepted it → uncertain, not failed.
        tx.update(ref, {
          status: 'uncertain',
          errorCode: 'lease_expired',
          leaseUntil: null,
          updatedAt: input.now,
          history: [
            ...(d.history ?? []),
            { attemptId: d.attemptId ?? '-', status: 'uncertain', at: input.now, by: 'system', externalPostId: null, errorCode: 'lease_expired' },
          ].slice(-HISTORY_LIMIT),
        })
        return { ok: false as const, code: 'uncertain_previous_attempt' as const }
      } else if (d.status === 'publishing') {
        // acknowledged expired lease → fall through to a new attempt
      } else if (d.status === 'uncertain' && !acknowledged) {
        return { ok: false as const, code: 'uncertain_previous_attempt' as const }
      } else if (d.status === 'succeeded' && !input.force) {
        return { ok: false as const, code: 'already_published' as const, externalPostId: d.externalPostId }
      }
    }
    const attemptId = randomBytes(12).toString('hex')
    const base: LedgerRecord = {
      newsId: input.newsId,
      accountId: input.accountId,
      platform: input.platform,
      format: input.format,
      status: 'publishing',
      attemptId,
      attempts: (d?.attempts ?? 0) + 1,
      leaseUntil: input.now + PUBLISH_LEASE_MS,
      externalPostId: d?.externalPostId ?? null,
      errorCode: null,
      updatedAt: input.now,
      updatedBy: input.actorUid,
      history: (d?.history ?? []).slice(-HISTORY_LIMIT),
      ...(input.trigger ? { lastTrigger: input.trigger.slice(0, 40) } : {}),
      ...(acknowledged ? { acknowledgedBy: input.actorUid, acknowledgedAt: input.now } : {}),
    }
    tx.set(ref, { ...base })
    return { ok: true as const, recordId, attemptId }
  })
}

export async function finishPublish(input: {
  recordId: string
  attemptId: string
  status: Exclude<LedgerStatus, 'publishing'>
  externalPostId: string | null
  errorCode: string | null
  actorUid: string
  now: number
}): Promise<boolean> {
  const db = getAdminFirestore()
  const ref = col().doc(input.recordId)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const d = snap.exists ? (snap.data() as LedgerRecord) : null
    if (!d || d.attemptId !== input.attemptId) return false
    // A worker whose lease expired (record turned `uncertain` by a later claim,
    // same attempt id kept) may still report a VERIFIED success with a platform
    // id — that is the truth for this attempt, so it is recorded. Nothing else
    // may overwrite a record that is no longer `publishing`.
    const lateVerifiedSuccess =
      d.status === 'uncertain' && d.errorCode === 'lease_expired' && input.status === 'succeeded' && !!input.externalPostId
    if (d.status !== 'publishing' && !lateVerifiedSuccess) return false
    tx.update(ref, {
      status: input.status,
      leaseUntil: null,
      externalPostId: input.status === 'succeeded' ? input.externalPostId : d.externalPostId,
      errorCode: input.errorCode,
      updatedAt: input.now,
      updatedBy: input.actorUid,
      history: [
        ...(d.history ?? []),
        { attemptId: input.attemptId, status: input.status, at: input.now, by: input.actorUid, externalPostId: input.externalPostId, errorCode: input.errorCode },
      ].slice(-HISTORY_LIMIT),
    })
    return true
  })
}

export async function readLedger(newsId: string, accountId: string, format: PublishFormat): Promise<LedgerRecord | null> {
  const snap = await col().doc(ledgerRecordId(newsId, accountId, format)).get()
  return snap.exists ? (snap.data() as LedgerRecord) : null
}

export const NETWORK_RE = /(fetch failed|network|timeout|timed out|aborted|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up|ETIMEDOUT|terminated)/i
/**
 * Server-side / transient platform failures in the SAFE error text built by
 * PlatformApiError ("… reddedildi (HTTP 503, kod 2)"): HTTP 5xx or Meta's
 * unknown / temporarily-unavailable codes (1, 2). The platform may still have
 * accepted the post → uncertain, never auto-retried.
 */
export const SERVER_SIDE_RE = /\(HTTP 5\d\d\b|, kod (1|2)(\/|\))/

/**
 * failed  = the platform clearly rejected or we never sent the publish call
 * uncertain = transport failure / exception / success without an id — the
 *             platform may have published; never retried automatically
 */
export function classifyOutcome(result: SocialPublishResult | null, threw: boolean): {
  status: Exclude<LedgerStatus, 'publishing'>
  code: string
} {
  if (threw || !result) return { status: 'uncertain', code: 'exception' }
  if (result.success) return result.platformId ? { status: 'succeeded', code: 'published' } : { status: 'uncertain', code: 'no_platform_id' }
  if (NETWORK_RE.test(result.error ?? '')) return { status: 'uncertain', code: 'transport_error' }
  if (SERVER_SIDE_RE.test(result.error ?? '')) return { status: 'uncertain', code: 'platform_server_error' }
  return { status: 'failed', code: 'platform_rejected' }
}

export const CLAIM_TEXT: Record<string, string> = {
  in_progress: 'Bu hesaba aynı haber için paylaşım zaten sürüyor',
  already_published: 'Bu haber bu hesapta zaten paylaşılmış (yeniden paylaşmak için «Yeniden paylaş»)',
  uncertain_previous_attempt: 'Önceki denemenin sonucu belirsiz — platformda kontrol edin; yeniden yayım yalnızca «Sonucu belirsiz paylaşımlar» bölümünden kayıt bazında yapılır',
  invalid: 'Geçersiz paylaşım isteği',
}

export const UNCERTAIN_TEXT =
  'Sonuç belirsiz: platform gönderiyi almış olabilir. Platformda kontrol edin; otomatik tekrar yapılmadı.'

export interface OpenUncertainRecord {
  id: string
  newsId: string
  accountId: string
  platform: SocialAccountPlatform
  format: PublishFormat
  /** `uncertain`, or `publishing` whose lease expired (worker died mid-publish). */
  state: 'uncertain' | 'lease_expired'
  /** Attempt the operator decision is bound to. */
  attemptId: string | null
  errorCode: string | null
  attempts: number
  updatedAt: number
  lastTrigger: string | null
}

/**
 * Records that need an operator decision. Two indexed equality queries with a
 * hard limit — run only when an admin opens/refreshes the panel (no polling).
 */
export async function listOpenUncertain(now: number, max = 50): Promise<OpenUncertainRecord[]> {
  const [unc, pub] = await Promise.all([
    col().where('status', '==', 'uncertain').limit(max).get(),
    col().where('status', '==', 'publishing').limit(max).get(),
  ])
  const out: OpenUncertainRecord[] = []
  const push = (id: string, d: LedgerRecord, state: OpenUncertainRecord['state']) =>
    out.push({
      id,
      newsId: d.newsId,
      accountId: d.accountId,
      platform: d.platform,
      format: d.format,
      state,
      attemptId: d.attemptId ?? null,
      errorCode: d.errorCode ?? null,
      attempts: d.attempts ?? 0,
      updatedAt: d.updatedAt ?? 0,
      lastTrigger: d.lastTrigger ?? null,
    })
  for (const doc of unc.docs) push(doc.id, doc.data() as LedgerRecord, 'uncertain')
  for (const doc of pub.docs) {
    const d = doc.data() as LedgerRecord
    if ((d.leaseUntil ?? 0) <= now) push(doc.id, d, 'lease_expired')
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, max)
}

export async function readLedgerById(recordId: string): Promise<LedgerRecord | null> {
  if (!/^[A-Za-z0-9_-]{1,128}__[a-z]+_[0-9A-Za-z_-]{1,64}__(post|story)$/.test(recordId)) return null
  const snap = await col().doc(recordId).get()
  return snap.exists ? (snap.data() as LedgerRecord) : null
}

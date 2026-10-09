/**
 * Operator handling of uncertain publishes (platform may have accepted the
 * post, the answer was lost / the worker died).
 *
 * - Listing: on demand only (panel open / refresh), two limited equality
 *   queries on `socialPublishRecords` — no polling, no full scans.
 * - "Platformda kontrol ettim, yeniden yayımla": acts on ONE record id. The
 *   acknowledgement is passed down as that exact id; claimPublish honours it
 *   only for the same record, so it can never clear another platform's or
 *   account's uncertain record. Authority, current account state and the lock
 *   are re-checked at request time; a record that has meanwhile become
 *   `succeeded` stays blocked (ledger force is OFF).
 * - There is deliberately no "mark as published" action: a success record is
 *   only ever written with a platform-returned post id.
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { listOpenUncertain, readLedgerById, type OpenUncertainRecord } from './publishLedger'
import { loadSocialAccount } from './accountStore'
import { legacyAccountId } from './legacyLock'
import { preflightTargets, type PublishTargets } from './targetedPublish'
import { writeSocialAudit } from './audit'
import type { SocialAccountPlatform } from './types'
import { publishOneSocial } from '../publishOneSocial'
import type { SocialPublishResult } from '../types'
import { sanitizeFreeText } from '../safeLog'

export interface UncertainRecordView extends OpenUncertainRecord {
  accountLabel: string
  isLegacyAccount: boolean
  newsTitle: string | null
}

const PLATFORMS: SocialAccountPlatform[] = ['facebook', 'instagram', 'threads']

export async function listUncertainForPanel(now: number): Promise<UncertainRecordView[]> {
  const records = await listOpenUncertain(now)
  if (records.length === 0) return []
  const legacyIds = new Map<SocialAccountPlatform, string | null>()
  for (const p of PLATFORMS) {
    if (records.some((r) => r.platform === p)) legacyIds.set(p, await legacyAccountId(p))
  }
  const db = getAdminFirestore()
  const titles = new Map<string, string | null>()
  const labels = new Map<string, string>()
  const out: UncertainRecordView[] = []
  for (const r of records) {
    if (!titles.has(r.newsId)) {
      const snap = await db.collection(Collections.NEWS).doc(r.newsId).get().catch(() => null)
      const t = snap?.exists ? (snap.data() as Record<string, unknown>)?.title : null
      titles.set(r.newsId, typeof t === 'string' ? sanitizeFreeText(t, 140) : null)
    }
    const isLegacyAccount = legacyIds.get(r.platform) === r.accountId
    if (!labels.has(r.accountId)) {
      const loaded = await loadSocialAccount(r.accountId).catch(() => ({ state: 'missing' as const }))
      labels.set(
        r.accountId,
        loaded.state === 'ok'
          ? sanitizeFreeText(loaded.account.displayName, 80)
          : isLegacyAccount
            ? 'Onyeditivi (mevcut bağlantı)'
            : r.accountId,
      )
    }
    out.push({ ...r, accountLabel: labels.get(r.accountId)!, isLegacyAccount, newsTitle: titles.get(r.newsId) ?? null })
  }
  return out
}

export type RepublishOutcome =
  | { ok: true; status: 200; result: SocialPublishResult | null; skippedReason: string | null }
  | { ok: false; status: 400 | 404 | 409; code: string; message: string }

export async function republishUncertainRecord(input: {
  recordId: string
  /** Attempt id the operator saw in the panel; a changed record needs a fresh decision. */
  attemptId: string
  actorUid: string
  now: number
}): Promise<RepublishOutcome> {
  const rec = await readLedgerById(input.recordId)
  if (!rec) return { ok: false, status: 404, code: 'not_found', message: 'Kayıt bulunamadı' }
  if (`${rec.newsId}__${rec.accountId}__${rec.format}` !== input.recordId || !rec.accountId.startsWith(`${rec.platform}_`)) {
    return { ok: false, status: 400, code: 'invalid', message: 'Geçersiz kayıt' }
  }
  const leaseExpired = rec.status === 'publishing' && (rec.leaseUntil ?? 0) <= input.now
  if (rec.status === 'publishing' && !leaseExpired) {
    return { ok: false, status: 409, code: 'in_progress', message: 'Bu kayıt için yayın şu anda sürüyor' }
  }
  if (rec.status !== 'uncertain' && !leaseExpired) {
    return { ok: false, status: 409, code: 'not_uncertain', message: 'Kayıt artık belirsiz durumda değil — listeyi yenileyin' }
  }
  if (!input.attemptId || rec.attemptId !== input.attemptId) {
    return { ok: false, status: 409, code: 'stale_record', message: 'Kayıt siz baktıktan sonra değişti — listeyi yenileyip tekrar kontrol edin' }
  }
  if (rec.platform === 'threads' && rec.format === 'story') {
    return { ok: false, status: 409, code: 'format_unsupported', message: 'Threads hikâyesi desteklenmiyor' }
  }

  // Current account state: the record's account must still be what we would publish to.
  const loaded = await loadSocialAccount(rec.accountId)
  const legacyId = await legacyAccountId(rec.platform)
  const isLegacy = legacyId === rec.accountId
  let targets: PublishTargets | undefined
  if (isLegacy) {
    if (loaded.state === 'ok' && loaded.account.status !== 'active') {
      return { ok: false, status: 409, code: `status_${loaded.account.status}`, message: 'Hesap etkin değil' }
    }
  } else {
    if (loaded.state !== 'ok') {
      return { ok: false, status: 409, code: 'account_unavailable', message: 'Kaydın hesabı artık bağlı değil veya Onyeditivi bağlantısı değişti' }
    }
    targets = { [rec.platform]: rec.accountId } as PublishTargets
    const pre = await preflightTargets(targets, rec.format, input.now)
    if (!pre.ok) return { ok: false, status: 409, code: pre.code, message: 'Hesap şu anda yayın için uygun değil' }
  }

  const r = await publishOneSocial(rec.newsId, {
    mode: rec.format,
    manual: true,
    // News-doc gating is reset ONLY for this platform; the ledger keeps
    // blocking a record that has turned `succeeded` (ledgerForce: false).
    force: true,
    scopedForce: true,
    ledgerForce: false,
    actorUid: input.actorUid,
    trigger: 'uncertain_republish',
    acknowledgeUncertainRecordId: input.recordId,
    acknowledgeUncertainAttemptId: input.attemptId,
    overrides: {
      platforms: {
        facebook: rec.platform === 'facebook',
        instagram: rec.platform === 'instagram',
        threads: rec.platform === 'threads',
        twitter: false,
      },
    },
    ...(targets ? { targets } : {}),
  })
  const result =
    rec.format === 'post'
      ? (r.post?.[rec.platform as 'facebook' | 'instagram' | 'threads'] ?? null)
      : rec.platform === 'threads'
        ? null
        : (r.story?.[rec.platform] ?? null)

  await writeSocialAudit({
    actorId: input.actorUid,
    action: 'social.publish.uncertain_ack',
    entityType: 'socialAccount',
    entityId: rec.accountId,
    meta: {
      recordId: input.recordId,
      attemptId: input.attemptId,
      newsId: rec.newsId,
      platform: rec.platform,
      format: rec.format,
      previousState: leaseExpired ? 'lease_expired' : 'uncertain',
      previousErrorCode: rec.errorCode ?? null,
      legacyAccount: isLegacy,
      skipped: r.skipped ? sanitizeFreeText(r.reason ?? 'skipped', 200) : null,
      outcome: result
        ? { ok: result.success, code: result.code ?? null, status: result.ledgerStatus ?? null, externalPostId: result.platformId ?? null }
        : null,
    },
  })
  return { ok: true, status: 200, result, skippedReason: r.skipped ? (r.reason ?? 'Paylaşım atlandı') : null }
}

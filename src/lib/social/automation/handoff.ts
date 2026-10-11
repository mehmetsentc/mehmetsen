/**
 * Legacy (Onyeditivi) handoff records — `socialAutomationState/legacyHandoff`.
 *
 * An explicit per-account record: "the old Onyeditivi AUTOMATIC path (cron /
 * CMS after()) must not publish to this account any more; account-bound
 * automation owns it". Manual legacy sharing and the shared ledger lock are
 * unaffected. No record = legacy behaviour unchanged. Old configuration and
 * history are never deleted.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { loadSocialAccount } from '../accounts/accountStore'
import { writeSocialAudit } from '../accounts/audit'
import type { SocialAccountPlatform } from '../accounts/types'
import type { PublishFormat } from '../accounts/capabilities'

function stateCol() {
  return getAdminFirestore().collection(Collections.SOCIAL_AUTOMATION_STATE)
}

type StoreError = { ok: false; code: string; message: string; status: number }

/** Automatic legacy triggers that a handoff stops. */
export const LEGACY_AUTO_TRIGGERS: ReadonlySet<string> = new Set(['cron', 'after'])

export interface LegacyHandoff {
  accountId: string
  platform: SocialAccountPlatform
  /**
   * Formats the legacy automatic path stops for (e.g. only `post`, so the old
   * automatic IG story keeps working). Missing on old records = every format.
   */
  formats?: PublishFormat[]
  at: number
  by: string
}

/** Does a handoff record cover this format? */
export function handoffCovers(h: LegacyHandoff | undefined, format: PublishFormat): boolean {
  if (!h) return false
  return !Array.isArray(h.formats) || h.formats.length === 0 || h.formats.includes(format)
}

const HANDOFF_DOC = 'legacyHandoff'

export async function readLegacyHandoffs(): Promise<Record<string, LegacyHandoff>> {
  const s = await stateCol().doc(HANDOFF_DOC).get()
  const d = s.exists ? (s.data() as { accounts?: Record<string, LegacyHandoff> }) : null
  return d?.accounts ?? {}
}

export async function isLegacyHandedOff(accountId: string, format?: PublishFormat): Promise<boolean> {
  const all = await readLegacyHandoffs()
  return format ? handoffCovers(all[accountId], format) : !!all[accountId]
}

/**
 * Hand an account off from the legacy automatic path (or take it back).
 * The account must be a connected (OAuth) record so the new automation can
 * actually publish to it; a legacy-only record cannot be handed off.
 */
export async function setLegacyHandoff(
  accountId: string,
  on: boolean,
  actorUid: string,
  now: number,
  formats: PublishFormat[] = ['post', 'story'],
): Promise<{ ok: true; handoffs: Record<string, LegacyHandoff> } | StoreError> {
  const fmts = [...new Set(formats.filter((f) => f === 'post' || f === 'story'))]
  if (on && fmts.length === 0) return { ok: false, code: 'invalid_formats', message: 'Devredilecek biçim seçilmeli', status: 400 }
  if (on) {
    const loaded = await loadSocialAccount(accountId)
    if (loaded.state !== 'ok') return { ok: false, code: 'account_not_found', message: 'Hedef hesap bulunamadı', status: 404 }
    const account = loaded.account
    if (account.connectionMethod === 'legacy') {
      return { ok: false, code: 'legacy_record', message: 'Eski bağlantı kaydı devredilemez — hesabı resmî bağlantıyla bağlayın', status: 409 }
    }
  }
  const db = getAdminFirestore()
  const ref = stateCol().doc(HANDOFF_DOC)
  const handoffs = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref)
    const accounts = { ...((s.exists ? (s.data() as { accounts?: Record<string, LegacyHandoff> }).accounts : null) ?? {}) }
    if (on) {
      const platform = accountId.split('_')[0] as SocialAccountPlatform
      accounts[accountId] = { accountId, platform, formats: fmts, at: accounts[accountId]?.at ?? now, by: actorUid }
    } else {
      delete accounts[accountId]
    }
    tx.set(ref, { accounts, updatedAt: now, updatedBy: actorUid })
    return accounts
  })
  await writeSocialAudit({
    actorId: actorUid,
    action: on ? 'social.automation.legacy_handoff' : 'social.automation.legacy_handback',
    entityType: 'socialAccount',
    entityId: accountId,
    meta: on ? { formats: fmts } : null,
  })
  return { ok: true, handoffs }
}

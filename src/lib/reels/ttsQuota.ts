import 'server-only'

/**
 * REELS-1 — monthly Google TTS character counter (Firestore ttsUsage/{YYYY-MM}).
 * Every Google TTS call in the app reserves its characters here first; when the
 * free tier (minus a safety margin) would be exceeded, the call is refused
 * unless an admin approved going over for that month. Failed calls are refunded.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import {
  TTS_FREE_CHARS,
  billedChars,
  decideQuota,
  safeCap,
  tierForVoice,
  usageMonth,
  type TtsTier,
} from './ttsQuotaRules'

const COLLECTION = 'ttsUsage'

export class TtsQuotaError extends Error {
  constructor(public readonly used: number, public readonly cap: number, public readonly tier: TtsTier) {
    super(
      `Google seslendirme ücretsiz aylık limiti doldu (${tier}: ${used.toLocaleString('tr-TR')} / ${cap.toLocaleString('tr-TR')} karakter). ` +
        'Ücretli kullanım için yönetici onayı gerekiyor.',
    )
    this.name = 'TtsQuotaError'
  }
}

function ratio(): number {
  const r = Number(process.env.TTS_FREE_SAFETY_RATIO)
  return Number.isFinite(r) && r > 0 && r <= 1 ? r : 0.95
}

export type TtsReservation = { month: string; tier: TtsTier; chars: number; overFree: boolean }

export async function reserveTtsChars(text: string, voice: string): Promise<TtsReservation> {
  const tier = tierForVoice(voice)
  const chars = billedChars(text)
  const cap = safeCap(tier, ratio())
  const month = usageMonth()
  const ref = getAdminFirestore().collection(COLLECTION).doc(month)
  return getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const d = (snap.data() ?? {}) as Record<string, unknown>
    const used = Number(d[`${tier}Chars`] ?? 0)
    const decision = decideQuota({ used, request: chars, cap, overageApproved: d.overageApproved === true })
    if (!decision.ok) throw new TtsQuotaError(used, cap, tier)
    tx.set(
      ref,
      {
        [`${tier}Chars`]: FieldValue.increment(chars),
        [`${tier}Requests`]: FieldValue.increment(1),
        ...(decision.overFree ? { [`${tier}OverFreeChars`]: FieldValue.increment(chars) } : {}),
        updatedAt: Date.now(),
      },
      { merge: true },
    )
    return { month, tier, chars, overFree: decision.overFree }
  })
}

export async function refundTtsChars(r: TtsReservation): Promise<void> {
  await getAdminFirestore()
    .collection(COLLECTION)
    .doc(r.month)
    .set(
      {
        [`${r.tier}Chars`]: FieldValue.increment(-r.chars),
        [`${r.tier}Requests`]: FieldValue.increment(-1),
        ...(r.overFree ? { [`${r.tier}OverFreeChars`]: FieldValue.increment(-r.chars) } : {}),
        updatedAt: Date.now(),
      },
      { merge: true },
    )
    .catch((err) => console.warn('[ttsQuota] refund failed', err instanceof Error ? err.message : err))
}

export type TtsUsageView = {
  month: string
  overageApproved: boolean
  approvedBy: string | null
  tiers: Array<{ tier: TtsTier; used: number; cap: number; free: number; requests: number; overFree: number }>
}

export async function getTtsUsage(month = usageMonth()): Promise<TtsUsageView> {
  const snap = await getAdminFirestore().collection(COLLECTION).doc(month).get()
  const d = (snap.data() ?? {}) as Record<string, unknown>
  const r = ratio()
  return {
    month,
    overageApproved: d.overageApproved === true,
    approvedBy: typeof d.overageApprovedBy === 'string' ? d.overageApprovedBy : null,
    tiers: (Object.keys(TTS_FREE_CHARS) as TtsTier[]).map((tier) => ({
      tier,
      used: Number(d[`${tier}Chars`] ?? 0),
      cap: safeCap(tier, r),
      free: TTS_FREE_CHARS[tier],
      requests: Number(d[`${tier}Requests`] ?? 0),
      overFree: Number(d[`${tier}OverFreeChars`] ?? 0),
    })),
  }
}

/** Admin decision for the current month only; resets automatically next month. */
export async function setTtsOverageApproval(approved: boolean, uid: string): Promise<void> {
  await getAdminFirestore()
    .collection(COLLECTION)
    .doc(usageMonth())
    .set(
      { overageApproved: approved, overageApprovedBy: approved ? uid : null, overageApprovedAt: approved ? Date.now() : null },
      { merge: true },
    )
}

/** REELS-4 — Gemini-TTS (paid, no free tier): monthly USD budget in the same doc. */
export class GeminiBudgetError extends Error {
  constructor(public readonly used: number, public readonly budget: number) {
    super(`Gemini sunucu sesi aylık bütçesi doldu (${used.toFixed(2)} / ${budget.toFixed(2)} $). Standart Google sesi kullanılır.`)
    this.name = 'GeminiBudgetError'
  }
}

/** Audio ≈ 14 characters per second, 25 tokens per second, output $10 / 1M tokens (2.5 Flash TTS). */
export function estimateGeminiUsd(text: string, outPerMillion = 10, inPerMillion = 0.5): number {
  const sec = Math.max(1, [...text].length / 14)
  return (sec * 25 * outPerMillion) / 1e6 + ((text.length / 4 + 60) * inPerMillion) / 1e6
}

export async function reserveGeminiUsd(estUsd: number, budgetUsd: number): Promise<{ month: string; usd: number }> {
  const month = usageMonth()
  const ref = getAdminFirestore().collection(COLLECTION).doc(month)
  await getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const used = Number((snap.data() ?? {}).geminiUsd ?? 0)
    if (used + estUsd > budgetUsd) throw new GeminiBudgetError(used, budgetUsd)
    tx.set(ref, { geminiUsd: FieldValue.increment(estUsd), geminiRequests: FieldValue.increment(1), updatedAt: Date.now() }, { merge: true })
  })
  return { month, usd: estUsd }
}

export async function adjustGeminiUsd(r: { month: string; usd: number }, actualUsd: number | null): Promise<void> {
  const delta = (actualUsd ?? 0) - r.usd
  if (Math.abs(delta) < 1e-7) return
  await getAdminFirestore().collection(COLLECTION).doc(r.month).set({ geminiUsd: FieldValue.increment(delta) }, { merge: true }).catch(() => {})
}

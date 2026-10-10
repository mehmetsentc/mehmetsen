/**
 * Per-account automation limits: daily cap, minimum interval, quiet hours.
 *
 * Counter document `socialAutomationCounters/{accountId}` is updated only in a
 * Firestore transaction, so two workers can never both take the last slot.
 * Several rules may target one account; the STRICTEST limits of the rules that
 * matched the job apply (lowest daily cap, longest interval, every quiet window).
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { QuietHours } from './types'

export const TIME_ZONE = 'Europe/Istanbul'
const HOUR_MS = 60 * 60 * 1000

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
})

export function istanbulParts(now: number): { day: string; hour: number } {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(now)).map((p) => [p.type, p.value]))
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 }
}

export function inQuietHours(hour: number, q: QuietHours): boolean {
  return q.startHour < q.endHour ? hour >= q.startHour && hour < q.endHour : hour >= q.startHour || hour < q.endHour
}

/** First moment (on an hour boundary) outside every quiet window, or null when `now` is not quiet. */
export function quietDeferral(now: number, windows: QuietHours[]): number | null {
  const quietAt = (t: number) => windows.some((w) => inQuietHours(istanbulParts(t).hour, w))
  if (windows.length === 0 || !quietAt(now)) return null
  let t = Math.floor(now / HOUR_MS) * HOUR_MS + HOUR_MS
  for (let i = 0; i < 25 && quietAt(t); i++) t += HOUR_MS
  return t
}

export interface EffectiveLimits {
  dailyLimit: number
  minIntervalMinutes: number
  quietHours: QuietHours[]
}

export function strictestLimits(rules: Array<{ dailyLimit: number; minIntervalMinutes: number; quietHours: QuietHours | null }>): EffectiveLimits {
  return {
    dailyLimit: Math.min(...rules.map((r) => r.dailyLimit)),
    minIntervalMinutes: Math.max(...rules.map((r) => r.minIntervalMinutes)),
    quietHours: rules.map((r) => r.quietHours).filter((q): q is QuietHours => !!q),
  }
}

export interface CounterDoc {
  accountId: string
  day: string
  count: number
  lastSentAt: number | null
  updatedAt: number
}

export type SlotResult =
  | { ok: true; reservation: { accountId: string; day: string; at: number; prevLastSentAt: number | null } }
  | { ok: false; reason: 'daily_limit' }
  | { ok: false; reason: 'interval'; retryAt: number }

function col() {
  return getAdminFirestore().collection(Collections.SOCIAL_AUTOMATION_COUNTERS)
}

/** Take one send slot for the account (transaction). */
export async function reserveSlot(accountId: string, limits: EffectiveLimits, now: number): Promise<SlotResult> {
  const db = getAdminFirestore()
  const ref = col().doc(accountId)
  const { day } = istanbulParts(now)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const d = snap.exists ? (snap.data() as CounterDoc) : null
    const count = d && d.day === day ? d.count : 0
    const last = d?.lastSentAt ?? null
    if (count >= limits.dailyLimit) return { ok: false as const, reason: 'daily_limit' as const }
    const nextAllowed = last === null ? 0 : last + limits.minIntervalMinutes * 60_000
    if (nextAllowed > now) return { ok: false as const, reason: 'interval' as const, retryAt: nextAllowed }
    const next: CounterDoc = { accountId, day, count: count + 1, lastSentAt: now, updatedAt: now }
    tx.set(ref, { ...next })
    return { ok: true as const, reservation: { accountId, day, at: now, prevLastSentAt: last } }
  })
}

/** Give a slot back when nothing was sent (definite failure / not claimed). Uncertain sends keep their slot. */
export async function releaseSlot(r: { accountId: string; day: string; at: number; prevLastSentAt: number | null }, now: number): Promise<void> {
  const db = getAdminFirestore()
  const ref = col().doc(r.accountId)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return
    const d = snap.data() as CounterDoc
    if (d.day !== r.day || d.count <= 0) return
    tx.set(ref, {
      ...d,
      count: d.count - 1,
      // Only roll back the interval clock if no later send moved it.
      lastSentAt: d.lastSentAt === r.at ? r.prevLastSentAt : d.lastSentAt,
      updatedAt: now,
    })
  })
}

export async function readCounters(accountIds: string[]): Promise<Record<string, CounterDoc>> {
  if (accountIds.length === 0) return {}
  const snaps = await getAdminFirestore().getAll(...accountIds.slice(0, 100).map((id) => col().doc(id)))
  const out: Record<string, CounterDoc> = {}
  for (const s of snaps) if (s.exists) out[s.id] = s.data() as CounterDoc
  return out
}

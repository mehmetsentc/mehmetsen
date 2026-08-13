/**
 * Facebook publish frequency gate.
 *
 * Rules:
 *  - Same calendar day (Europe/Istanbul) + same title → skip (duplicate)
 *  - Max 20 successful photo posts / day
 *  - Max 2 / hour; a 3rd attempt is deferred ~45 minutes (queue)
 *
 * State: Firestore config/facebookRateLimit
 */
import { getAdminFirestore } from '@/lib/firebase/admin'

const DOC_PATH = { collection: 'config', id: 'facebookRateLimit' } as const

export const FB_MAX_POSTS_PER_DAY = 20
export const FB_MAX_POSTS_PER_HOUR = 2
export const FB_HOURLY_DEFER_MS = 45 * 60 * 1000

export type FacebookRateDecision =
  | { allowed: true }
  | { allowed: false; reason: string; deferUntil?: number }

interface RateDoc {
  dayKey?: string
  /** Successful publish timestamps (ms) for the current dayKey */
  postTimestamps?: number[]
  /** Normalized titles already posted today */
  titlesToday?: string[]
}

function istanbulDayKey(now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function normalizeFacebookTitle(title: string): string {
  return title
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .replace(/[“”"']/g, '')
    .trim()
}

async function readState() {
  const db = getAdminFirestore()
  const ref = db.collection(DOC_PATH.collection).doc(DOC_PATH.id)
  const snap = await ref.get()
  const dayKey = istanbulDayKey()
  const raw = (snap.data() ?? {}) as RateDoc
  if (raw.dayKey !== dayKey) {
    return { ref, data: { dayKey, postTimestamps: [], titlesToday: [] }, dayKey }
  }
  return {
    ref,
    data: {
      dayKey,
      postTimestamps: Array.isArray(raw.postTimestamps) ? raw.postTimestamps : [],
      titlesToday: Array.isArray(raw.titlesToday) ? raw.titlesToday : [],
    },
    dayKey,
  }
}

/**
 * Check whether a Facebook photo post is allowed right now.
 * Does not mutate state (call recordFacebookPublish after success).
 */
export async function checkFacebookRateLimit(title: string): Promise<FacebookRateDecision> {
  const { data } = await readState()
  const norm = normalizeFacebookTitle(title)
  if (!norm) {
    return { allowed: false, reason: 'Facebook: boş başlık — atlandı' }
  }

  if ((data.titlesToday ?? []).includes(norm)) {
    return {
      allowed: false,
      reason: 'Facebook: aynı gün aynı başlık — tekrar paylaşım yok',
    }
  }

  const stamps = data.postTimestamps ?? []
  if (stamps.length >= FB_MAX_POSTS_PER_DAY) {
    return {
      allowed: false,
      reason: `Facebook: günlük limit doldu (${FB_MAX_POSTS_PER_DAY}/gün)`,
    }
  }

  const hourAgo = Date.now() - 60 * 60 * 1000
  const lastHour = stamps.filter((t) => t >= hourAgo)
  if (lastHour.length >= FB_MAX_POSTS_PER_HOUR) {
    const deferUntil = Date.now() + FB_HOURLY_DEFER_MS
    return {
      allowed: false,
      reason: `Facebook: saatlik limit (${FB_MAX_POSTS_PER_HOUR}/saat) — ~45 dk kuyruğa alındı`,
      deferUntil,
    }
  }

  return { allowed: true }
}

/** Record a successful Facebook photo publish for rate accounting. */
export async function recordFacebookPublish(title: string, postId: string): Promise<void> {
  const { ref, data, dayKey } = await readState()
  const now = Date.now()
  const norm = normalizeFacebookTitle(title)
  const stamps = [...(data.postTimestamps ?? []), now].slice(-FB_MAX_POSTS_PER_DAY)
  const titles = [...(data.titlesToday ?? [])]
  if (norm && !titles.includes(norm)) titles.push(norm)

  await ref.set(
    {
      dayKey,
      postTimestamps: stamps,
      titlesToday: titles.slice(-100),
      lastPostId: postId,
      lastPostAt: now,
      updatedAt: now,
    },
    { merge: true },
  )
}

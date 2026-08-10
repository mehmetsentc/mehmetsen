import { getAdminFirestore } from '@/lib/firebase/admin'
import {
  fetchWeeklyBoxOffice,
  type BoxOfficeWeeklyData,
} from '@/services/boxOfficeTurkiyeService'

const META_DOC_PATH = 'meta/boxOfficeWeekly'

export interface BoxOfficeWeeklySyncResult {
  weekKey: string
  filmCount: number
  topFilm?: string
  unchanged: boolean
  completedAt: string
  durationMs: number
}

async function loadExisting(): Promise<BoxOfficeWeeklyData | null> {
  const db = getAdminFirestore()
  const snap = await db.doc(META_DOC_PATH).get()
  if (!snap.exists) return null
  return snap.data() as BoxOfficeWeeklyData
}

function isUnchanged(
  prev: BoxOfficeWeeklyData | null,
  next: BoxOfficeWeeklyData
): boolean {
  if (!prev) return false
  if (prev.weekKey !== next.weekKey) return false
  if (prev.filmCount !== next.filmCount) return false
  if (prev.totalAudience !== next.totalAudience) return false
  if (prev.totalRevenue !== next.totalRevenue) return false
  const prevTop = prev.films[0]?.title
  const nextTop = next.films[0]?.title
  return prevTop === nextTop
}

export const boxOfficeWeeklySyncService = {
  async sync(options?: { weekKey?: string }): Promise<BoxOfficeWeeklySyncResult> {
    const started = Date.now()
    const nowIso = new Date().toISOString()

    const weekly = await fetchWeeklyBoxOffice(options?.weekKey)
    if (!weekly) {
      throw new Error('Box Office Türkiye weekly scrape returned no data')
    }

    const existing = await loadExisting()
    const unchanged = isUnchanged(existing, weekly)

    const db = getAdminFirestore()
    await db.doc(META_DOC_PATH).set(
      {
        ...weekly,
        syncedAt: nowIso,
      },
      { merge: true }
    )

    const result: BoxOfficeWeeklySyncResult = {
      weekKey: weekly.weekKey,
      filmCount: weekly.filmCount,
      topFilm: weekly.films[0]?.title,
      unchanged,
      completedAt: nowIso,
      durationMs: Date.now() - started,
    }

    console.log('[boxOfficeWeeklySync]', JSON.stringify(result))
    return result
  },

  async getLatest(): Promise<BoxOfficeWeeklyData | null> {
    return loadExisting()
  },
}

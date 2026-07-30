import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type {
  SportsLeagueDoc,
  SportsMatchDoc,
  SportsSeasonDoc,
  SportsStandingsDoc,
  SportsSyncStateDoc,
  SkorSport,
} from '@/lib/skor/types'

const BATCH = 400

export function matchesCol() {
  return getAdminFirestore().collection(Collections.SPORTS_MATCHES)
}

export function leaguesCol() {
  return getAdminFirestore().collection(Collections.SPORTS_LEAGUES)
}

export function standingsCol() {
  return getAdminFirestore().collection(Collections.SPORTS_STANDINGS)
}

export function seasonsCol() {
  return getAdminFirestore().collection(Collections.SPORTS_SEASONS)
}

export function syncStateCol() {
  return getAdminFirestore().collection(Collections.SPORTS_SYNC_STATE)
}

/** Upsert leagues without wiping unknown fields. */
export async function upsertLeagues(docs: SportsLeagueDoc[]): Promise<number> {
  if (docs.length === 0) return 0
  const db = getAdminFirestore()
  let written = 0
  for (let i = 0; i < docs.length; i += BATCH) {
    const chunk = docs.slice(i, i + BATCH)
    const batch = db.batch()
    for (const doc of chunk) {
      batch.set(leaguesCol().doc(doc.id), doc, { merge: true })
      written++
    }
    await batch.commit()
  }
  return written
}

/** Upsert matches — archive-safe (merge). */
export async function upsertMatches(docs: SportsMatchDoc[]): Promise<number> {
  if (docs.length === 0) return 0
  const db = getAdminFirestore()
  let written = 0
  for (let i = 0; i < docs.length; i += BATCH) {
    const chunk = docs.slice(i, i + BATCH)
    const batch = db.batch()
    for (const doc of chunk) {
      batch.set(matchesCol().doc(doc.id), doc, { merge: true })
      written++
    }
    await batch.commit()
  }
  return written
}

export async function upsertStandings(doc: SportsStandingsDoc): Promise<void> {
  await standingsCol().doc(doc.id).set(doc, { merge: true })
}

export async function upsertSeason(doc: SportsSeasonDoc): Promise<void> {
  await seasonsCol().doc(doc.id).set(doc, { merge: true })
}

export async function setSyncState(
  id: string,
  patch: Partial<SportsSyncStateDoc> & { ok?: boolean; error?: string | null }
): Promise<void> {
  const now = Date.now()
  const data: Partial<SportsSyncStateDoc> = {
    id,
    lastSyncAt: now,
    lastError: patch.error ?? null,
    counts: patch.counts,
  }
  if (patch.ok) data.lastOkAt = now
  await syncStateCol().doc(id).set(data, { merge: true })
}

export async function getStandingsDoc(
  leagueId: string,
  season: number | string
): Promise<SportsStandingsDoc | null> {
  const id = `${leagueId}_${season}`
  const snap = await standingsCol().doc(id).get()
  if (!snap.exists) return null
  return snap.data() as SportsStandingsDoc
}

export async function listLeagues(sport?: SkorSport): Promise<SportsLeagueDoc[]> {
  let q = leaguesCol().where('active', '==', true)
  if (sport) q = q.where('sport', '==', sport)
  const snap = await q.get().catch(async () => {
    const all = await leaguesCol().get()
    return all
  })
  const rows = snap.docs.map((d) => d.data() as SportsLeagueDoc)
  return rows
    .filter((r) => (sport ? r.sport === sport : true) && r.active !== false)
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'tr'))
}

export async function listSeasons(leagueId: string): Promise<SportsSeasonDoc[]> {
  const snap = await seasonsCol().where('leagueId', '==', leagueId).get()
  return snap.docs
    .map((d) => d.data() as SportsSeasonDoc)
    .sort((a, b) => String(b.year).localeCompare(String(a.year)))
}

export async function queryMatchesBySportDate(
  sport: SkorSport,
  dateYmd: string
): Promise<SportsMatchDoc[]> {
  try {
    const snap = await matchesCol()
      .where('sport', '==', sport)
      .where('dateYmd', '==', dateYmd)
      .get()
    return snap.docs.map((d) => d.data() as SportsMatchDoc)
  } catch {
    // Missing composite index — fallback scan by date
    const snap = await matchesCol().where('dateYmd', '==', dateYmd).get()
    return snap.docs
      .map((d) => d.data() as SportsMatchDoc)
      .filter((m) => m.sport === sport)
  }
}

export async function queryLiveMatches(sport: SkorSport): Promise<SportsMatchDoc[]> {
  try {
    const snap = await matchesCol()
      .where('sport', '==', sport)
      .where('status', '==', 'live')
      .get()
    return snap.docs.map((d) => d.data() as SportsMatchDoc)
  } catch {
    const today = turkeyYmd()
    const docs = await queryMatchesBySportDate(sport, today)
    const yest = turkeyYmd(-1)
    const more = await queryMatchesBySportDate(sport, yest)
    return [...docs, ...more].filter((m) => m.status === 'live')
  }
}

export async function queryProgramMatches(
  sport: SkorSport,
  fromYmd: string,
  toYmd: string
): Promise<SportsMatchDoc[]> {
  try {
    const snap = await matchesCol()
      .where('sport', '==', sport)
      .where('dateYmd', '>=', fromYmd)
      .where('dateYmd', '<=', toYmd)
      .get()
    return snap.docs
      .map((d) => d.data() as SportsMatchDoc)
      .filter((m) => m.status === 'upcoming')
  } catch {
    const days: string[] = []
    let cur = fromYmd
    while (cur <= toYmd && days.length < 16) {
      days.push(cur)
      cur = turkeyYmdFrom(cur, 1)
    }
    const batches = await Promise.all(days.map((d) => queryMatchesBySportDate(sport, d)))
    return batches.flat().filter((m) => m.status === 'upcoming')
  }
}

export async function queryArchiveMatches(
  leagueId: string,
  season: number | string
): Promise<SportsMatchDoc[]> {
  try {
    const snap = await matchesCol()
      .where('leagueId', '==', leagueId)
      .where('season', '==', season)
      .orderBy('kickoff', 'desc')
      .limit(200)
      .get()
    return snap.docs.map((d) => d.data() as SportsMatchDoc)
  } catch {
    const snap = await matchesCol().where('leagueId', '==', leagueId).limit(400).get()
    return snap.docs
      .map((d) => d.data() as SportsMatchDoc)
      .filter((m) => String(m.season) === String(season))
      .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
      .slice(0, 200)
  }
}

export function turkeyYmd(offsetDays = 0): string {
  const base = new Date(Date.now() + 3 * 3600_000)
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function turkeyYmdFrom(ymd: string, delta: number): string {
  const ms = Date.parse(`${ymd}T12:00:00.000Z`) + delta * 86400_000
  return new Date(ms).toISOString().slice(0, 10)
}

/** Ensure season meta stays in sync with match upserts. */
export async function bumpSeasonMeta(
  leagueId: string,
  leagueName: string,
  sport: SkorSport,
  year: number | string,
  deltaMatches = 0
): Promise<void> {
  const id = `${leagueId}_${year}`
  const ref = seasonsCol().doc(id)
  const snap = await ref.get()
  const prev = snap.exists ? (snap.data() as SportsSeasonDoc) : null
  await ref.set(
    {
      id,
      leagueId,
      leagueName,
      sport,
      year,
      matchCount: (prev?.matchCount ?? 0) + deltaMatches,
      updatedAt: Date.now(),
    } satisfies SportsSeasonDoc,
    { merge: true }
  )
}

/** Delete by id list (maintenance). */
export async function deleteMatchesByIds(ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = getAdminFirestore()
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = db.batch()
    for (const id of ids.slice(i, i + BATCH)) {
      batch.delete(matchesCol().doc(id))
    }
    await batch.commit()
  }
}

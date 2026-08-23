import { CURRENT_SEASON, getStandingsResolved } from '@/services/footballService.server'
import { upsertStandings, upsertSeason } from '@/lib/skor/store'
import type { SportsStandingsDoc } from '@/lib/skor/types'

/** Pull standings from API-Football when Firestore is empty (with Free-plan season fallback). */
export async function hydrateStandingsFallback(
  leagueId: string,
  season: number | string
): Promise<SportsStandingsDoc | null> {
  const ext = leagueId.replace(/^futbol_/, '')
  const leagueNum = Number(ext)
  if (!Number.isFinite(leagueNum)) return null

  const preferred = Number(season) || CURRENT_SEASON
  const { season: resolvedSeason, standings: rows } = await getStandingsResolved(
    leagueNum,
    preferred
  )
  if (!rows.length) return null

  const mapped = rows.map((r) => ({
    rank: r.rank,
    teamId: String(r.teamId),
    teamName: r.teamName,
    teamLogo: r.teamLogo,
    played: r.played,
    won: r.won,
    draw: r.draw,
    lost: r.lost,
    goalsFor: r.goalsFor,
    goalsAgainst: r.goalsAgainst,
    points: r.points,
    form: r.form,
  }))

  const doc: SportsStandingsDoc = {
    id: `${leagueId}_${resolvedSeason}`,
    leagueId,
    leagueName: `Lig ${ext}`,
    season: resolvedSeason,
    sport: 'futbol',
    rows: mapped,
    updatedAt: Date.now(),
  }

  await upsertStandings(doc)
  if (resolvedSeason !== preferred) {
    await upsertStandings({
      ...doc,
      id: `${leagueId}_${preferred}`,
      season: preferred,
    })
  }
  await upsertSeason({
    id: `${leagueId}_${resolvedSeason}`,
    leagueId,
    leagueName: doc.leagueName,
    sport: 'futbol',
    year: resolvedSeason,
    matchCount: 0,
    updatedAt: Date.now(),
  })
  return {
    ...doc,
    id: `${leagueId}_${preferred}`,
    season: preferred,
  }
}

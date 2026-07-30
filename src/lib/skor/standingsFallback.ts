import { CURRENT_SEASON, getStandings } from '@/services/footballService.server'
import { upsertStandings, upsertSeason } from '@/lib/skor/store'
import type { SportsStandingsDoc } from '@/lib/skor/types'

/** Pull standings from API-Football when Firestore is empty. */
export async function hydrateStandingsFallback(
  leagueId: string,
  season: number | string
): Promise<SportsStandingsDoc | null> {
  const ext = leagueId.replace(/^futbol_/, '')
  const leagueNum = Number(ext)
  if (!Number.isFinite(leagueNum)) return null

  const rows = await getStandings(leagueNum, Number(season) || CURRENT_SEASON)
  if (!rows.length) return null

  const doc: SportsStandingsDoc = {
    id: `${leagueId}_${season}`,
    leagueId,
    leagueName: rows[0] ? `Lig ${ext}` : leagueId,
    season,
    sport: 'futbol',
    rows: rows.map((r) => ({
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
    })),
    updatedAt: Date.now(),
  }

  await upsertStandings(doc)
  await upsertSeason({
    id: `${leagueId}_${season}`,
    leagueId,
    leagueName: doc.leagueName,
    sport: 'futbol',
    year: season,
    matchCount: 0,
    updatedAt: Date.now(),
  })
  return doc
}

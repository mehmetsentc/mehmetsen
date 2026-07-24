'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, X } from 'lucide-react'
import type {
  ScoreboardLeagueGroup,
  ScoreboardMatch,
  Standing,
  TeamSquadPlayer,
} from '@/services/footballService.server'
import { cn } from '@/lib/utils'

type TabId = 'live' | 'today' | 'results' | 'program' | 'standings'

const TABS: { id: TabId; label: string }[] = [
  { id: 'live', label: 'Canlı' },
  { id: 'today', label: 'Bugün' },
  { id: 'results', label: 'Sonuçlar' },
  { id: 'program', label: 'Program' },
  { id: 'standings', label: 'Puan' },
]

const LIVE = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT', 'BREAK'])
const FINISHED = new Set(['FT', 'AET', 'PEN', 'AOT', 'WO'])

const STANDINGS_LEAGUES = [
  { id: 203, label: 'Süper Lig' },
  { id: 39, label: 'Premier League' },
  { id: 140, label: 'La Liga' },
  { id: 78, label: 'Bundesliga' },
  { id: 135, label: 'Serie A' },
  { id: 61, label: 'Ligue 1' },
  { id: 2, label: 'Şampiyonlar Ligi' },
] as const

function statusLabel(m: ScoreboardMatch): string {
  if (LIVE.has(m.statusShort)) {
    if (m.statusShort === 'HT') return 'Devre'
    if (typeof m.elapsed === 'number' && m.elapsed > 0) return `${m.elapsed}'`
    return 'CANLI'
  }
  if (FINISHED.has(m.statusShort)) {
    if (m.statusShort === 'PEN') return 'PEN'
    if (m.statusShort === 'AET') return 'UZ'
    return 'MS'
  }
  return new Date(m.date).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  })
}

function countryLabel(country: string): string {
  const map: Record<string, string> = {
    Turkey: 'Türkiye',
    England: 'İngiltere',
    Spain: 'İspanya',
    Germany: 'Almanya',
    Italy: 'İtalya',
    France: 'Fransa',
    World: 'Dünya',
    Europe: 'Avrupa',
  }
  return map[country] ?? country
}

function MatchRow({
  match,
  onTeamClick,
}: {
  match: ScoreboardMatch
  onTeamClick: (teamName: string, teamIdHint?: number) => void
}) {
  const isLive = LIVE.has(match.statusShort)
  const isFinished = FINISHED.has(match.statusShort)
  const hasScore = match.homeGoals != null && match.awayGoals != null
  const homeWin = hasScore && (match.homeGoals as number) > (match.awayGoals as number)
  const awayWin = hasScore && (match.awayGoals as number) > (match.homeGoals as number)

  return (
    <div
      className={cn(
        'grid grid-cols-[48px_1fr_auto_1fr] items-center gap-2 border-b border-[rgb(var(--color-border))]/60 px-3 py-2.5 last:border-0',
        isLive && 'bg-red-500/5'
      )}
    >
      <span
        className={cn(
          'text-[11px] font-bold tabular-nums',
          isLive ? 'text-red-500' : 'text-[rgb(var(--color-muted))]'
        )}
      >
        {statusLabel(match)}
      </span>

      <button
        type="button"
        onClick={() => onTeamClick(match.homeTeam)}
        className={cn(
          'flex min-w-0 items-center justify-end gap-1.5 text-right text-[13px]',
          homeWin ? 'font-bold text-[rgb(var(--color-text))]' : 'font-medium text-[rgb(var(--color-muted))]'
        )}
      >
        <span className="truncate">{match.homeTeam}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={match.homeLogo} alt="" className="h-5 w-5 shrink-0 object-contain" />
      </button>

      <div className="min-w-[52px] text-center text-[14px] font-black tabular-nums text-[rgb(var(--color-text))]">
        {hasScore ? (
          <span className={isLive ? 'text-red-500' : undefined}>
            {match.homeGoals} - {match.awayGoals}
          </span>
        ) : isFinished ? (
          '-'
        ) : (
          <span className="font-semibold text-[rgb(var(--color-muted))]">v</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => onTeamClick(match.awayTeam)}
        className={cn(
          'flex min-w-0 items-center gap-1.5 text-left text-[13px]',
          awayWin ? 'font-bold text-[rgb(var(--color-text))]' : 'font-medium text-[rgb(var(--color-muted))]'
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={match.awayLogo} alt="" className="h-5 w-5 shrink-0 object-contain" />
        <span className="truncate">{match.awayTeam}</span>
      </button>
    </div>
  )
}

function LeagueBlock({
  group,
  onOpenStandings,
  onTeamClick,
}: {
  group: ScoreboardLeagueGroup
  onOpenStandings: (leagueId: number, title: string) => void
  onTeamClick: (teamName: string) => void
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm">
      <button
        type="button"
        onClick={() => onOpenStandings(group.leagueId, `${countryLabel(group.country)} - ${group.leagueName}`)}
        className="flex w-full items-center gap-2 bg-[rgb(var(--color-surface))] px-3 py-2 text-left transition-colors hover:bg-[rgb(var(--color-border))]/40"
      >
        {group.countryFlag ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.countryFlag} alt="" className="h-5 w-5 rounded-full object-cover" />
        ) : (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(var(--color-border))] text-[10px]">
            ⚽
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[rgb(var(--color-text))]">
          {countryLabel(group.country)} — {group.leagueName}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
          Puan
        </span>
      </button>
      <div>
        {group.matches.map((m) => (
          <MatchRow key={m.id} match={m} onTeamClick={onTeamClick} />
        ))}
      </div>
    </section>
  )
}

function StandingsPanel({
  leagueId,
  title,
  onClose,
  onTeam,
}: {
  leagueId: number
  title: string
  onClose: () => void
  onTeam: (teamId: number, teamName: string) => void
}) {
  const [rows, setRows] = useState<Standing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/football/standings?league=${leagueId}`)
      .then((r) => r.json())
      .then((d: { standings?: Standing[] }) => {
        if (!cancelled) setRows(d.standings ?? [])
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [leagueId])

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-[rgb(var(--color-card))] sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3">
          <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-[rgb(var(--color-text))]">
            {title}
          </h3>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-full p-1.5 hover:bg-[rgb(var(--color-surface))]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-2">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-[rgb(var(--color-muted))]">
              Puan tablosu yüklenemedi.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[rgb(var(--color-muted))]">
                  <th className="px-2 py-1.5 text-left">#</th>
                  <th className="px-2 py-1.5 text-left">Takım</th>
                  <th className="px-1 py-1.5 text-center">O</th>
                  <th className="px-1 py-1.5 text-center">Av</th>
                  <th className="px-2 py-1.5 text-center font-bold">P</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.teamId} className="border-t border-[rgb(var(--color-border))]/50">
                    <td className="px-2 py-1.5 text-[rgb(var(--color-muted))]">{r.rank}</td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => onTeam(r.teamId, r.teamName)}
                        className="flex items-center gap-2 text-left font-medium text-[rgb(var(--color-text))] hover:underline"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.teamLogo} alt="" className="h-5 w-5 object-contain" />
                        <span className="truncate">{r.teamName}</span>
                      </button>
                    </td>
                    <td className="px-1 py-1.5 text-center text-[rgb(var(--color-muted))]">{r.played}</td>
                    <td className="px-1 py-1.5 text-center text-[rgb(var(--color-muted))]">
                      {r.goalsFor - r.goalsAgainst}
                    </td>
                    <td className="px-2 py-1.5 text-center font-bold text-[rgb(var(--color-text))]">
                      {r.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function SquadPanel({
  teamId,
  teamName,
  onClose,
  onBack,
}: {
  teamId: number
  teamName: string
  onClose: () => void
  onBack: () => void
}) {
  const [players, setPlayers] = useState<TeamSquadPlayer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/football/squad?team=${teamId}`)
      .then((r) => r.json())
      .then((d: { players?: TeamSquadPlayer[] }) => {
        if (!cancelled) setPlayers(d.players ?? [])
      })
      .catch(() => {
        if (!cancelled) setPlayers([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [teamId])

  const grouped = useMemo(() => {
    const order = ['Goalkeeper', 'Defender', 'Midfielder', 'Attacker', 'Kaleci', 'Defans', 'Orta Saha', 'Forvet']
    const map = new Map<string, TeamSquadPlayer[]>()
    for (const p of players) {
      const key = p.position || 'Diğer'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return [...map.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0])
      const ib = order.indexOf(b[0])
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }, [players])

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-[rgb(var(--color-card))] sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3">
          <button type="button" onClick={onBack} className="text-xs font-semibold text-[rgb(var(--color-brand))]">
            ← Puan
          </button>
          <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-[rgb(var(--color-text))]">
            {teamName} kadrosu
          </h3>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-full p-1.5 hover:bg-[rgb(var(--color-surface))]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-3">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
            </div>
          ) : players.length === 0 ? (
            <p className="py-8 text-center text-sm text-[rgb(var(--color-muted))]">Kadro bulunamadı.</p>
          ) : (
            <div className="space-y-4">
              {grouped.map(([pos, list]) => (
                <div key={pos}>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                    {pos}
                  </p>
                  <ul className="space-y-1">
                    {list.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[rgb(var(--color-surface))]"
                      >
                        {p.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photo} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--color-border))] text-[10px]">
                            {p.number ?? '—'}
                          </span>
                        )}
                        <span className="w-6 text-center text-xs font-bold text-[rgb(var(--color-muted))]">
                          {p.number ?? '—'}
                        </span>
                        <span className="flex-1 truncate text-sm font-medium text-[rgb(var(--color-text))]">
                          {p.name}
                        </span>
                        {p.age ? (
                          <span className="text-[11px] text-[rgb(var(--color-muted))]">{p.age}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Maçkolik tarzı skor paneli — /kategori/spor üstüne gömülü.
 */
export function MackolikScoreboard() {
  const [tab, setTab] = useState<TabId>('today')
  const [groups, setGroups] = useState<ScoreboardLeagueGroup[]>([])
  const [liveCount, setLiveCount] = useState(0)
  const [dateLabel, setDateLabel] = useState('')
  const [emptyReason, setEmptyReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [standingsLeague, setStandingsLeague] = useState<{ id: number; title: string } | null>(
    null
  )
  const [squad, setSquad] = useState<{ id: number; name: string } | null>(null)
  const [standingsPick, setStandingsPick] = useState(203)

  const load = useCallback(async () => {
    if (tab === 'standings') {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/sports/scoreboard?tab=${tab}`, { cache: 'no-store' })
      const data = (await res.json()) as {
        groups?: ScoreboardLeagueGroup[]
        liveCount?: number
        date?: string
        emptyReason?: string | null
      }
      setGroups(data.groups ?? [])
      setLiveCount(data.liveCount ?? 0)
      setDateLabel(data.date ?? '')
      setEmptyReason(data.emptyReason ?? null)
    } catch {
      setGroups([])
      setEmptyReason(null)
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (tab !== 'live' && tab !== 'today') return
    const ms = tab === 'live' || liveCount > 0 ? 30_000 : 120_000
    const t = setInterval(() => void load(), ms)
    return () => clearInterval(t)
  }, [tab, liveCount, load])

  // Puan sekmesi paneli ayrı — overlay açma
  useEffect(() => {
    if (tab === 'standings') setStandingsLeague(null)
  }, [tab])

  return (
    <section className="mb-6" aria-label="Canlı skorlar">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="text-base" aria-hidden>
          ⚽
        </span>
        <h2 className="text-sm font-black text-[rgb(var(--color-text))]">
          Canlı Skor
          {liveCount > 0 ? (
            <span className="ml-2 text-[11px] font-semibold text-red-500">{liveCount} canlı</span>
          ) : dateLabel ? (
            <span className="ml-2 text-[11px] font-normal text-[rgb(var(--color-muted))]">
              {dateLabel}
            </span>
          ) : null}
        </h2>
        {!loading ? (
          <button
            type="button"
            onClick={() => void load()}
            className="ml-auto text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
            aria-label="Yenile"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-[rgb(var(--color-surface))] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
              tab === t.id
                ? 'bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] shadow-sm'
                : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            )}
          >
            {t.label}
            {t.id === 'live' && liveCount > 0 ? (
              <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'standings' ? (
        <div className="space-y-3">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {STANDINGS_LEAGUES.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setStandingsPick(l.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold',
                  standingsPick === l.id
                    ? 'border-[rgb(var(--color-brand))] bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]'
                    : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
          <StandingsInline
            leagueId={standingsPick}
            onTeam={(id, name) => setSquad({ id, name })}
          />
        </div>
      ) : loading ? (
        <div className="flex h-28 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
        </div>
      ) : groups.length === 0 ? (
        <p className="px-1 text-xs text-[rgb(var(--color-muted))]">
          {tab === 'live'
            ? 'Şu an canlı maç yok — Bugün veya Program sekmesine bakın.'
            : tab === 'today' || emptyReason === 'no_matches_today'
              ? 'Bugün oynanan / oynanacak maç yok. Yaklaşan fikstür için Program sekmesine bakın.'
              : tab === 'results'
                ? 'Son günlerde sonuç bulunamadı.'
                : tab === 'program'
                  ? 'Yaklaşan program bulunamadı.'
                  : 'Maç bulunamadı.'}
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <LeagueBlock
              key={g.key}
              group={g}
              onOpenStandings={(id, title) => setStandingsLeague({ id, title })}
              onTeamClick={() => {
                /* takım id yok — puan panelinden kadro */
              }}
            />
          ))}
        </div>
      )}

      {standingsLeague && tab !== 'standings' ? (
        <StandingsPanel
          leagueId={standingsLeague.id}
          title={standingsLeague.title}
          onClose={() => setStandingsLeague(null)}
          onTeam={(id, name) => {
            setSquad({ id, name })
          }}
        />
      ) : null}

      {squad ? (
        <SquadPanel
          teamId={squad.id}
          teamName={squad.name}
          onClose={() => {
            setSquad(null)
            if (tab !== 'standings') setStandingsLeague(null)
          }}
          onBack={() => setSquad(null)}
        />
      ) : null}
    </section>
  )
}

function StandingsInline({
  leagueId,
  onTeam,
}: {
  leagueId: number
  onTeam: (id: number, name: string) => void
}) {
  const [rows, setRows] = useState<Standing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/football/standings?league=${leagueId}`)
      .then((r) => r.json())
      .then((d: { standings?: Standing[] }) => {
        if (!cancelled) setRows(d.standings ?? [])
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [leagueId])

  if (loading) {
    return (
      <div className="flex h-28 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <p className="px-1 text-xs text-[rgb(var(--color-muted))]">Puan tablosu yüklenemedi.</p>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]">
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Takım</th>
            <th className="px-2 py-2 text-center">O</th>
            <th className="px-2 py-2 text-center">Av</th>
            <th className="px-3 py-2 text-center font-bold">P</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.teamId} className="border-b border-[rgb(var(--color-border))]/40 last:border-0">
              <td className="px-3 py-1.5 text-[rgb(var(--color-muted))]">{r.rank}</td>
              <td className="px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => onTeam(r.teamId, r.teamName)}
                  className="flex items-center gap-2 font-medium text-[rgb(var(--color-text))] hover:underline"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.teamLogo} alt="" className="h-5 w-5 object-contain" />
                  {r.teamName}
                </button>
              </td>
              <td className="px-2 py-1.5 text-center text-[rgb(var(--color-muted))]">{r.played}</td>
              <td className="px-2 py-1.5 text-center text-[rgb(var(--color-muted))]">
                {r.goalsFor - r.goalsAgainst}
              </td>
              <td className="px-3 py-1.5 text-center font-bold">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

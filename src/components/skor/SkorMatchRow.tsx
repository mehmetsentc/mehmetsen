'use client'

import { cn } from '@/lib/utils'
import type { SkorBoardMatch } from '@/lib/skor/types'
import { FINISHED_SHORT, LIVE_SHORT } from '@/lib/skor/types'

function statusLabel(m: SkorBoardMatch): string {
  if (m.status === 'live' || LIVE_SHORT.has(m.statusShort)) {
    if (m.statusShort === 'HT') return 'Devre'
    if (typeof m.elapsed === 'number' && m.elapsed > 0) return `${m.elapsed}'`
    return 'CANLI'
  }
  if (m.status === 'finished' || FINISHED_SHORT.has(m.statusShort)) {
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

export function SkorMatchRow({ match }: { match: SkorBoardMatch }) {
  const isLive = match.status === 'live' || LIVE_SHORT.has(match.statusShort)
  const isFinished = match.status === 'finished' || FINISHED_SHORT.has(match.statusShort)
  const hasScore = match.homeGoals != null && match.awayGoals != null
  const homeWin = hasScore && (match.homeGoals as number) > (match.awayGoals as number)
  const awayWin = hasScore && (match.awayGoals as number) > (match.homeGoals as number)

  return (
    <div className={cn('skor-match', isLive && 'skor-match--live')}>
      <span className={cn('skor-match__clock', isLive && 'skor-match__clock--live')}>
        {isLive ? <span className="skor-pulse mr-1 align-middle" aria-hidden /> : null}
        {statusLabel(match)}
      </span>
      <span
        className={cn(
          'skor-match__team',
          homeWin && isFinished && 'font-extrabold',
          !homeWin && isFinished && hasScore && 'opacity-70'
        )}
      >
        {match.homeTeam}
      </span>
      <span className="skor-match__score">
        {hasScore || isLive ? (
          <>
            <span>{match.homeGoals ?? '—'}</span>
            <span className="text-[rgb(var(--color-muted))]">-</span>
            <span>{match.awayGoals ?? '—'}</span>
          </>
        ) : (
          <span className="text-[rgb(var(--color-muted))] text-[11px] font-semibold">vs</span>
        )}
      </span>
      <span
        className={cn(
          'skor-match__team skor-match__team--right',
          awayWin && isFinished && 'font-extrabold',
          !awayWin && isFinished && hasScore && 'opacity-70'
        )}
      >
        {match.awayTeam}
      </span>
    </div>
  )
}

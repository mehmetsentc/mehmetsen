'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { MatchResult } from '@/lib/sports/matchTypes'

function MatchChip({ match }: { match: MatchResult }) {
  const isLive   = match.status === 'live'
  const hasScore = match.homeScore !== null && match.awayScore !== null

  return (
    <div className="relative flex shrink-0 flex-col items-center gap-1 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm">
      {isLive && (
        <span className="absolute -right-1 -top-1 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
        </span>
      )}
      <div className="flex items-center gap-1.5">
        <Image src={match.homeBadge} alt={match.homeTeam} width={18} height={18}
          className="rounded-full object-contain" unoptimized />
        <span className="max-w-[60px] truncate text-[11px] font-semibold text-white">
          {match.homeTeam.split(' ').slice(-1)[0]}
        </span>
      </div>
      <div className={`text-[13px] font-black tabular-nums ${isLive ? 'text-red-300' : 'text-white'}`}>
        {hasScore ? `${match.homeScore}-${match.awayScore}` : (match.time ?? '–')}
      </div>
      <div className="flex items-center gap-1.5">
        <Image src={match.awayBadge} alt={match.awayTeam} width={18} height={18}
          className="rounded-full object-contain" unoptimized />
        <span className="max-w-[60px] truncate text-[11px] font-semibold text-white">
          {match.awayTeam.split(' ').slice(-1)[0]}
        </span>
      </div>
    </div>
  )
}

export function MatchStripMini() {
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [liveCount, setLiveCount] = useState(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sports/matches', { cache: 'no-store' })
      const d = await res.json() as { matches: MatchResult[]; liveCount?: number }
      setMatches(d.matches ?? [])
      setLiveCount(d.liveCount ?? 0)
    } catch {}
  }, [])

  useEffect(() => { void load() }, [load])

  // Canlı maç varsa 30s, yoksa 2 dakikada bir yenile
  useEffect(() => {
    const interval = setInterval(() => void load(), liveCount > 0 ? 30_000 : 120_000)
    return () => clearInterval(interval)
  }, [liveCount, load])

  if (matches.length === 0) return null

  return (
    <div className="mb-3 overflow-hidden rounded-2xl bg-emerald-600">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white">
          <span>⚽</span> Maçlar
          {liveCount > 0 && (
            <span className="ml-1 flex items-center gap-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-black normal-case">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              {liveCount} CANLI
            </span>
          )}
        </span>
        <Link href="/kategori/spor"
          className="text-[10px] font-semibold text-emerald-100 underline-offset-2 hover:underline">
          Tümü →
        </Link>
      </div>
      <div className="flex gap-2 overflow-x-auto px-3 pb-3 scrollbar-none">
        {matches.slice(0, 10).map((m) => (
          <MatchChip key={m.id} match={m} />
        ))}
      </div>
    </div>
  )
}

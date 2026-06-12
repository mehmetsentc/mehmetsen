'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { MatchResult } from '@/app/api/sports/matches/route'

function MatchChip({ match }: { match: MatchResult }) {
  const isFinished = match.homeScore !== null && match.awayScore !== null
  return (
    <div className="flex shrink-0 flex-col items-center gap-1 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm">
      <div className="flex items-center gap-1.5">
        <Image src={match.homeBadge} alt={match.homeTeam} width={18} height={18} className="rounded-full object-contain" unoptimized />
        <span className="max-w-[60px] truncate text-[11px] font-semibold text-white">
          {match.homeTeam.split(' ').slice(-1)[0]}
        </span>
      </div>
      <div className="text-[13px] font-black tabular-nums text-white">
        {isFinished ? `${match.homeScore}-${match.awayScore}` : (match.time ?? '–')}
      </div>
      <div className="flex items-center gap-1.5">
        <Image src={match.awayBadge} alt={match.awayTeam} width={18} height={18} className="rounded-full object-contain" unoptimized />
        <span className="max-w-[60px] truncate text-[11px] font-semibold text-white">
          {match.awayTeam.split(' ').slice(-1)[0]}
        </span>
      </div>
    </div>
  )
}

export function MatchStripMini() {
  const [matches, setMatches] = useState<MatchResult[]>([])

  useEffect(() => {
    fetch('/api/sports/matches')
      .then((r) => r.json())
      .then((d: { matches: MatchResult[] }) => setMatches(d.matches ?? []))
      .catch(() => {})
  }, [])

  if (matches.length === 0) return null

  return (
    <div className="mb-3 overflow-hidden rounded-2xl bg-emerald-600">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white">
          <span>⚽</span> Maçlar
        </span>
        <Link href="/kategori/spor" className="text-[10px] font-semibold text-emerald-100 underline-offset-2 hover:underline">
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

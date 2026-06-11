'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Loader2 } from 'lucide-react'
import type { TmStanding } from '@/lib/sports/transfermarkt'

export function SuperLigTable() {
  const [rows, setRows]     = useState<TmStanding[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/sports/transfermarkt?type=standings')
      .then(r => r.json())
      .then((d: { data: TmStanding[] }) => setRows(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex h-24 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
    </div>
  )

  if (rows.length === 0) return null

  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-sm font-bold text-[rgb(var(--color-text))]">
        🇹🇷 Süper Lig Puan Tablosu
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]">
              <th className="px-3 py-2 text-left font-semibold">#</th>
              <th className="px-3 py-2 text-left font-semibold">Takım</th>
              <th className="px-3 py-2 text-center font-semibold">O</th>
              <th className="px-3 py-2 text-center font-semibold">G</th>
              <th className="px-3 py-2 text-center font-semibold">B</th>
              <th className="px-3 py-2 text-center font-semibold">M</th>
              <th className="px-3 py-2 text-center font-semibold">A</th>
              <th className="px-3 py-2 text-center font-bold text-[rgb(var(--color-text))]">P</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              // Şampiyonlar Ligi (1-4) / UEFA (5-6) / küme düşme (son 3)
              const isUcl = r.rank <= 4
              const isUel = r.rank === 5 || r.rank === 6
              const isRel = r.rank >= rows.length - 2
              return (
                <tr
                  key={r.clubId || i}
                  className="border-b border-[rgb(var(--color-border))] last:border-0"
                >
                  <td className="px-3 py-2">
                    <span className={`inline-block w-4 text-center font-bold ${
                      isUcl ? 'text-blue-500' : isUel ? 'text-orange-500' : isRel ? 'text-red-500' : 'text-[rgb(var(--color-muted))]'
                    }`}>
                      {r.rank}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {r.clubLogo ? (
                        <Image src={r.clubLogo} alt="" width={18} height={18} className="rounded-full object-contain" unoptimized />
                      ) : (
                        <div className="h-[18px] w-[18px] rounded-full bg-[rgb(var(--color-surface))]" />
                      )}
                      <span className="font-semibold text-[rgb(var(--color-text))]">{r.clubName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center text-[rgb(var(--color-muted))]">{r.played}</td>
                  <td className="px-3 py-2 text-center text-[rgb(var(--color-muted))]">{r.won}</td>
                  <td className="px-3 py-2 text-center text-[rgb(var(--color-muted))]">{r.drawn}</td>
                  <td className="px-3 py-2 text-center text-[rgb(var(--color-muted))]">{r.lost}</td>
                  <td className="px-3 py-2 text-center text-[rgb(var(--color-muted))]">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                  <td className="px-3 py-2 text-center font-black text-[rgb(var(--color-text))]">{r.points}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="px-3 py-1.5 text-[10px] text-[rgb(var(--color-muted))]">
          <span className="text-blue-500">■</span> ŞL &nbsp;
          <span className="text-orange-500">■</span> UEFA &nbsp;
          <span className="text-red-500">■</span> Küme Düşme &nbsp;· Transfermarkt
        </p>
      </div>
    </section>
  )
}

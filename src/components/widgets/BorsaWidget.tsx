'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
import type { BistData, BistQuote } from '@/app/api/finance/bist/route'

// ── Yardımcı ──────────────────────────────────────────────────────────────────

function fmt(value: number, decimals = 2): string {
  if (!value || isNaN(value)) return '—'
  return value.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtPrice(q: BistQuote): string {
  if (!q.price) return '—'
  if (q.type === 'index') return fmt(q.price, 0)
  if (q.type === 'fx') return fmt(q.price, 4)
  if (q.type === 'commodity') {
    if (q.ticker === 'BTC') return '$' + fmt(q.price, 0)
    return '$' + fmt(q.price, 2)
  }
  return fmt(q.price, 2) + ' ₺'
}

function Change({ q }: { q: BistQuote }) {
  const up = q.changePct >= 0
  const cls = up
    ? 'text-emerald-500 dark:text-emerald-400'
    : 'text-red-500 dark:text-red-400'
  const Icon = up ? TrendingUp : TrendingDown
  const sign = up ? '+' : ''
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${cls}`}>
      <Icon className="h-3 w-3" />
      {sign}{fmt(q.changePct, 2)}%
    </span>
  )
}

// ── Endeks kartı ───────────────────────────────────────────────────────────────

function IndexCard({ q }: { q: BistQuote }) {
  const up = q.changePct >= 0
  const borderCls = up ? 'border-emerald-500/30' : 'border-red-500/30'
  const bgCls = up ? 'bg-emerald-500/5' : 'bg-red-500/5'

  return (
    <div className={`rounded-xl border ${borderCls} ${bgCls} p-3`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-muted))]">
        {q.ticker}
      </p>
      <p className="mt-1 text-xs font-semibold text-[rgb(var(--color-muted))] truncate">
        {q.name}
      </p>
      <p className="mt-2 text-lg font-bold leading-none text-[rgb(var(--color-text))]">
        {q.type === 'index' ? fmt(q.price, 0) : fmtPrice(q)}
      </p>
      <div className="mt-1.5">
        <Change q={q} />
      </div>
    </div>
  )
}

// ── Hisse satırı ───────────────────────────────────────────────────────────────

function StockRow({ q, rank }: { q: BistQuote; rank: number }) {
  const up = q.changePct >= 0
  const priceCls = up ? 'text-emerald-500' : 'text-red-500'

  return (
    <tr className="border-b border-[rgb(var(--color-border))] last:border-0 hover:bg-[rgb(var(--color-surface))] transition-colors">
      <td className="py-2.5 pr-2 pl-3 text-xs font-light text-[rgb(var(--color-muted))] w-6">{rank}</td>
      <td className="py-2.5 pr-4">
        <p className="text-xs font-bold text-[rgb(var(--color-text))]">{q.ticker}</p>
        <p className="text-[10px] text-[rgb(var(--color-muted))] truncate max-w-[130px]">{q.name}</p>
      </td>
      <td className={`py-2.5 pr-4 text-right text-sm font-semibold ${priceCls}`}>
        {fmt(q.price, 2)}
      </td>
      <td className="py-2.5 pr-3 text-right">
        <Change q={q} />
      </td>
    </tr>
  )
}

// ── Döviz / Emtia satırı ───────────────────────────────────────────────────────

function FxRow({ q }: { q: BistQuote }) {
  const up = q.changePct >= 0
  const priceCls = up ? 'text-emerald-500' : 'text-red-500'
  return (
    <tr className="border-b border-[rgb(var(--color-border))] last:border-0 hover:bg-[rgb(var(--color-surface))] transition-colors">
      <td className="py-2.5 pr-4 pl-3">
        <p className="text-xs font-bold text-[rgb(var(--color-text))]">{q.ticker}</p>
        <p className="text-[10px] text-[rgb(var(--color-muted))]">{q.name}</p>
      </td>
      <td className={`py-2.5 pr-4 text-right text-sm font-semibold ${priceCls}`}>
        {fmtPrice(q)}
      </td>
      <td className="py-2.5 pr-3 text-right">
        <Change q={q} />
      </td>
    </tr>
  )
}

// ── Tab bileşeni ───────────────────────────────────────────────────────────────

type TabKey = 'stocks' | 'fx' | 'commodities'

function Tabs({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'stocks', label: 'Hisseler' },
    { key: 'fx', label: 'Döviz' },
    { key: 'commodities', label: 'Emtia' },
  ]
  return (
    <div className="flex gap-1 border-b border-[rgb(var(--color-border))] px-3 pt-2">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`pb-2 px-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
            active === t.key
              ? 'border-[rgb(var(--color-brand))] text-[rgb(var(--color-brand))]'
              : 'border-transparent text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-[rgb(var(--color-border))]" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-[rgb(var(--color-border))]" />
    </div>
  )
}

// ── Ana widget ─────────────────────────────────────────────────────────────────

export function BorsaWidget() {
  const [data, setData] = useState<BistData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('stocks')
  const [lastFetch, setLastFetch] = useState<Date | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/finance/bist')
      .then((r) => r.json())
      .then((d: BistData) => { setData(d); setLastFetch(new Date()) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  if (loading && !data) return <Skeleton />

  const indices    = data?.indices    ?? []
  const stocks     = data?.stocks     ?? []
  const fx         = data?.fx         ?? []
  const commodities = data?.commodities ?? []

  const topIndices = indices.slice(0, 3)

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[rgb(var(--color-brand))]" />
          <span className="text-sm font-bold text-[rgb(var(--color-text))]">Canlı Piyasa Verileri</span>
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            CANLI
          </span>
        </div>
        <button
          type="button"
          onClick={load}
          title="Yenile"
          className="rounded-lg p-1.5 text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-border))] hover:text-[rgb(var(--color-text))] transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Endeks kartları */}
      {topIndices.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {topIndices.map((q) => <IndexCard key={q.symbol} q={q} />)}
        </div>
      )}

      {/* Diğer endeksler (XU030 sonrası) */}
      {indices.length > 3 && (
        <div className="grid grid-cols-2 gap-3">
          {indices.slice(3).map((q) => <IndexCard key={q.symbol} q={q} />)}
        </div>
      )}

      {/* Tab tablosu */}
      <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] overflow-hidden">
        <Tabs active={activeTab} onChange={setActiveTab} />

        <table className="w-full">
          <tbody>
            {activeTab === 'stocks' && stocks.map((q, i) => (
              <StockRow key={q.symbol} q={q} rank={i + 1} />
            ))}
            {activeTab === 'fx' && fx.map((q) => (
              <FxRow key={q.symbol} q={q} />
            ))}
            {activeTab === 'commodities' && commodities.map((q) => (
              <FxRow key={q.symbol} q={q} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Kaynak + güncelleme zamanı */}
      <p className="text-center text-[10px] text-[rgb(var(--color-muted))]">
        Yahoo Finance · Gecikmeli olabilir
        {lastFetch && ` · ${lastFetch.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}
      </p>
    </div>
  )
}

'use client'

/**
 * /admin/social/gorsel
 *
 * Onyedi Tivi stilinde sosyal medya görsel üretici.
 * Son 48 saatteki haberleri listeler; her haber için
 * /api/og/social/[id] endpoint'i üzerinden 1080×1080 görsel sunar.
 */

import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { Download, ExternalLink, ImageIcon, Loader2, RefreshCw } from 'lucide-react'

// Çanakkale il merkezi + tüm ilçeler
const CANAKKALE_SLUGS = [
  'canakkale',
  'biga', 'can', 'yenice', 'bayramic', 'ezine',
  'ayvacik', 'gokceada', 'bozcaada', 'gelibolu', 'eceabat', 'lapseki',
]

interface NewsRow {
  id: string
  title: string
  categoryId: string
  imageUrl?: string
  publishedAt?: string
  slug?: string
}

const CAT_COLOR: Record<string, string> = {
  gundem: '#e11d48', siyaset: '#7c3aed', spor: '#16a34a',
  futbol: '#15803d', basketbol: '#166534', voleybol: '#14532d',
  ekonomi: '#d97706', teknoloji: '#2563eb', kultur: '#7c3aed',
  sinema: '#6d28d9', tiyatro: '#5b21b6', konser: '#6d28d9',
  festival: '#4c1d95', magazin: '#be185d', 'yerel-haber': '#059669',
  dunya: '#475569', gastronomi: '#ea580c', otomobil: '#475569',
  saglik: '#e11d48', bilim: '#0d9488', trend: '#d97706',
}

const CAT_LABEL: Record<string, string> = {
  gundem: 'Gündem', siyaset: 'Siyaset', spor: 'Spor', futbol: 'Futbol',
  basketbol: 'Basketbol', voleybol: 'Voleybol', hentbol: 'Hentbol',
  atletizm: 'Atletizm', gures: 'Güreş', ekonomi: 'Ekonomi',
  teknoloji: 'Teknoloji', kultur: 'Kültür', sinema: 'Sinema',
  tiyatro: 'Tiyatro', konser: 'Konser', festival: 'Festival',
  magazin: 'Magazin', 'yerel-haber': 'Yerel', dunya: 'Dünya',
  gastronomi: 'Gastronomi', otomobil: 'Otomobil', saglik: 'Sağlık',
  bilim: 'Bilim', trend: 'Trend',
}

function ogUrl(id: string) {
  const base =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://nahaber.com'
  return `${base}/api/og/social/${id}`
}

async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    window.open(url, '_blank')
  }
}

export default function SosyalGorselPage() {
  const [articles, setArticles] = useState<NewsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState('all')

  async function load() {
    setLoading(true)
    try {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      const snap = await getDocs(
        query(
          collection(db, 'news'),
          where('status', '==', 'published'),
          where('citySlug', 'in', CANAKKALE_SLUGS),
          where('publishedAt', '>=', cutoff),
          orderBy('publishedAt', 'desc'),
          limit(60)
        )
      )
      setArticles(
        snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            title: data.title ?? '',
            categoryId: data.categoryId ?? 'gundem',
            imageUrl: data.imageUrl ?? '',
            publishedAt: data.publishedAt ?? '',
            slug: data.slug ?? '',
          }
        })
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const categories = ['all', ...Array.from(new Set(articles.map((a) => a.categoryId))).sort()]
  const filtered =
    catFilter === 'all' ? articles : articles.filter((a) => a.categoryId === catFilter)

  const selected = selectedId ? articles.find((a) => a.id === selectedId) : null

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">

      {/* ── Left: article list ── */}
      <div className="flex w-80 shrink-0 flex-col border-r border-white/10">
        {/* Header */}
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Son 48 Saat</h2>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {/* Category filter */}
          <div className="mt-3 flex flex-wrap gap-1">
            {categories.slice(0, 8).map((cat) => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                  catFilter === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/10 text-slate-400 hover:bg-white/15 hover:text-white'
                }`}
              >
                {cat === 'all' ? 'Tümü' : (CAT_LABEL[cat] ?? cat)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            {filtered.length} Çanakkale haberi · görsel hazır
          </p>
        </div>

        {/* Article list */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            </div>
          )}
          {!loading && filtered.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className={`flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors ${
                selectedId === a.id ? 'bg-blue-600/20' : 'hover:bg-white/5'
              }`}
            >
              {/* Thumbnail */}
              <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-white/10">
                {a.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="m-auto h-5 w-5 text-slate-600" />
                )}
                <div
                  className="absolute bottom-0 left-0 right-0 h-1"
                  style={{ backgroundColor: CAT_COLOR[a.categoryId] ?? '#3b82f6' }}
                />
              </div>
              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[11px] font-medium leading-snug text-white">
                  {a.title}
                </p>
                <span
                  className="mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
                  style={{ backgroundColor: CAT_COLOR[a.categoryId] ?? '#3b82f6' }}
                >
                  {CAT_LABEL[a.categoryId] ?? a.categoryId}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: preview pane ── */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-8">
        {!selectedId && (
          <div className="text-center text-slate-500">
            <ImageIcon className="mx-auto mb-3 h-12 w-12 opacity-20" />
            <p className="text-sm">Sol listeden bir haber seçin</p>
            <p className="mt-1 text-xs opacity-60">
              Seçilen haber için Onyedi Tivi stilinde<br />
              1080×1080 sosyal medya görseli önizlemesi görünür
            </p>
          </div>
        )}

        {selected && (
          <>
            {/* Preview frame */}
            <div className="relative overflow-hidden rounded-2xl shadow-2xl shadow-black/60"
                 style={{ width: 400, height: 400 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ogUrl(selected.id)}
                alt={selected.title}
                className="h-full w-full object-cover"
                key={selected.id}
              />
              <div className="absolute inset-0 rounded-2xl ring-1 ring-white/10" />
            </div>

            {/* Title */}
            <div className="max-w-sm text-center">
              <p className="text-sm font-semibold text-white">{selected.title}</p>
              <span
                className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold text-white"
                style={{ backgroundColor: CAT_COLOR[selected.categoryId] ?? '#3b82f6' }}
              >
                {CAT_LABEL[selected.categoryId] ?? selected.categoryId}
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => void downloadImage(
                  ogUrl(selected.id),
                  `onyeditivi-${selected.slug || selected.id}.png`
                )}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                <Download className="h-4 w-4" />
                1080×1080 İndir
              </button>
              <a
                href={ogUrl(selected.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/15 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Tam boyut aç
              </a>
            </div>

            {/* Info chips */}
            <div className="flex gap-3 text-xs text-slate-500">
              <span>1080 × 1080 px</span>
              <span>·</span>
              <span>PNG</span>
              <span>·</span>
              <span>Onyedi Tivi brand</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

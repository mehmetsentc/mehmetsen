'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { auth } from '@/lib/firebase/auth'
import {
  Eye,
  RefreshCw,
  MapPin,
  Globe2,
  Flame,
  Newspaper,
  Sparkles,
  ExternalLink,
  ArrowUpRight,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  YEREL_HABER_CATEGORY_ID,
  getYerelSubcategories,
  getYerelSubcategoryShortLabel,
} from '@/constants/config'
import { ROUTES } from '@/constants/routes'

type Period = 'all' | '7d' | '30d' | '90d'
type Scope = 'all' | 'yerel' | 'national'

interface RankedCategory {
  id: string
  label: string
  views: number
  posts: number
  isYerel: boolean
  parentId: string | null
}

interface RankedPost {
  rank: number
  id: string
  title: string
  slug: string
  categoryId: string
  categoryLabel: string
  views: number
  citySlug: string | null
  isYerel: boolean
  coverUrl: string | null
  publishedAt: string | null
}

interface MostReadPayload {
  meta: {
    sampleSize: number
    scanned: number
    totalViews: number
    yerelViews: number
    nationalViews: number
    yerelSharePct: number
    period: Period
    scope: Scope
    category: string | null
    subcategory: string | null
    generatedAt: string
    note: string
  }
  insights: string[]
  topPosts: RankedPost[]
  categories: RankedCategory[]
  subcategories: RankedCategory[]
  yerelCategories: RankedCategory[]
  nationalCategories: RankedCategory[]
}

const PERIODS: { id: Period; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: '7d', label: '7 Gün' },
  { id: '30d', label: '30 Gün' },
  { id: '90d', label: '90 Gün' },
]

const SCOPES: { id: Scope; label: string; icon: React.ElementType }[] = [
  { id: 'all', label: 'Hepsi', icon: Layers },
  { id: 'yerel', label: 'Yerel', icon: MapPin },
  { id: 'national', label: 'Ulusal', icon: Globe2 },
]

const MAIN_CATEGORY_CHIPS: { id: string; label: string }[] = [
  { id: '', label: 'Tümü' },
  { id: 'gundem', label: 'Gündem' },
  { id: 'siyaset', label: 'Siyaset' },
  { id: 'dunya', label: 'Dünya' },
  { id: 'spor', label: 'Spor' },
  { id: 'ekonomi', label: 'Ekonomi' },
  { id: 'teknoloji', label: 'Teknoloji' },
  { id: 'saglik', label: 'Sağlık' },
  { id: YEREL_HABER_CATEGORY_ID, label: 'Yerel' },
]

function formatCount(n: number): string {
  return n.toLocaleString('tr-TR')
}

function BarMeter({
  value,
  max,
  tone = 'brand',
}: {
  value: number
  max: number
  tone?: 'brand' | 'yerel' | 'ink'
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          tone === 'brand' && 'bg-[rgb(var(--admin-brand))]',
          tone === 'yerel' && 'bg-emerald-500',
          tone === 'ink' && 'bg-slate-700 dark:bg-slate-200',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function RankBadge({ rank }: { rank: number }) {
  const hot = rank <= 3
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black tabular-nums',
        hot
          ? 'bg-[rgb(var(--admin-brand))] text-white shadow-sm'
          : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]',
      )}
    >
      {rank}
    </span>
  )
}

export default function MostReadPage() {
  const [data, setData] = useState<MostReadPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('all')
  const [scope, setScope] = useState<Scope>('all')
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState('')

  const yerelSubs = useMemo(() => getYerelSubcategories(), [])
  const isYerelSelected = category === YEREL_HABER_CATEGORY_ID || scope === 'yerel'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { ensureAuthReady } = await import('@/lib/firebase/auth')
      await ensureAuthReady()
      const token = await auth.currentUser?.getIdToken()
      if (!token) {
        setData(null)
        setError('Oturum gerekli')
        return
      }
      const params = new URLSearchParams({ period, scope, limit: '40' })
      if (category) params.set('category', category)
      if (subcategory) params.set('subcategory', subcategory)

      const res = await fetch(`/api/admin/most-read?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? `Yükleme başarısız (${res.status})`)
        setData(null)
        return
      }
      setData((await res.json()) as MostReadPayload)
    } catch (e) {
      console.error('[admin/most-read] load failed:', e)
      setError('En çok okunanlar yüklenemedi')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [period, scope, category, subcategory])

  useEffect(() => {
    void load()
  }, [load])

  const maxCatViews = data?.categories[0]?.views ?? 1
  const maxYerelViews = data?.yerelCategories[0]?.views ?? 1
  const maxPostViews = data?.topPosts[0]?.views ?? 1

  const selectCategory = (id: string) => {
    setCategory(id)
    setSubcategory('')
    if (id === YEREL_HABER_CATEGORY_ID) setScope('yerel')
    else if (id && scope === 'yerel') setScope('all')
  }

  return (
    <div className="flex flex-col">
      <CMSHeader
        title="En Çok Okunanlar"
        subtitle="Haber görüntülenmeleri · kategori ve yerel alt kategori kırılımı"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={ROUTES.ADMIN.ANALYTICS}
              className="hidden items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] sm:inline-flex"
            >
              Analitik
              <ArrowUpRight className="h-3 w-3" />
            </Link>
            <Link
              href={`${ROUTES.ADMIN.NEWS}?sort=views`}
              className="hidden items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] sm:inline-flex"
            >
              Haberler listesi
              <ExternalLink className="h-3 w-3" />
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              className="flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-1.5 text-xs text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            </button>
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[rgb(var(--admin-sidebar))] text-white shadow-xl">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                'radial-gradient(ellipse 80% 60% at 0% 0%, rgba(220,38,38,0.35), transparent 55%), radial-gradient(ellipse 70% 50% at 100% 100%, rgba(16,185,129,0.18), transparent 50%), linear-gradient(135deg, rgba(255,255,255,0.04), transparent 40%)',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(-12deg, transparent, transparent 12px, rgba(255,255,255,0.35) 12px, rgba(255,255,255,0.35) 13px)',
            }}
          />

          <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
                <Flame className="h-3 w-3 text-[rgb(var(--admin-brand))]" />
                Okunurluk panosu
              </p>
              <h1 className="max-w-xl text-3xl font-black tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.05]">
                En çok okunan haberler
              </h1>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/65">
                Gerçek <code className="rounded bg-white/10 px-1.5 py-0.5 text-[11px]">viewsCount</code>{' '}
                sayaçlarından kategori ve yerel alt kategori kırılımı. Tahmin değil — yayınlanan
                haberlerin sıralı özeti.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              {[
                {
                  label: 'Toplam görüntülenme',
                  value: formatCount(data?.meta.totalViews ?? 0),
                  icon: Eye,
                },
                {
                  label: 'Örneklem haber',
                  value: formatCount(data?.meta.sampleSize ?? 0),
                  icon: Newspaper,
                },
                {
                  label: 'Yerel payı',
                  value: `%${data?.meta.yerelSharePct ?? 0}`,
                  icon: MapPin,
                },
                {
                  label: 'Ulusal görüntülenme',
                  value: formatCount(data?.meta.nationalViews ?? 0),
                  icon: Globe2,
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                      {kpi.label}
                    </p>
                    <kpi.icon className="h-3.5 w-3.5 text-white/40" />
                  </div>
                  <p className="admin-kpi-value text-white">{loading ? '—' : kpi.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                  period === p.id
                    ? 'bg-[rgb(var(--admin-brand))] text-white shadow-sm'
                    : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]',
                )}
              >
                {p.label}
              </button>
            ))}
            <span className="mx-1 hidden h-4 w-px bg-[rgb(var(--color-border))] sm:block" />
            {SCOPES.map((s) => {
              const Icon = s.icon
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setScope(s.id)
                    if (s.id !== 'yerel' && category === YEREL_HABER_CATEGORY_ID) {
                      setCategory('')
                      setSubcategory('')
                    }
                    if (s.id === 'yerel') {
                      setCategory(YEREL_HABER_CATEGORY_ID)
                      setSubcategory('')
                    }
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                    scope === s.id
                      ? 'bg-[rgb(var(--color-text))] text-[rgb(var(--color-surface))]'
                      : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {s.label}
                </button>
              )
            })}
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {MAIN_CATEGORY_CHIPS.map((chip) => (
              <button
                key={chip.id || 'all'}
                type="button"
                onClick={() => selectCategory(chip.id)}
                className={cn(
                  'flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all',
                  category === chip.id
                    ? 'bg-[rgb(var(--color-text))] text-[rgb(var(--color-surface))] shadow-sm'
                    : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]',
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {isYerelSelected && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              <button
                type="button"
                onClick={() => setSubcategory('')}
                className={cn(
                  'flex-shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap transition-all',
                  !subcategory
                    ? 'bg-emerald-600 text-white'
                    : 'border border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
                )}
              >
                Tüm yerel alt
              </button>
              {yerelSubs.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSubcategory(sub.id === subcategory ? '' : sub.id)}
                  className={cn(
                    'flex-shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap transition-all',
                    subcategory === sub.id
                      ? 'bg-emerald-600 text-white'
                      : 'border border-emerald-500/30 text-emerald-700/80 hover:text-emerald-800 dark:text-emerald-300/80',
                  )}
                >
                  {getYerelSubcategoryShortLabel(sub)}
                </button>
              ))}
            </div>
          )}

          {data?.meta.note && (
            <p className="text-[11px] text-[rgb(var(--color-muted))]">{data.meta.note}</p>
          )}
        </section>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Insights */}
        {(loading || (data?.insights.length ?? 0) > 0) && (
          <section className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <h2 className="admin-section-title">Özet</h2>
              <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Kural tabanlı
              </span>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-4 animate-pulse rounded bg-[rgb(var(--color-surface))]" />
                ))}
              </div>
            ) : (
              <ul className="space-y-2">
                {data?.insights.map((line) => (
                  <li
                    key={line}
                    className="flex gap-2 text-sm leading-relaxed text-[rgb(var(--color-text))]"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--admin-brand))]" />
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          {/* Ranked posts */}
          <section className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
            <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-4">
              <div>
                <h2 className="admin-section-title">En çok görüntülenen haberler</h2>
                <p className="admin-meta mt-0.5">viewsCount · azalan sıra</p>
              </div>
              <Flame className="h-4 w-4 text-[rgb(var(--admin-brand))]" />
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-[rgb(var(--color-surface))]" />
                ))}
              </div>
            ) : !data?.topPosts.length ? (
              <p className="px-5 py-12 text-center text-sm text-[rgb(var(--color-muted))]">
                Bu filtrede haber yok
              </p>
            ) : (
              <ul className="divide-y divide-[rgb(var(--color-border))]">
                {data.topPosts.map((post) => (
                  <li key={post.id}>
                    <Link
                      href={ROUTES.ADMIN.NEWS_EDIT(post.id)}
                      className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[rgb(var(--color-surface))] sm:px-5"
                    >
                      <RankBadge rank={post.rank} />
                      {post.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.coverUrl}
                          alt=""
                          className="mt-0.5 h-12 w-16 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="mt-0.5 flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--color-surface))]">
                          <Newspaper className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-[rgb(var(--color-text))] group-hover:underline">
                          {post.title}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[rgb(var(--color-muted))]">
                          <span
                            className={cn(
                              'rounded-md px-1.5 py-0.5 font-medium',
                              post.isYerel
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : 'bg-[rgb(var(--color-surface))]',
                            )}
                          >
                            {post.categoryLabel}
                          </span>
                          <span className="font-bold tabular-nums text-[rgb(var(--color-text))]">
                            {formatCount(post.views)} görüntülenme
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <BarMeter value={post.views} max={maxPostViews} tone="brand" />
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Category breakdowns */}
          <div className="space-y-6">
            <section className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
              <div className="mb-4 flex items-center gap-2">
                <Layers className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                <h2 className="admin-section-title">Kategorilere göre</h2>
              </div>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-8 animate-pulse rounded bg-[rgb(var(--color-surface))]" />
                  ))}
                </div>
              ) : !data?.categories.length ? (
                <p className="py-8 text-center text-sm text-[rgb(var(--color-muted))]">Veri yok</p>
              ) : (
                <div className="space-y-3">
                  {data.categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => selectCategory(cat.id === YEREL_HABER_CATEGORY_ID ? YEREL_HABER_CATEGORY_ID : cat.id)}
                      className="flex w-full items-center gap-3 text-left"
                    >
                      <span className="w-28 shrink-0 truncate text-xs font-medium text-[rgb(var(--color-text))]">
                        {cat.label}
                      </span>
                      <BarMeter
                        value={cat.views}
                        max={maxCatViews}
                        tone={cat.isYerel ? 'yerel' : 'ink'}
                      />
                      <span className="w-14 shrink-0 text-right text-xs font-bold tabular-nums text-[rgb(var(--color-muted))]">
                        {formatCount(cat.views)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-[rgb(var(--color-card))] to-[rgb(var(--color-card))] p-5">
              <div className="mb-4 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-emerald-600" />
                <h2 className="admin-section-title">Yerel alt kategoriler</h2>
              </div>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-8 animate-pulse rounded bg-[rgb(var(--color-surface))]" />
                  ))}
                </div>
              ) : !data?.yerelCategories.length ? (
                <p className="py-8 text-center text-sm text-[rgb(var(--color-muted))]">
                  Yerel alt kategori verisi yok
                </p>
              ) : (
                <div className="space-y-3">
                  {data.yerelCategories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setScope('yerel')
                        setCategory(YEREL_HABER_CATEGORY_ID)
                        setSubcategory(cat.id)
                      }}
                      className="flex w-full items-center gap-3 text-left"
                    >
                      <span className="w-28 shrink-0 truncate text-xs font-medium text-[rgb(var(--color-text))]">
                        {cat.label.replace(/^Yerel · /, '')}
                      </span>
                      <BarMeter value={cat.views} max={maxYerelViews} tone="yerel" />
                      <span className="w-14 shrink-0 text-right text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                        {formatCount(cat.views)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {!!data?.subcategories.length && (
              <section className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Newspaper className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                  <h2 className="admin-section-title">Alt kategori detayı</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.subcategories.slice(0, 16).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        if (cat.isYerel) {
                          setScope('yerel')
                          setCategory(YEREL_HABER_CATEGORY_ID)
                          setSubcategory(cat.id)
                        } else {
                          setScope('all')
                          setCategory(cat.parentId ?? cat.id)
                          setSubcategory('')
                        }
                      }}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors',
                        cat.isYerel
                          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200'
                          : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))]',
                      )}
                    >
                      {cat.label.replace(/^Yerel · /, '')}
                      <span className="ml-1.5 tabular-nums opacity-60">{formatCount(cat.views)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

/**
 * LIBRARY-2 — Reels Studio «Kaydedilenler»: saved news videos with
 *   - filters: text, category, location (il), shared / not shared
 *   - sort: newest, video views, likes, comments, saves, shares (platform data)
 *   - per card: platform counts (video posts) and a «Tekrar paylaş» flow to
 *     further accounts (the shared ledger keeps one post per account and format;
 *     already-published accounts are shown as such and not selectable)
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bookmark, Eye, Film, Heart, Loader2, MessageCircle, Play, RefreshCw, Repeat2, Search, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { reelsCall } from './reelsApi'
import { ManualShareFlow } from './ManualShareFlow'
import { TikTokPostDialog } from './TikTokPostDialog'
import { formatCountTr, PLATFORM_TR, type EngagementMetricKey, type EngagementMetrics } from '@/lib/social/engagement/model'

type Engagement = {
  totals: EngagementMetrics
  video: EngagementMetrics
  platforms: Array<{ platform: 'facebook' | 'instagram' | 'threads' | 'youtube' | 'tiktok'; accountName: string | null; format: string; permalink: string | null; metrics: EngagementMetrics; state: string; missing: string[] }>
  updatedAt: number | null
}
type Item = {
  newsId: string
  slug: string | null
  headline: string
  url: string
  coverUrl: string | null
  seconds: number | null
  updatedAt: string | null
  renders: number
  categoryId: string | null
  categoryName: string | null
  citySlug: string | null
  cityName: string | null
  districtName: string | null
  newsStatus: string | null
  engagement: Engagement | null
}

type Sort = 'newest' | EngagementMetricKey
const SORTS: Array<[Sort, string]> = [
  ['newest', 'En yeni'],
  ['views', 'Görüntülenme'],
  ['likes', 'Beğeni'],
  ['comments', 'Yorum'],
  ['saves', 'Kaydetme'],
  ['shares', 'Paylaşım'],
]
const METRIC_ICON: Array<[EngagementMetricKey, typeof Eye, string]> = [
  ['views', Eye, 'görüntülenme'],
  ['likes', Heart, 'beğeni'],
  ['comments', MessageCircle, 'yorum'],
  ['saves', Bookmark, 'kaydetme'],
  ['shares', Repeat2, 'paylaşım'],
]

const sel = 'rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1 text-xs'

/** Video posts first; a news video shared only as a photo post still shows its totals. */
const metricsOf = (it: Item): EngagementMetrics => {
  const v = it.engagement?.video ?? {}
  return Object.keys(v).length ? v : it.engagement?.totals ?? {}
}

export function ReelLibraryPanel() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [share, setShare] = useState<{ item: Item; mode: 'reel' | 'video_story' } | null>(null)
  const [tiktok, setTiktok] = useState<Item | null>(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [city, setCity] = useState('')
  const [shared, setShared] = useState<'' | 'yes' | 'no'>('')
  const [sort, setSort] = useState<Sort>('newest')

  const load = useCallback(async () => {
    setError(null)
    const r = await reelsCall<{ items: Item[] }>('GET', '/api/admin/social/reels/library?limit=120')
    if (r.ok) setItems(r.data.items)
    else setError(r.error)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const cats = useMemo(() => [...new Map((items ?? []).filter((i) => i.categoryId).map((i) => [i.categoryId!, i.categoryName ?? i.categoryId!])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'tr')), [items])
  const cities = useMemo(() => [...new Map((items ?? []).filter((i) => i.citySlug).map((i) => [i.citySlug!, i.cityName ?? i.citySlug!])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'tr')), [items])

  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr')
    const out = (items ?? []).filter((i) => {
      if (needle && !i.headline.toLocaleLowerCase('tr').includes(needle)) return false
      if (cat && i.categoryId !== cat) return false
      if (city === '__none' ? !!i.citySlug : city && i.citySlug !== city) return false
      const isShared = (i.engagement?.platforms.length ?? 0) > 0
      if (shared === 'yes' && !isShared) return false
      if (shared === 'no' && isShared) return false
      return true
    })
    if (sort !== 'newest') out.sort((a, b) => (metricsOf(b)[sort] ?? -1) - (metricsOf(a)[sort] ?? -1))
    return out
  }, [items, q, cat, city, shared, sort])

  const sum = useMemo(() => {
    const s: EngagementMetrics = {}
    for (const i of list) for (const [k] of METRIC_ICON) {
      const v = metricsOf(i)[k]
      if (typeof v === 'number') s[k] = (s[k] ?? 0) + v
    }
    return s
  }, [list])

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm font-extrabold">Kaydedilen videolar</p>
        <span className="text-xs text-[rgb(var(--color-muted))]">Haber videoları; sosyal medya sayıları video paylaşımlarından okunur (7 gün boyunca güncellenir).</span>
        <button type="button" onClick={() => void load()} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1 text-xs font-bold">
          <RefreshCw className="h-3.5 w-3.5" /> Yenile
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2" role="search">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-[rgb(var(--color-muted))]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Başlıkta ara" className={cn(sel, 'w-48 pl-7')} aria-label="Başlıkta ara" />
        </label>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={sel} aria-label="Kategori">
          <option value="">Tüm kategoriler</option>
          {cats.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select value={city} onChange={(e) => setCity(e.target.value)} className={sel} aria-label="Konum">
          <option value="">Tüm konumlar</option>
          <option value="__none">İl bilgisi olmayanlar</option>
          {cities.map(([slug, name]) => (
            <option key={slug} value={slug}>
              {name}
            </option>
          ))}
        </select>
        <select value={shared} onChange={(e) => setShared(e.target.value as typeof shared)} className={sel} aria-label="Paylaşım durumu">
          <option value="">Paylaşılan + paylaşılmayan</option>
          <option value="yes">Sosyal medyada paylaşılanlar</option>
          <option value="no">Henüz paylaşılmayanlar</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={sel} aria-label="Sıralama">
          {SORTS.map(([k, l]) => (
            <option key={k} value={k}>
              Sırala: {l}
            </option>
          ))}
        </select>
        {q || cat || city || shared || sort !== 'newest' ? (
          <button type="button" onClick={() => (setQ(''), setCat(''), setCity(''), setShared(''), setSort('newest'))} className="text-xs underline">
            Temizle
          </button>
        ) : null}
        <span className="text-[11px] text-[rgb(var(--color-muted))]">
          {list.length} video
          {METRIC_ICON.filter(([k]) => typeof sum[k] === 'number').map(([k, , l]) => ` · ${formatCountTr(sum[k]!)} ${l}`).join('')}
        </span>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!items ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : list.length === 0 ? (
        <p className="text-sm text-[rgb(var(--color-muted))]">{items.length ? 'Filtrelere uyan video yok.' : 'Henüz kayıtlı video yok — «Tek haber» sekmesinden üretin.'}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {list.map((it) => {
            const m = metricsOf(it)
            const platforms = it.engagement?.platforms ?? []
            return (
              <div key={it.newsId} className="flex flex-col overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
                <div className="relative aspect-[9/16] bg-black">
                  {playing === it.newsId ? (
                    <video src={it.url} controls autoPlay playsInline className="h-full w-full object-contain" />
                  ) : (
                    <button type="button" onClick={() => setPlaying(it.newsId)} className="group h-full w-full" aria-label="Videoyu oynat">
                      {it.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <Film className="mx-auto h-8 w-8 text-white/60" />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                        <Play className="h-10 w-10 rounded-full bg-black/50 p-2 text-white" />
                      </span>
                    </button>
                  )}
                  {typeof m.views === 'number' ? (
                    <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white">
                      <Eye className="h-3 w-3" /> {formatCountTr(m.views)}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-2">
                  <p className="line-clamp-2 text-xs font-bold">{it.headline}</p>
                  <p className="text-[10px] text-[rgb(var(--color-muted))]">
                    {it.updatedAt ? new Date(it.updatedAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    {it.seconds ? ` · ${it.seconds.toFixed(0)} sn` : ''}
                    {it.renders > 1 ? ` · ${it.renders}. sürüm` : ''}
                  </p>
                  <p className="truncate text-[10px] text-[rgb(var(--color-muted))]">
                    {[it.categoryName, it.cityName, it.districtName].filter(Boolean).join(' · ') || 'kategori / konum yok'}
                  </p>
                  {Object.keys(m).length ? (
                    <p className="flex flex-wrap gap-x-2 text-[11px] font-semibold" aria-label="Sosyal medya etkileşimi">
                      {METRIC_ICON.filter(([k]) => typeof m[k] === 'number').map(([k, Icon, l]) => (
                        <span key={k} className="inline-flex items-center gap-0.5" title={l}>
                          <Icon className="h-3 w-3 text-[rgb(var(--color-muted))]" /> {formatCountTr(m[k]!)}
                        </span>
                      ))}
                    </p>
                  ) : (
                    <p className="text-[10px] text-[rgb(var(--color-muted))]">{platforms.length ? 'Sayılar ilk okumayı bekliyor' : 'Sosyal medyada paylaşılmadı'}</p>
                  )}
                  {platforms.length ? (
                    <details className="text-[10px]">
                      <summary className="cursor-pointer text-[rgb(var(--color-muted))]">{platforms.length} paylaşım</summary>
                      <ul className="mt-1 space-y-0.5">
                        {platforms.map((p, i) => (
                          <li key={i}>
                            {p.permalink ? (
                              <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="underline">
                                {PLATFORM_TR[p.platform]} {p.accountName ?? ''}
                              </a>
                            ) : (
                              `${PLATFORM_TR[p.platform]} ${p.accountName ?? ''}`
                            )}{' '}
                            · {p.format === 'reel' ? 'video' : p.format === 'video_story' ? 'hikâye' : 'gönderi'}
                            {Object.keys(p.metrics).length ? ` · ${METRIC_ICON.filter(([k]) => typeof p.metrics[k] === 'number').map(([k, , l]) => `${formatCountTr(p.metrics[k]!)} ${l}`).join(', ')}` : ''}
                            {p.missing.length ? ' · ek izin gerekir' : ''}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <div className="mt-auto flex flex-wrap gap-1 pt-1 text-[10px] font-bold">
                    <button type="button" onClick={() => setShare({ item: it, mode: 'reel' })} className="inline-flex items-center gap-0.5 rounded bg-red-600 px-1.5 py-0.5 text-white">
                      <Send className="h-3 w-3" /> {platforms.length ? 'Tekrar paylaş' : 'Paylaş'}
                    </button>
                    <button type="button" onClick={() => setTiktok(it)} className="rounded bg-black px-1.5 py-0.5 text-white">
                      TikTok
                    </button>
                    <a href={it.url} target="_blank" rel="noreferrer" className="rounded border border-[rgb(var(--color-border))] px-1.5 py-0.5">MP4</a>
                    {it.coverUrl ? <a href={it.coverUrl} target="_blank" rel="noreferrer" className="rounded border border-[rgb(var(--color-border))] px-1.5 py-0.5">Kapak</a> : null}
                    <a href={`/admin/news/${it.newsId}/edit`} className="rounded border border-[rgb(var(--color-border))] px-1.5 py-0.5">Haber</a>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {share ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Videoyu paylaş">
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-[rgb(var(--color-card))] p-4 shadow-xl">
            <div className="mb-2 flex items-start gap-2">
              <p className="flex-1 text-sm font-extrabold">{share.item.headline}</p>
              <button type="button" onClick={() => setShare(null)} aria-label="Kapat" className="rounded p-1 hover:bg-[rgb(var(--color-surface))]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-2 flex gap-1.5 text-xs">
              {(['reel', 'video_story'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setShare({ ...share, mode: f })} className={cn('rounded-full border px-3 py-1 font-bold', share.mode === f ? 'border-red-600 bg-red-600 text-white' : 'border-[rgb(var(--color-border))]')}>
                  {f === 'reel' ? 'Reels / video' : 'Video hikâye'}
                </button>
              ))}
            </div>
            <p className="mb-2 text-[11px] text-[rgb(var(--color-muted))]">
              Kayıtlı video yeniden üretilmeden kullanılır. Daha önce bu biçimde paylaşılan hesaplar «zaten paylaşıldı» olarak görünür; aynı hesaba ikinci kez gönderilmez.
            </p>
            <ManualShareFlow key={`${share.item.newsId}-${share.mode}`} newsId={share.item.newsId} newsTitle={share.item.headline} mode={share.mode} onClose={() => setShare(null)} onFinished={() => void load()} />
          </div>
        </div>
      ) : null}

      {tiktok ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="TikTok’ta paylaş">
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-[rgb(var(--color-card))] p-4 shadow-xl">
            <div className="mb-2 flex items-start gap-2">
              <p className="flex-1 text-sm font-extrabold">TikTok — {tiktok.headline}</p>
              <button type="button" onClick={() => setTiktok(null)} aria-label="Kapat" className="rounded p-1 hover:bg-[rgb(var(--color-surface))]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <TikTokPostDialog key={tiktok.newsId} newsId={tiktok.newsId} videoUrl={tiktok.url} coverUrl={tiktok.coverUrl} seconds={tiktok.seconds} onFinished={() => void load()} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

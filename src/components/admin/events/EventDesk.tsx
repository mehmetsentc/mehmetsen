'use client'

/**
 * EVENT-DESK-1 — Etkinlik Masası: bugünden sonraki bütün etkinlikler (il / tür / zaman / görselsiz filtresi,
 * tekrarlar birleşik, şüpheli tarihler ayrı) ve etkinlik stüdyosu (Haber · Medya · Bilgiler · Video).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { AlertTriangle, ImageOff, Loader2, Play, RefreshCw, Search, Sparkles, Trash2, Upload, Link2, Film, Star } from 'lucide-react'
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import { auth } from '@/lib/firebase/auth'
import { storage } from '@/lib/firebase/storage'
import { cn } from '@/lib/utils'
import { ReelsVideoPicker, type PickedVideo } from '@/components/admin/social/ReelsVideoPicker'
import {
  MEDIA_RIGHTS_LABEL,
  trDateParts,
  type DeskInfo,
  type DeskItem,
  type DeskMedia,
  type EventNewsDraft,
  type MediaRights,
  type SuspectItem,
} from '@/lib/events/eventDesk'

type DeskResponse = { items: DeskItem[]; suspects: SuspectItem[]; cities: Record<string, { name: string; count: number }>; total: number; now: number }
type NewsGen = {
  draft: EventNewsDraft
  news: { categoryId: string; citySlug: string; city: string; thumbnail: string | null; eventId: string }
  voice: { voice: string; rate: number; presenter: string; source: 'city' | 'event'; script: string }
}
type Tab = 'haber' | 'medya' | 'bilgi' | 'video'
type Range = 'week' | 'month' | 'quarter' | 'all'

const CATS = ['Tümü', 'Konser', 'Tiyatro', 'Festival', 'Parti', 'Sergi', 'Sinema', 'Diğer'] as const
const RANGES: Array<[Range, string, number]> = [
  ['week', 'Bu hafta', 7],
  ['month', 'Önümüzdeki 30 gün', 30],
  ['quarter', '3 ay', 92],
  ['all', 'Bugünden sonra · tümü', 100000],
]
const INFO_FIELDS: Array<[keyof DeskInfo, string, string]> = [
  ['endsAt', 'Bitiş saati', 'ör. 23.30'],
  ['doorsAt', 'Kapı açılış', 'ör. 20.00'],
  ['price', 'Bilet fiyatı', 'ör. 750 TL'],
  ['ageLimit', 'Yaş sınırı', 'ör. +18'],
  ['organizer', 'Organizatör', 'Organizatör adı'],
  ['venue', 'Mekân (düzeltme)', 'Kaynaktaki mekân yanlışsa'],
]

async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const user = auth.currentUser
  if (!user) throw new Error('Giriş yapmalısınız.')
  const token = await user.getIdToken()
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || `İstek başarısız (${res.status})`)
  return data
}

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
const chip = (on: boolean) =>
  cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold', on ? 'border-red-600 bg-red-600 text-white' : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]')

function mergedBadges(it: DeskItem): string[] {
  const out: string[] = []
  if (it.daily) out.push(`Her gün · ${it.daily.days} gün`)
  if (it.sources.length > 1) out.push(`${it.sources.length} kaynak birleşti`)
  if (it.possibleDuplicate) out.push('Olası tekrar · farklı mekân')
  return out
}

function playDataUrl(dataUrl: string, onEnd: () => void) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
  const audio = new Audio(url)
  const done = () => {
    URL.revokeObjectURL(url)
    onEnd()
  }
  audio.onended = done
  audio.onerror = done
  void audio.play().catch(done)
}

export function EventDesk() {
  const [data, setData] = useState<DeskResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [city, setCity] = useState('all')
  const [cat, setCat] = useState<(typeof CATS)[number]>('Tümü')
  const [range, setRange] = useState<Range>('all')
  const [noImg, setNoImg] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('haber')
  const [gen, setGen] = useState<Record<string, NewsGen>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api<DeskResponse>('/api/admin/events/desk'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Liste alınamadı')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    const off = auth.onAuthStateChanged((u) => {
      if (u) void load()
    })
    return () => off()
  }, [load])

  const now = data?.now ?? Date.now()
  const topCities = useMemo(
    () => Object.entries(data?.cities ?? {}).sort((a, b) => b[1].count - a[1].count),
    [data]
  )
  const inCity = useMemo(() => (data?.items ?? []).filter((i) => city === 'all' || i.citySlug === city), [data, city])
  const noImgCount = inCity.filter((i) => !i.hasImage).length
  const list = useMemo(() => {
    const days = RANGES.find((r) => r[0] === range)![2]
    const until = now + days * 86400_000
    const s = q.trim().toLocaleLowerCase('tr-TR')
    return inCity.filter(
      (i) =>
        (cat === 'Tümü' || i.categoryLabel === cat) &&
        (!noImg || !i.hasImage) &&
        Date.parse(i.startsAt) <= until &&
        (!s || `${i.title} ${i.venues.join(' ')}`.toLocaleLowerCase('tr-TR').includes(s))
    )
  }, [inCity, cat, noImg, range, q, now])
  const groups = useMemo(() => {
    const out: Array<{ label: string; items: DeskItem[] }> = []
    for (const it of list) {
      const label = trDateParts(it.startsAt, now).date
      const g = out.find((x) => x.label === label)
      if (g) g.items.push(it)
      else out.push({ label, items: [it] })
    }
    return out
  }, [list, now])
  const item = (data?.items ?? []).find((i) => i.id === sel) ?? null

  const replaceItem = (next: DeskItem | null) => {
    if (!next) return
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === next.id ? next : i)) } : d))
  }
  const saveDesk = async (eventId: string, patch: Record<string, unknown>, okText?: string) => {
    const r = await api<{ item: DeskItem | null }>('/api/admin/events/desk', { method: 'POST', body: { eventId, ...patch } })
    replaceItem(r.item)
    if (okText) toast.success(okText)
    return r.item
  }

  const generate = async (it: DeskItem) => {
    setSel(it.id)
    setTab('haber')
    setBusy(`gen:${it.id}`)
    try {
      const r = await api<NewsGen>('/api/admin/events/desk/news', { method: 'POST', body: { eventId: it.id } })
      setGen((g) => ({ ...g, [it.id]: r }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Haber üretilemedi')
    } finally {
      setBusy(null)
    }
  }

  const sync = async () => {
    setSyncing(true)
    try {
      await api('/api/events/sync', { method: 'POST' })
      toast.success('Senkron tamamlandı')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Senkron başarısız')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-[rgb(var(--color-muted))]">
          {data ? `${data.total} yaklaşan etkinlik · kaynaklar birleştirildi` : 'Yükleniyor…'}
        </p>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => void sync()} disabled={syncing} className="inline-flex h-9 items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold disabled:opacity-50">
            <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} /> Şimdi senkronize et
          </button>
          <Link href="/admin/events?eski=1" className="inline-flex h-9 items-center rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold">
            Etkinlik ekle / eski liste
          </Link>
        </div>
      </div>

      <section className="space-y-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">İl</span>
          <button type="button" onClick={() => setCity('all')} className={chip(city === 'all')}>
            Tüm iller <span className="text-[11px] font-bold opacity-80">{data?.total ?? 0}</span>
          </button>
          {topCities.slice(0, 7).map(([slug, c]) => (
            <button key={slug} type="button" onClick={() => setCity(slug)} className={chip(city === slug)}>
              {c.name} <span className="text-[11px] font-bold opacity-80">{c.count}</span>
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-[rgb(var(--color-muted))]">Diğer iller</span>
            <select value={topCities.slice(0, 7).some(([s]) => s === city) || city === 'all' ? '' : city} onChange={(e) => e.target.value && setCity(e.target.value)} className="h-8 rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 text-sm">
              <option value="">İl seçin…</option>
              {topCities.map(([slug, c]) => (
                <option key={slug} value={slug}>{c.name} ({c.count})</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[rgb(var(--color-border))] pt-3">
          <div className="inline-flex rounded-xl bg-[rgb(var(--color-surface))] p-0.5">
            {RANGES.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setRange(id)} className={cn('h-8 rounded-lg px-3 text-[13px]', range === id ? 'bg-[rgb(var(--color-card))] font-bold shadow-sm' : 'text-[rgb(var(--color-muted))]')}>
                {label}
              </button>
            ))}
          </div>
          {CATS.map((k) => (
            <button key={k} type="button" onClick={() => setCat(k)} className={cn('h-8 rounded-full border px-3 text-[13px] font-semibold', cat === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-[rgb(var(--color-border))]')}>
              {k}
            </button>
          ))}
          <button type="button" onClick={() => setNoImg((x) => !x)} className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold', noImg ? 'border-amber-600 bg-amber-500 text-white' : 'border-amber-300 bg-amber-50 text-amber-900')}>
            <ImageOff className="h-3.5 w-3.5" /> Görseli olmayanlar <b>{noImgCount}</b>
          </button>
          <label className="ml-auto flex h-9 min-w-[220px] items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] px-2.5">
            <Search className="h-4 w-4 text-[rgb(var(--color-muted))]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sanatçı, etkinlik, mekân" aria-label="Etkinlik ara" className="flex-1 bg-transparent text-sm outline-none" />
          </label>
        </div>
      </section>

      {data && data.suspects.length ? (
        <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span><b>{data.suspects.length} etkinliğin tarihi şüpheli</b> (bugünden 2 yıldan sonra). Listede gösterilmiyor; sağ alttan düzeltebilir ya da gizleyebilirsiniz.</span>
        </div>
      ) : null}
      {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3 text-sm text-[rgb(var(--color-muted))]">
            <b className="text-base text-[rgb(var(--color-text))]">{city === 'all' ? 'Tüm iller' : data?.cities[city]?.name ?? city}</b>
            <span>{list.length} etkinlik · tarihe göre</span>
            <span className="ml-auto">İptal edilenler gizli</span>
          </div>
          {loading && !data ? (
            <p className="flex items-center gap-2 p-6 text-sm text-[rgb(var(--color-muted))]"><Loader2 className="h-4 w-4 animate-spin" /> Etkinlikler yükleniyor…</p>
          ) : null}
          {data && !groups.length ? <p className="p-6 text-sm text-[rgb(var(--color-muted))]">Bu filtrelerde etkinlik yok.</p> : null}
          {groups.map((g) => (
            <div key={g.label}>
              <div className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-[rgb(var(--color-muted))]">{g.label}</div>
              {g.items.map((it) => {
                const p = trDateParts(it.startsAt, now)
                const has = !!gen[it.id] || !!it.desk.newsId
                return (
                  <div key={it.id} className={cn('flex items-center gap-3 border-b border-[rgb(var(--color-border))] px-4 py-3', sel === it.id && 'bg-red-50 shadow-[inset_3px_0_0_#dc2626] dark:bg-red-950/30')}>
                    {it.coverUrl ? (
                      <button type="button" onClick={() => { setSel(it.id); setTab('medya') }} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-200" aria-label={`${it.title} görselleri`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={it.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      </button>
                    ) : (
                      <button type="button" onClick={() => { setSel(it.id); setTab('medya') }} className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border-[1.5px] border-dashed border-amber-500 bg-amber-50 text-[11px] font-extrabold text-amber-900">
                        <ImageOff className="h-5 w-5 text-amber-600" />Görsel yok<span className="font-semibold text-amber-700">+ Ekle</span>
                      </button>
                    )}
                    <div className="w-14 shrink-0 rounded-xl border border-[rgb(var(--color-border))] py-1.5 text-center">
                      <div className="text-xl font-extrabold leading-none">{p.day}</div>
                      <div className="text-[11px] font-bold text-red-600">{p.mon}</div>
                    </div>
                    <button type="button" onClick={() => setSel(it.id)} className="min-w-0 flex-1 space-y-1 text-left">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[15px] font-bold">{it.title}</span>
                        <span className="rounded-full bg-[rgb(var(--color-surface))] px-2 py-0.5 text-[11px] font-bold">{it.categoryLabel}</span>
                        {mergedBadges(it).map((b) => (
                          <span key={b} className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">{b}</span>
                        ))}
                      </div>
                      <div className="truncate text-[13px] text-[rgb(var(--color-muted))]">{p.time} · {it.city} · {it.desk.info.venue || it.venues.join(' / ')}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {it.sources.map((s) => (
                          <span key={s} className="rounded-md border border-[rgb(var(--color-border))] px-1.5 text-[11px] font-semibold text-[rgb(var(--color-muted))]">{s}</span>
                        ))}
                      </div>
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => (has ? (setSel(it.id), setTab('haber')) : void generate(it))}
                        disabled={busy === `gen:${it.id}`}
                        className={cn('inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[13px] font-extrabold disabled:opacity-60', has ? 'border border-[rgb(var(--color-border))]' : 'bg-red-600 text-white')}
                      >
                        {busy === `gen:${it.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {has ? 'Haberi aç' : 'AI ile haber'}
                      </button>
                      <span className={cn('text-xs', it.desk.newsId ? 'text-green-700' : 'text-[rgb(var(--color-muted))]')}>
                        {it.desk.newsId ? 'Haber oluşturuldu' : gen[it.id] ? 'Taslak hazır' : 'Haber yok'}
                      </span>
                      <span className="text-[11px] text-[rgb(var(--color-muted))]">bilgi %{it.completeness.percent}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex w-full min-w-0 max-w-[600px] flex-[1_1_440px] flex-col gap-3">
          {item ? (
            <EventStudio
              key={item.id}
              item={item}
              now={now}
              tab={tab}
              setTab={setTab}
              gen={gen[item.id] ?? null}
              generating={busy === `gen:${item.id}`}
              onGenerate={() => void generate(item)}
              onSave={saveDesk}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-[rgb(var(--color-border))] px-5 py-8 text-center text-sm text-[rgb(var(--color-muted))]">
              Soldan bir etkinlikte <b>AI ile haber</b>&apos;e basın ya da etkinliği seçin. Haber, medya, eksik bilgiler ve video burada hazırlanır.
            </div>
          )}
          {data && data.suspects.length ? <SuspectList suspects={data.suspects} onSave={async (id, patch) => { await saveDesk(id, patch); await load() }} /> : null}
        </div>
      </div>
    </div>
  )
}

function SuspectList({ suspects, onSave }: { suspects: SuspectItem[]; onSave: (id: string, patch: Record<string, unknown>) => Promise<void> }) {
  const [edit, setEdit] = useState<string | null>(null)
  const [val, setVal] = useState('')
  return (
    <section className="space-y-2 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
      <b className="text-sm">Tarihi şüpheli kayıtlar</b>
      {suspects.slice(0, 30).map((s) => (
        <div key={s.id} className="flex flex-wrap items-center gap-2 border-t border-[rgb(var(--color-border))] pt-2 text-[13px]">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{s.title}</div>
            <div className="text-[rgb(var(--color-muted))]">{s.city} · {s.source} · <b className="text-orange-700">{new Date(s.startsAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' })}</b></div>
          </div>
          {edit === s.id ? (
            <>
              <input type="datetime-local" value={val} onChange={(e) => setVal(e.target.value)} className="h-8 rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 text-xs" aria-label="Doğru tarih" />
              <button type="button" disabled={!val} onClick={() => void onSave(s.id, { startsAtOverride: new Date(val).toISOString() }).then(() => setEdit(null)).catch((e: Error) => toast.error(e.message))} className="h-8 rounded-lg bg-slate-900 px-2.5 text-xs font-bold text-white disabled:opacity-40">Kaydet</button>
            </>
          ) : (
            <button type="button" onClick={() => { setEdit(s.id); setVal('') }} className="h-8 rounded-lg border border-[rgb(var(--color-border))] px-2.5 text-xs font-semibold">Tarihi düzelt</button>
          )}
          <button type="button" onClick={() => void onSave(s.id, { hidden: true }).catch((e: Error) => toast.error(e.message))} className="h-8 rounded-lg bg-[rgb(var(--color-surface))] px-2.5 text-xs font-semibold">Gizle</button>
        </div>
      ))}
    </section>
  )
}

export function EventStudio({
  item,
  now,
  tab,
  setTab,
  gen,
  generating,
  onGenerate,
  onSave,
}: {
  item: DeskItem
  now: number
  tab: Tab
  setTab: (t: Tab) => void
  gen: NewsGen | null
  generating: boolean
  onGenerate: () => void
  onSave: (eventId: string, patch: Record<string, unknown>, okText?: string) => Promise<DeskItem | null>
}) {
  const missing = item.completeness.missing.filter((m) => m !== 'Görsel').length
  const mediaCount = item.desk.media.length + (item.coverUrl && !item.desk.coverUrl ? 1 : 0)
  const tabs: Array<[Tab, string]> = [
    ['haber', 'Haber'],
    ['medya', `Medya · ${mediaCount}`],
    ['bilgi', missing ? `Bilgiler · ${missing} eksik` : 'Bilgiler'],
    ['video', 'Video'],
  ]
  return (
    <section className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <div className="flex items-center gap-2 px-4 pt-3">
        <Sparkles className="h-4 w-4 text-red-600" />
        <b className="text-sm">Etkinlik stüdyosu</b>
        <span className="ml-auto max-w-[60%] truncate text-xs text-[rgb(var(--color-muted))]">{item.title} · {item.city}</span>
      </div>
      <div className="flex gap-1 border-b border-[rgb(var(--color-border))] px-3 pt-2">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={cn('h-9 px-3 text-[13px] font-bold', tab === id ? 'text-red-600 shadow-[inset_0_-2px_0_#dc2626]' : 'text-[rgb(var(--color-muted))]')}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'haber' ? <NewsTab item={item} now={now} gen={gen} generating={generating} onGenerate={onGenerate} onSave={onSave} /> : null}
      {tab === 'medya' ? <MediaTab item={item} onSave={onSave} /> : null}
      {tab === 'bilgi' ? <InfoTab item={item} onSave={onSave} onRegenerate={() => { setTab('haber'); onGenerate() }} /> : null}
      {tab === 'video' ? <VideoTab item={item} now={now} gen={gen} /> : null}
    </section>
  )
}

function VoiceButton({ eventId, label }: { eventId: string; label: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const play = async () => {
    setState('loading')
    try {
      const r = await api<{ audio: string }>('/api/admin/events/desk/voice', { method: 'POST', body: { eventId } })
      setState('playing')
      playDataUrl(r.audio, () => setState('idle'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Seslendirme üretilemedi')
      setState('idle')
    }
  }
  return (
    <button type="button" onClick={() => void play()} disabled={state !== 'idle'} aria-label={label} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-600 text-white disabled:opacity-60">
      {state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
    </button>
  )
}

function NewsTab({ item, now, gen, generating, onGenerate, onSave }: { item: DeskItem; now: number; gen: NewsGen | null; generating: boolean; onGenerate: () => void; onSave: (eventId: string, patch: Record<string, unknown>, okText?: string) => Promise<DeskItem | null> }) {
  const [draft, setDraft] = useState<EventNewsDraft | null>(gen?.draft ?? null)
  const [saving, setSaving] = useState(false)
  const reqId = useRef(`ev-${rid()}`.slice(0, 40))
  useEffect(() => {
    setDraft(gen?.draft ?? null)
    reqId.current = `ev-${rid()}`.slice(0, 40)
  }, [gen])
  const p = trDateParts(item.startsAt, now)

  const create = async () => {
    if (!gen || !draft) return
    setSaving(true)
    try {
      const r = await api<{ id: string }>('/api/admin/news', {
        method: 'POST',
        body: {
          createRequestId: reqId.current,
          title: draft.title,
          spot: draft.spot,
          summary: draft.summary,
          content: draft.content,
          seoTitle: draft.seoTitle,
          seoDescription: draft.seoDescription,
          tags: draft.tags,
          socialCaption: draft.socialCaption,
          categoryId: gen.news.categoryId,
          citySlug: gen.news.citySlug,
          city: gen.news.city,
          thumbnail: item.coverUrl ?? '',
          status: 'draft',
          sourceLabel: 'NaHaber Etkinlik',
        },
      })
      await onSave(item.id, { newsId: r.id, newsStatus: 'draft' }, 'Haber taslak olarak oluşturuldu')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Haber oluşturulamadı')
    } finally {
      setSaving(false)
    }
  }

  if (item.desk.newsId && !gen) {
    return (
      <div className="space-y-3 p-4 text-sm">
        <p>Bu etkinliğin haberi oluşturuldu ({item.desk.newsStatus === 'draft' ? 'taslak' : item.desk.newsStatus ?? 'kayıtlı'}).</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/news/${item.desk.newsId}/edit`} className="inline-flex h-10 items-center rounded-xl bg-red-600 px-4 font-extrabold text-white">Haberi aç ve yayınla</Link>
          <button type="button" onClick={onGenerate} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-4 font-bold"><Sparkles className="h-4 w-4" /> Yeniden yaz</button>
        </div>
      </div>
    )
  }
  if (!draft) {
    return (
      <div className="space-y-3 p-4 text-sm">
        <p className="text-[rgb(var(--color-muted))]">AI, yalnızca etkinliğin kaynak bilgisini ve Bilgiler sekmesine eklediklerinizi kullanır. Eksik bilgileri önce tamamlarsanız haber daha dolu olur.</p>
        <button type="button" onClick={onGenerate} disabled={generating} className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 font-extrabold text-white disabled:opacity-60">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {generating ? 'Haber hazırlanıyor…' : 'AI ile etkinlik haberi oluştur'}
        </button>
      </div>
    )
  }
  const field = 'w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2.5 py-2 text-sm'
  return (
    <div className="space-y-3 p-4">
      <div className="relative flex h-36 items-end overflow-hidden rounded-xl bg-slate-900 p-3">
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-xs text-slate-300">Görsel yok · Medya sekmesinden ekleyin</span>
        )}
        <span className="relative rounded-md bg-red-600 px-2 py-1 text-xs font-extrabold text-white">#{item.city} · {item.categoryLabel}</span>
      </div>
      <label className="block space-y-1"><span className="text-[11px] font-bold uppercase text-[rgb(var(--color-muted))]">Başlık</span>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={cn(field, 'font-bold')} /></label>
      <label className="block space-y-1"><span className="text-[11px] font-bold uppercase text-[rgb(var(--color-muted))]">Spot</span>
        <textarea rows={3} value={draft.spot} onChange={(e) => setDraft({ ...draft, spot: e.target.value })} className={field} /></label>
      <div className="grid grid-cols-2 gap-2 text-[13px]">
        <div className="rounded-lg border border-[rgb(var(--color-border))] p-2"><div className="text-[11px] font-bold uppercase text-[rgb(var(--color-muted))]">Yer</div>{item.desk.info.venue || item.venues.join(' / ')}</div>
        <div className="rounded-lg border border-[rgb(var(--color-border))] p-2"><div className="text-[11px] font-bold uppercase text-[rgb(var(--color-muted))]">Tarih ve saat</div>{p.date} · {p.time}</div>
        <div className="rounded-lg border border-[rgb(var(--color-border))] p-2"><div className="text-[11px] font-bold uppercase text-[rgb(var(--color-muted))]">Şehir etiketi</div>#{item.city}</div>
        <div className="rounded-lg border border-[rgb(var(--color-border))] p-2"><div className="text-[11px] font-bold uppercase text-[rgb(var(--color-muted))]">Bilet</div>{item.desk.info.price || item.sources.filter((s) => s !== 'NaHaber').join(', ') || 'Bilgi yok'}</div>
      </div>
      <label className="block space-y-1"><span className="text-[11px] font-bold uppercase text-[rgb(var(--color-muted))]">Haber metni (etkinlik bilgileri ve etkinlik hakkında)</span>
        <textarea rows={9} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} className={cn(field, 'font-mono text-[13px]')} /></label>
      {gen ? (
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
          <div className="flex items-center gap-3">
            <VoiceButton eventId={item.id} label="Etkinlik seslendirmesini dinle" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold">Etkinlik seslendirmesi · {gen.voice.presenter}</div>
              <div className="text-xs text-[rgb(var(--color-muted))]">{gen.voice.source === 'city' ? `${item.city} sunucusu` : 'Etkinlik sunucusu, sıcak ton'} · seslendirme kotasından düşer</div>
            </div>
          </div>
          <p className="text-[13px] italic">“{gen.voice.script}”</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void create()} disabled={saving} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 font-extrabold text-white disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Haberi taslak olarak oluştur
        </button>
        <button type="button" onClick={onGenerate} disabled={generating} className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-4 font-bold disabled:opacity-60">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Yeniden yaz
        </button>
      </div>
      <p className="text-xs text-[rgb(var(--color-muted))]">Taslak haber CMS&apos;te açılır; yayınlama, görsel hakkı ve il kapsamı kontrolleri orada her zamanki gibi yapılır.</p>
    </div>
  )
}

function linkKind(url: string): 'image' | 'video' {
  return /\.(mp4|mov|webm|m3u8)(\?|$)|youtube\.com|youtu\.be|instagram\.com\/(reel|p|tv)\//i.test(url) ? 'video' : 'image'
}

function MediaTab({ item, onSave }: { item: DeskItem; onSave: (eventId: string, patch: Record<string, unknown>, okText?: string) => Promise<DeskItem | null> }) {
  const [media, setMedia] = useState<DeskMedia[]>(item.desk.media)
  const [cover, setCover] = useState<string | null>(item.desk.coverUrl)
  const [link, setLink] = useState('')
  const [picker, setPicker] = useState(false)
  const [picked, setPicked] = useState<PickedVideo | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dirty = JSON.stringify(media) !== JSON.stringify(item.desk.media) || cover !== item.desk.coverUrl
  const sourceCover = item.coverUrl && item.coverUrl !== item.desk.coverUrl && !item.desk.media.some((m) => m.url === item.coverUrl) ? item.coverUrl : null
  const shownCover = cover ?? sourceCover ?? media.find((m) => m.kind === 'image')?.url ?? null

  const add = (m: Omit<DeskMedia, 'id' | 'addedAt' | 'addedBy'>) => setMedia((list) => [...list, { ...m, id: rid().slice(0, 16), addedAt: Date.now(), addedBy: null }])

  const upload = async (files: FileList | null) => {
    const uid = auth.currentUser?.uid
    if (!files || !uid) return
    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith('video/')
      if (!isVideo && !file.type.startsWith('image/')) { toast.error(`${file.name}: görsel ya da video değil`); continue }
      if (file.size > (isVideo ? 200 : 20) * 1024 * 1024) { toast.error(`${file.name}: ${isVideo ? '200' : '20'} MB sınırını aşıyor`); continue }
      const name = `${Date.now()}_${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`.slice(0, 120)
      const path = `${isVideo ? 'news-videos' : 'news-images'}/${uid}/events/${item.id.replace(/[^A-Za-z0-9_-]/g, '_')}/${name}`
      setUploading(file.name)
      try {
        const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type })
        await new Promise<void>((resolve, reject) => task.on('state_changed', undefined, reject, () => resolve()))
        const url = await getDownloadURL(task.snapshot.ref)
        add({ kind: isVideo ? 'video' : 'image', url, libraryId: null, title: file.name, poster: null, source: 'upload', rights: 'own' })
      } catch (e) {
        toast.error(`${file.name}: yüklenemedi (${e instanceof Error ? e.message.slice(0, 60) : 'hata'})`)
      } finally {
        setUploading(null)
      }
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await onSave(item.id, { media, coverUrl: cover }, 'Medya kaydedildi')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 p-4">
      <div className="relative flex h-48 flex-col justify-between overflow-hidden rounded-xl bg-slate-900 p-3">
        {shownCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shownCover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-sm text-amber-200">Bu etkinliğin görseli yok</span>
        )}
        <span className="relative self-start rounded-md bg-white px-2 py-0.5 text-[11px] font-extrabold text-slate-900">KAPAK</span>
        <span className="relative self-start rounded bg-black/50 px-1.5 text-[11px] text-white">{cover ? 'Editörün seçtiği kapak' : sourceCover ? `Kaynak görseli · ${item.sources[0]}` : ''}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {sourceCover ? (
          <div className="relative aspect-square overflow-hidden rounded-lg bg-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sourceCover} alt="" className="h-full w-full object-cover" />
            <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[10px] font-bold text-white">Kaynak</span>
          </div>
        ) : null}
        {media.map((m) => (
          <div key={m.id} className="group relative aspect-square overflow-hidden rounded-lg bg-slate-800">
            {m.kind === 'image' && m.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 p-1 text-center text-[10px] font-bold text-white">
                <Film className="h-5 w-5" />{m.title || (m.source === 'library' ? 'Kütüphane videosu' : 'Video')}
              </div>
            )}
            <div className="absolute inset-x-1 bottom-1 flex gap-1">
              {m.kind === 'image' && m.url ? (
                <button type="button" onClick={() => setCover(m.url)} title="Kapak yap" aria-label="Kapak yap" className={cn('grid h-6 w-6 place-items-center rounded bg-black/60 text-white', cover === m.url && 'bg-red-600')}><Star className="h-3.5 w-3.5" /></button>
              ) : null}
              <select value={m.rights} onChange={(e) => setMedia((l) => l.map((x) => (x.id === m.id ? { ...x, rights: e.target.value as MediaRights } : x)))} aria-label="Kullanım hakkı" className="h-6 min-w-0 flex-1 rounded bg-black/60 text-[10px] text-white">
                {(Object.keys(MEDIA_RIGHTS_LABEL) as MediaRights[]).map((r) => <option key={r} value={r}>{MEDIA_RIGHTS_LABEL[r].split(' (')[0].split(' ·')[0]}</option>)}
              </select>
              <button type="button" onClick={() => { setMedia((l) => l.filter((x) => x.id !== m.id)); if (cover === m.url) setCover(null) }} aria-label="Kaldır" className="grid h-6 w-6 place-items-center rounded bg-black/60 text-white"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => fileRef.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-[1.5px] border-dashed border-slate-400 text-[11px] font-bold">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="text-2xl leading-none">+</span>}{uploading ? 'Yükleniyor' : 'Ekle'}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = '' }} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-[13px] font-bold"><Upload className="h-4 w-4" /> Bilgisayardan yükle</button>
        <button type="button" onClick={() => setPicker((x) => !x)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-[13px] font-bold"><Film className="h-4 w-4" /> Video Kütüphanesi&apos;nden seç</button>
      </div>
      {picker ? (
        <div className="space-y-2 rounded-xl border border-[rgb(var(--color-border))] p-2">
          <ReelsVideoPicker value={picked} onChange={setPicked} />
          <button type="button" disabled={!picked} onClick={() => { if (picked) { add({ kind: 'video', url: null, libraryId: picked.id, title: picked.title, poster: picked.poster && picked.poster.startsWith('https://') ? picked.poster : null, source: 'library', rights: 'own' }); setPicked(null); setPicker(false) } }} className="h-9 rounded-lg bg-slate-900 px-3 text-[13px] font-bold text-white disabled:opacity-40">Seçili videoyu ekle</button>
        </div>
      ) : null}
      <div className="flex gap-2">
        <label className="flex h-9 flex-1 items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] px-2.5">
          <Link2 className="h-4 w-4 text-[rgb(var(--color-muted))]" />
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Bağlantı: görsel, video, YouTube ya da Instagram (https)" aria-label="Medya bağlantısı" className="flex-1 bg-transparent text-[13px] outline-none" />
        </label>
        <button type="button" disabled={!/^https:\/\//.test(link.trim())} onClick={() => { add({ kind: linkKind(link.trim()), url: link.trim(), libraryId: null, title: null, poster: null, source: 'link', rights: 'unknown' }); setLink('') }} className="h-9 rounded-xl border border-[rgb(var(--color-border))] px-3 text-[13px] font-bold disabled:opacity-40">Ekle</button>
      </div>
      <p className="text-xs text-[rgb(var(--color-muted))]">Kullanım hakkı «Bilinmiyor» olan medya sosyal paylaşımda kullanılmaz. Bağlantıyla eklenen medyanın hakkını mutlaka seçin.</p>
      <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="h-10 w-full rounded-xl bg-slate-900 text-sm font-extrabold text-white disabled:opacity-40">
        {saving ? 'Kaydediliyor…' : 'Medyayı kaydet'}
      </button>
    </div>
  )
}

function InfoTab({ item, onSave, onRegenerate }: { item: DeskItem; onSave: (eventId: string, patch: Record<string, unknown>, okText?: string) => Promise<DeskItem | null>; onRegenerate: () => void }) {
  const [info, setInfo] = useState<DeskInfo>(item.desk.info)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(info) !== JSON.stringify(item.desk.info)
  const base: Partial<Record<keyof DeskInfo, string | null>> = { endsAt: item.endsAt ? new Date(item.endsAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }) : null, organizer: item.organizer, venue: item.venues.join(' / ') }
  const save = async (regen: boolean) => {
    setSaving(true)
    try {
      await onSave(item.id, { info }, 'Bilgiler kaydedildi')
      if (regen) onRegenerate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }
  const pct = item.completeness.percent
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2 text-[13px]">
        <span className="font-bold">Bilgi doluluğu</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[rgb(var(--color-surface))]"><div className={cn('h-full', pct >= 75 ? 'bg-green-600' : 'bg-amber-500')} style={{ width: `${pct}%` }} /></div>
        <b className={pct >= 75 ? 'text-green-700' : 'text-amber-700'}>%{pct}</b>
      </div>
      {item.completeness.missing.length ? <p className="text-xs text-amber-800">Eksik: {item.completeness.missing.join(', ')}</p> : null}
      <div className="grid grid-cols-2 gap-2.5">
        {INFO_FIELDS.map(([k, label, ph]) => {
          const missing = !info[k] && !base[k] && k !== 'venue'
          return (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase text-[rgb(var(--color-muted))]">{label}{missing ? <b className="ml-1 text-amber-700">eksik</b> : null}</span>
              <input value={info[k] ?? ''} placeholder={base[k] || ph} onChange={(e) => setInfo({ ...info, [k]: e.target.value || null })} className={cn('h-9 rounded-lg border px-2.5 text-sm', missing ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : 'border-[rgb(var(--color-border))] bg-transparent')} />
            </label>
          )
        })}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold uppercase text-[rgb(var(--color-muted))]">Sanatçı ve etkinlik notu</span>
        <textarea rows={4} value={info.note ?? ''} onChange={(e) => setInfo({ ...info, note: e.target.value || null })} placeholder="Program, konuk sanatçı, yeni albüm, turne bilgisi… AI haberde yalnızca buraya ve kaynağa yazılanları kullanır." className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2.5 py-2 text-sm" />
      </label>
      {item.description ? <details className="text-xs text-[rgb(var(--color-muted))]"><summary className="cursor-pointer font-semibold">Kaynaktaki açıklama</summary><p className="mt-1 whitespace-pre-line">{item.description.slice(0, 1500)}</p></details> : null}
      <div className="flex gap-2">
        <button type="button" disabled={!dirty || saving} onClick={() => void save(false)} className="h-10 flex-1 rounded-xl border border-[rgb(var(--color-border))] text-sm font-bold disabled:opacity-40">Kaydet</button>
        <button type="button" disabled={saving} onClick={() => void save(true)} className="h-10 flex-1 rounded-xl bg-slate-900 text-sm font-extrabold text-white disabled:opacity-40">Kaydet ve haberi yeniden yaz</button>
      </div>
    </div>
  )
}

function VideoTab({ item, now, gen }: { item: DeskItem; now: number; gen: NewsGen | null }) {
  const p = trDateParts(item.startsAt, now)
  const video = item.desk.media.find((m) => m.kind === 'video' && m.rights !== 'unknown')
  const images = item.desk.media.filter((m) => m.kind === 'image' && m.rights !== 'unknown')
  const scenes: Array<[string, string, string]> = [
    ['Açılış · şehir etiketi', `NaHaber ${item.city} etkinlik rehberi`, '0:03'],
    ['Sanatçı / etkinlik', video ? `${video.title || 'Video'} (${video.source === 'library' ? 'kütüphane' : 'eklenen'})` : item.coverUrl ? 'Kapak görseli' : 'Görsel yok — Medya sekmesinden ekleyin', '0:08'],
    ['Yer ve saat kartı', `${item.desk.info.venue || item.venues[0] || item.venue} · ${p.date} ${p.time}`, '0:07'],
    ['Etkinlik hakkında', images.length ? `${images.length} görsel + altyazı` : 'Kapak + altyazı', '0:09'],
    ['Bilet · kapanış', `${item.desk.info.price || item.sources.filter((s) => s !== 'NaHaber')[0] || 'Bilet bilgisi yok'} · NaHaber kapanışı`, '0:05'],
  ]
  const newsId = item.desk.newsId
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex aspect-[9/16] w-36 shrink-0 flex-col justify-end gap-1 overflow-hidden rounded-xl bg-slate-900 p-2.5">
          {item.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
          ) : null}
          <span className="relative self-start rounded bg-red-600 px-1.5 text-[10px] font-extrabold text-white">#{item.city}</span>
          <span className="relative text-[13px] font-extrabold leading-tight text-white">{item.title}</span>
          <span className="relative text-[10px] text-slate-200">{p.date} · {p.time}</span>
        </div>
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <div className="text-[11px] font-bold uppercase text-[rgb(var(--color-muted))]">Sahne planı · 9:16 · ~0:32</div>
          {scenes.map(([name, detail, dur], i) => (
            <div key={name} className="flex items-center gap-2 rounded-lg border border-[rgb(var(--color-border))] p-2 text-[13px]">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-[rgb(var(--color-surface))] text-xs font-extrabold">{i + 1}</span>
              <div className="min-w-0 flex-1"><div className="font-bold">{name}</div><div className="truncate text-xs text-[rgb(var(--color-muted))]">{detail}</div></div>
              <span className="text-xs font-bold">{dur}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-[rgb(var(--color-border))] p-3">
        <VoiceButton eventId={item.id} label="Seslendirme örneğini dinle" />
        <div className="text-[13px]"><b>Seslendirme</b> · {gen?.voice.presenter ?? 'il / etkinlik sunucusu'} · müzik: etkinlik (akustik) · altyazı açık</div>
      </div>
      {newsId ? (
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/video?news=${newsId}`} className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-red-600 font-extrabold text-white">Video editöründe aç</Link>
          <Link href="/admin/social/reels" className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[rgb(var(--color-border))] font-bold">Reels stüdyosu</Link>
        </div>
      ) : (
        <p className="rounded-xl bg-[rgb(var(--color-surface))] p-3 text-[13px]">Video, haberin üzerinden üretilir: önce Haber sekmesinde haberi taslak olarak oluşturun. Video editörü haberle açılır; Video Kütüphanesi'nden eklediğiniz videolar editörün kütüphane sekmesinde de hazırdır. Reels yayımlanmış haberden üretilir.</p>
      )}
    </div>
  )
}

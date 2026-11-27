'use client'

/**
 * LİSTE STÜDYOSU — Top N müzik / film / dizi / DJ tanıtım videoları (ayrı bölüm).
 * 6 adım: Liste · Klipler · Sunum · Yazı stili · Geçiş & efekt · Çıktı. Sağda yaklaşık önizleme.
 * Video parça parça üretilir (giriş · her sıra · kapanış) ve yeniden kodlanmadan tek MP4 olur.
 * Çıktıda NaHaber logosu / yazısı / kapanışı YOKTUR; kapanışta yayıncının (sayfanın) kartı vardır.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Check, Link2, ClipboardPaste, Clapperboard, Copy, Cpu, Download, Film, ImageIcon, ListOrdered, Loader2, Mic, Newspaper, Play, Plus, Scissors, Search, Sparkles, Trash2, Type, Upload, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import { cn } from '@/lib/utils'
import { auth } from '@/lib/firebase/auth'
import { storage } from '@/lib/firebase/storage'
import { runReelJob } from '@/components/admin/social/reelsApi'
import { FILTERS, FILTER_LABEL, MUSIC_LABEL, MUSIC_PRESETS } from '@/lib/edit/editProject'
import { CARD_TEMPLATES, TEMPLATE_INFO, VIDEO_TEMPLATES, cardCount, isCardTemplate, suggestTemplates, type CardTemplate, type EventTemplate } from '@/lib/listStudio/eventTemplates'
import { AD_TEXT_STYLES, AD_TEXT_STYLE_INFO, AD_VOICES, AD_VOICE_IDS, isLowResMedia } from '@/lib/adStudio/adModel'
import {
  CHANGES,
  DUCK_LABEL,
  DUCK_MODES,
  MUSIC_MODES,
  MUSIC_MODE_LABEL,
  WM_POSITIONS,
  WM_POS_LABEL,
  eventAnnounce,
  eventSectionMs,
  EXTRAS_MAX,
  cardsKey,
  effectiveRenderKey,
  wholeEligible,
  SHARE_PLATFORM_NAME,
  captionFor,
  listRenderKey,
  type ShareFormat,
  type SharePlatform,
  CHANGE_LABEL,
  CLIP_SOUNDS,
  CLIP_SOUND_LABEL,
  LIST_ASPECTS,
  LIST_LIMITS,
  LIST_PACK_INFO,
  LIST_TRANSITIONS,
  LIST_TRANSITION_LABEL,
  LIST_TYPE_INFO,
  LOGO_PLACEMENTS,
  LOGO_PLACEMENT_LABEL,
  TEXT_POSITIONS,
  clipLenMs,
  defaultAnnounce,
  defaultIntroAnnounce,
  introVoiceCurrent,
  itemVoiceCurrent,
  listRenderProblem,
  listTotalMs,
  listWarnings,
  newListItem,
  parsePastedList,
  platformFit,
  playOrder,
  segmentIds,
  segmentKey,
  voicesMissing,
  type ListItem,
  type ListPack,
  type ListProject,
  type ListType,
  type Studio,
  modeOf,
  packsOf,
  typesOf,
} from '@/lib/listStudio/listModel'

const API = '/api/admin/list-studio'
const STEPS = [
  ['liste', 'Liste', ListOrdered],
  ['klip', 'Klipler', Scissors],
  ['sunum', 'Sunum', Mic],
  ['stil', 'Yazı stili', Type],
  ['efekt', 'Geçiş & efekt', Wand2],
  ['cikti', 'Çıktı', Download],
] as const
type Step = (typeof STEPS)[number][0]
const ETK_LABEL: Record<Step, string> = { liste: 'Etkinlikler', klip: 'Medya & süre', sunum: 'Ses & müzik', stil: 'Şablon & renk', efekt: 'Geçiş & efekt', cikti: 'Çıktı & paylaş' }

async function call<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  try {
    const res = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null
    if (!res.ok) return { ok: false, error: json?.error ?? `HTTP ${res.status}` }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, error: 'Ağ hatası — istek sunucuya ulaşmadı' }
  }
}

const sec = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} sn`
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`
const field = 'w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2.5 py-2 text-sm'
const chip = (on: boolean) => cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold', on ? 'border-fuchsia-600 bg-fuchsia-600 text-white' : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]')
const card = (on: boolean) => cn('rounded-xl border p-3 text-left transition', on ? 'border-fuchsia-600 ring-2 ring-fuchsia-500/30' : 'border-[rgb(var(--color-border))] hover:border-fuchsia-300')
const PALETTE = ['#ff2d95', '#f5c518', '#a3e635', '#22d3ee', '#8b5cf6', '#ff5a1f', '#d4af37', '#ffffff', '#e11d48', '#2563eb']

function H({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div>
      <h3 className="text-[15px] font-extrabold">{children}</h3>
      {hint && <p className="text-[12.5px] text-[rgb(var(--color-muted))]">{hint}</p>}
    </div>
  )
}

async function uploadFile(file: File, listId: string, onPct: (n: number) => void): Promise<string> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Oturum yok')
  const isVideo = file.type.startsWith('video/')
  const name = `${Date.now()}_${file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-60)}`
  const task = uploadBytesResumable(storageRef(storage, `${isVideo ? 'news-videos' : 'news-images'}/${uid}/lists/${listId}/${name}`), file, { contentType: file.type })
  await new Promise<void>((resolve, reject) => task.on('state_changed', (s) => onPct(Math.round((s.bytesTransferred / s.totalBytes) * 100)), reject, () => resolve()))
  return getDownloadURL(task.snapshot.ref)
}

async function uploadAudio(file: File, listId: string, onPct: (n: number) => void): Promise<string> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Oturum yok')
  const name = `${Date.now()}_${file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-60)}`
  // depolama kuralı yalnız video/görsel türünü kabul eder: ses dosyası «video/*» etiketiyle yüklenir, sunucu AAC'ye çevirir
  const type = /mpeg|mp3/i.test(file.type) || /\.mp3$/i.test(file.name) ? 'video/mpeg' : /wav/i.test(file.type) ? 'video/x-wav' : 'video/mp4'
  const task = uploadBytesResumable(storageRef(storage, `news-videos/${uid}/lists/${listId}/${name}`), file, { contentType: type })
  await new Promise<void>((resolve, reject) => task.on('state_changed', (s) => onPct(Math.round((s.bytesTransferred / s.totalBytes) * 100)), reject, () => resolve()))
  return getDownloadURL(task.snapshot.ref)
}

// ── ana ekran ────────────────────────────────────────────────────────────────
export function ListStudio({ studio = 'muzik' }: { studio?: Studio }) {
  const [lists, setLists] = useState<ListProject[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const types = typesOf(studio)
  const [type, setType] = useState<ListType>(types[0]!)
  const [count, setCount] = useState(10)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await call<{ lists: ListProject[] }>('GET', `${API}?studio=${studio}`)
    if (r.ok) setLists(r.data.lists)
    else toast.error(r.error)
  }, [studio])
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('liste')
    if (id) setOpenId(id)
    void load()
  }, [load])

  const open = (id: string | null) => {
    setOpenId(id)
    const u = new URL(window.location.href)
    if (id) u.searchParams.set('liste', id)
    else u.searchParams.delete('liste')
    window.history.replaceState(null, '', u.toString())
    if (!id) void load()
  }
  const create = async (body: Record<string, unknown>) => {
    setBusy(true)
    const r = await call<{ list: ListProject }>('POST', API, { studio, ...body })
    setBusy(false)
    if (!r.ok) return toast.error(r.error)
    open(r.data.list.id)
  }

  if (openId) return <ListEditor id={openId} onBack={() => open(null)} />

  if (studio === 'etkinlik')
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm text-fuchsia-900 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-200">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            Yeni etkinlik videosu <b>Etkinlik Masası</b>'ndan kurulur: il ve tarih (bugün / bu hafta / yaklaşan) seçin, etkinlikleri işaretleyin, videonun hazırlanacağı hesabı seçin. Hesap adı videoya filigran olarak eklenir; NaHaber logosu bulunmaz.
          </div>
          <a href="/admin/events?video=1" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-fuchsia-600 px-3 text-sm font-bold text-white">
            <Plus className="h-4 w-4" /> Etkinlik seç
          </a>
        </div>
        <section className="space-y-3">
          <h2 className="text-base font-extrabold">Etkinlik videoları</h2>
          {!lists ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : !lists.length ? (
            <p className="text-sm text-[rgb(var(--color-muted))]">Henüz etkinlik videosu yok.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {lists.map((l) => (
                <button key={l.id} type="button" onClick={() => open(l.id)} className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-left">
                  <div className="flex aspect-video items-center justify-center bg-neutral-900">
                    {l.render.coverUrl ? <img src={l.render.coverUrl} alt="" className="h-full w-full object-cover" /> : <CalendarDays className="h-8 w-8 text-neutral-500" />}
                  </div>
                  <div className="p-3">
                    <div className="truncate text-sm font-extrabold">{l.title}</div>
                    <div className="mt-0.5 text-[12px] text-[rgb(var(--color-muted))]">
                      {l.items.length} etkinlik · {l.publisher.name || 'hesap yok'} · {l.render.status === 'ready' ? 'Video hazır' : 'Taslak'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    )

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm text-fuchsia-900 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-200">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          {studio === 'teknoloji' ? (
            <>Top 10 telefon / bilgisayar / TV, en iyi 5 ürün, yapay zekâ araçları; tek ürün ve yapay zekâ tanıtımı; NaHaber teknoloji haberinden video — özellik kartları, fiyat, canlı sunucu sesi, geçişler ve efektler.</>
          ) : (
            <>Top 5 / 10 / 20 müzik, film, dizi ve DJ listeleri — her sırada 15–30 sn klip ya da fragman, canlı sunucu sesi, sıra kartları, geçişler ve efektler.</>
          )}{' '}
          Videolarda <b>NaHaber logosu ya da kapanışı bulunmaz</b>; sonda yayıncının (sayfanın) kartı gösterilir.
        </div>
      </div>
      <section className="space-y-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
        <h2 className="text-base font-extrabold">{studio === 'teknoloji' ? 'Yeni video' : 'Yeni liste'}</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {types.map((t) => {
            const T = LIST_TYPE_INFO[t]
            return (
              <button key={t} type="button" onClick={() => setType(t)} className={card(type === t)}>
                <div className="flex items-center gap-1.5 text-sm font-extrabold">
                  {type === t && <Check className="h-4 w-4 text-fuchsia-600" />}
                  {T.category === 'sinema' ? <Film className="h-4 w-4" /> : T.category === 'teknoloji' ? <Cpu className="h-4 w-4" /> : <ListOrdered className="h-4 w-4" />}
                  {T.label}
                </div>
                <div className="mt-0.5 text-[12px] text-[rgb(var(--color-muted))]">{T.mode === 'urun' ? T.source : T.title}</div>
                <div className="mt-1 text-[11.5px] font-semibold text-fuchsia-700 dark:text-fuchsia-300">Sunum: {LIST_PACK_INFO[T.pack].label}</div>
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">{modeOf(type) === 'urun' ? 'Bölüm (özellik) sayısı:' : 'Sıra sayısı:'}</span>
          {[5, 10, 20].map((n) => (
            <button key={n} type="button" onClick={() => setCount(n)} className={chip(count === n)}>
              Top {n}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-sm">
            ya da
            <input type="number" min={1} max={LIST_LIMITS.items} value={count} onChange={(e) => setCount(Math.max(1, Math.min(LIST_LIMITS.items, Math.round(Number(e.target.value) || 1))))} className="w-20 rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5" />
          </label>
          <button type="button" disabled={busy} onClick={() => void create({ listType: type, count })} className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-fuchsia-600 px-4 text-sm font-bold text-white disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {LIST_TYPE_INFO[type].label} {modeOf(type) === 'urun' ? `(${count} bölüm)` : count} oluştur
          </button>
        </div>
      </section>
      {studio === 'teknoloji' && <NewsImport busy={busy} onPick={(newsId) => void create({ fromNewsId: newsId })} />}
      <section className="space-y-3">
        <h2 className="text-base font-extrabold">{studio === 'teknoloji' ? 'Projeler' : 'Listeler'}</h2>
        {!lists ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : !lists.length ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">Henüz liste yok.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {lists.map((l) => (
              <div key={l.id} className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
                <button type="button" onClick={() => open(l.id)} className="block w-full text-left">
                  <div className="flex aspect-video items-center justify-center bg-neutral-900">
                    {l.render.coverUrl ? <img src={l.render.coverUrl} alt="" className="h-full w-full object-cover" /> : <ListOrdered className="h-8 w-8 text-neutral-500" />}
                  </div>
                  <div className="p-3 pb-1">
                    <div className="truncate text-sm font-extrabold">{l.title}</div>
                    <div className="mt-0.5 text-[12px] text-[rgb(var(--color-muted))]">
                      {LIST_TYPE_INFO[l.listType].label} · {l.items.length} {modeOf(l.listType) === 'urun' ? 'bölüm' : 'sıra'} · {l.render.status === 'ready' ? 'Video hazır' : 'Taslak'}
                    </div>
                  </div>
                </button>
                <div className="px-3 pb-3">
                  <button type="button" disabled={busy} onClick={() => void create({ copyOf: l.id })} className="inline-flex items-center gap-1 text-[12px] font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                    <Copy className="h-3.5 w-3.5" /> Bu haftaya kopyala
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── TEKNOLOJİ: NaHaber haberinden video ──────────────────────────────────────
type NewsHit = { newsId: string; title: string; category: string; imageUrl: string | null; hasVideo: boolean }
function NewsImport({ busy, onPick }: { busy: boolean; onPick: (newsId: string) => void }) {
  const [q, setQ] = useState('')
  const [onlyTech, setOnlyTech] = useState(true)
  const [hits, setHits] = useState<NewsHit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const search = async () => {
    setLoading(true)
    const r = await call<{ items: NewsHit[] }>('GET', `/api/admin/social/reels/news?q=${encodeURIComponent(q.trim())}`)
    setLoading(false)
    if (!r.ok) return toast.error(r.error)
    setHits(r.data.items)
  }
  const shown = (hits ?? []).filter((h) => !onlyTech || /teknoloji|bilim|yapay/i.test(h.category))
  return (
    <section className="space-y-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
      <H hint="Haberin başlığı giriş kartına, özet ve metin cümleleri bölümlere (anons = cümlenin kendisi, yeni bilgi eklenmez), fotoğraf ve video dosyası kliplere aktarılır. Videoda NaHaber logosu / bağlantısı olmaz.">
        <span className="inline-flex items-center gap-1.5"><Newspaper className="h-4 w-4" /> NaHaber teknoloji haberinden video</span>
      </H>
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void search()} placeholder="Haber başlığında ara (boş = son haberler)" className={cn(field, 'max-w-md')} />
        <button type="button" onClick={() => void search()} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Ara
        </button>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={onlyTech} onChange={(e) => setOnlyTech(e.target.checked)} /> Yalnız teknoloji / bilim</label>
      </div>
      {hits && !shown.length && <p className="text-sm text-[rgb(var(--color-muted))]">Son yayımlanan haberlerde eşleşme yok.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {shown.slice(0, 12).map((h) => (
          <button key={h.newsId} type="button" disabled={busy} onClick={() => onPick(h.newsId)} className="flex items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] p-2 text-left hover:border-fuchsia-400 disabled:opacity-60">
            {h.imageUrl ? <img src={h.imageUrl} alt="" className="h-12 w-16 shrink-0 rounded object-cover" /> : <div className="h-12 w-16 shrink-0 rounded bg-neutral-800" />}
            <span className="min-w-0">
              <span className="line-clamp-2 text-[13px] font-bold">{h.title}</span>
              <span className="text-[11.5px] text-[rgb(var(--color-muted))]">{h.category}{h.hasVideo ? ' · video' : ''}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ── düzenleyici ──────────────────────────────────────────────────────────────
type StepProps = { l: ListProject; patch: (p: Partial<ListProject>) => void }
type ServerProps = { flush: () => Promise<boolean>; takeServer: (s: ListProject) => void }

function ListEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const [l, setL] = useState<ListProject | null>(null)
  const [step, setStep] = useState<Step>('liste')
  const [sel, setSel] = useState(0)
  const [saving, setSaving] = useState(false)
  const pending = useRef<Record<string, unknown>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void call<{ list: ListProject }>('GET', `${API}/${id}`).then((r) => (r.ok ? setL(r.data.list) : toast.error(r.error)))
  }, [id])

  /** sunucunun ürettiği alanlar (ses, medya, render) alınır; yazılan metin ezilmez */
  const takeServer = useCallback(
    (s: ListProject) =>
      setL((cur) => {
        if (!cur) return s
        const byId = new Map(s.items.map((x) => [x.id, x]))
        return {
          ...cur,
          introVoice: s.introVoice,
          musicTrack: s.musicTrack,
          cards: s.cards,
          platformLogoUrl: s.platformLogoUrl,
          logoPlacement: s.logoPlacement,
          segments: s.segments,
          render: s.render,
          updatedAt: s.updatedAt,
          items: cur.items.map((x) => {
            const sv = byId.get(x.id)
            const same = !!x.media && !!sv?.media && x.media.url === sv.media.url
            const svx = sv?.extras ?? []
            const extras = svx.map((m) => {
              const mine = (x.extras ?? []).find((y) => y.url === m.url)
              return mine ? { ...m, inMs: mine.inMs, outMs: mine.outMs } : m
            })
            return sv ? { ...x, media: same ? { ...sv.media!, inMs: x.media!.inMs, outMs: x.media!.outMs } : sv.media, coverUrl: sv.coverUrl, voice: sv.voice, extras, ...(same ? {} : { ownFirst: sv.ownFirst, narrStartMs: sv.narrStartMs }) } : x
          }),
        }
      }),
    [],
  )

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const body = pending.current
    if (!Object.keys(body).length) return true
    pending.current = {}
    setSaving(true)
    const r = await call<{ list: ListProject }>('PATCH', `${API}/${id}`, body)
    setSaving(false)
    if (!r.ok) {
      toast.error(r.error)
      return false
    }
    takeServer(r.data.list)
    return true
  }, [id, takeServer])

  const patch = useCallback(
    (p: Partial<ListProject>) => {
      setL((cur) => (cur ? { ...cur, ...p } : cur))
      Object.assign(pending.current, p)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), 700)
    },
    [flush],
  )

  if (!l) return <Loader2 className="h-6 w-6 animate-spin" />
  const selItem = l.items[Math.min(sel, l.items.length - 1)]!

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void flush().then(onBack)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold">
          <ArrowLeft className="h-4 w-4" /> {l.studio === 'etkinlik' ? 'Etkinlik videoları' : 'Listeler'}
        </button>
        <input value={l.title} onChange={(e) => patch({ title: e.target.value })} className="h-9 min-w-[240px] flex-1 rounded-xl border border-[rgb(var(--color-border))] bg-transparent px-3 text-[15px] font-extrabold" />
        <span className="text-[12px] text-[rgb(var(--color-muted))]">{saving ? 'Kaydediliyor…' : 'Kaydedildi'}</span>
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm('Bu liste projesi silinsin mi? (Üretilmiş video dosyası etkilenmez)')) return
            const r = await call('DELETE', `${API}/${id}`)
            if (r.ok) onBack()
            else toast.error(r.error)
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold text-red-600"
        >
          <Trash2 className="h-4 w-4" /> Sil
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STEPS.map(([k, label, Icon], i) => (
          <button key={k} type="button" onClick={() => setStep(k)} className={cn('inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold', step === k ? 'border-fuchsia-600 bg-fuchsia-600 text-white' : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]')}>
            <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[11px]', step === k ? 'bg-white text-fuchsia-700' : 'bg-[rgb(var(--color-border))]')}>{i + 1}</span>
            <Icon className="h-4 w-4" /> {l.studio === 'etkinlik' ? ETK_LABEL[k] : label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 space-y-4 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
          {step === 'liste' && <ListStep l={l} patch={patch} flush={flush} takeServer={takeServer} onSelect={setSel} />}
          {step === 'klip' && <ClipStep l={l} patch={patch} flush={flush} takeServer={takeServer} sel={sel} onSelect={setSel} />}
          {step === 'sunum' && <PresentStep l={l} patch={patch} flush={flush} takeServer={takeServer} />}
          {step === 'stil' && (l.studio === 'etkinlik' ? <TemplateStep l={l} patch={patch} /> : <StyleStep l={l} patch={patch} />)}
          {step === 'efekt' && <FxStep l={l} patch={patch} />}
          {step === 'cikti' && <OutputStep l={l} patch={patch} flush={flush} takeServer={takeServer} reload={async () => {
            const r = await call<{ list: ListProject }>('GET', `${API}/${id}`)
            if (r.ok) takeServer(r.data.list)
          }} />}
          <div className="flex justify-between border-t border-[rgb(var(--color-border))] pt-3">
            <button type="button" disabled={step === 'liste'} onClick={() => setStep(STEPS[Math.max(0, STEPS.findIndex((s) => s[0] === step) - 1)]![0])} className="h-9 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold disabled:opacity-40">
              Geri
            </button>
            <button type="button" disabled={step === 'cikti'} onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, STEPS.findIndex((s) => s[0] === step) + 1)]![0])} className="h-9 rounded-xl bg-fuchsia-600 px-4 text-sm font-bold text-white disabled:opacity-40">
              Sonraki adım
            </button>
          </div>
        </section>
        <Preview l={l} item={selItem} rank={l.items.indexOf(selItem) + 1} />
      </div>
    </div>
  )
}

// ── 1 · liste ────────────────────────────────────────────────────────────────
function ListStep(props: StepProps & ServerProps & { onSelect: (i: number) => void }) {
  if (props.l.studio === 'etkinlik') return <EventListStep {...props} />
  return <ListStepInner {...props} />
}

// ── ETKİNLİK · 1 · etkinlikler ──────────────────────────────────────────────
function EventListStep({ l, patch, onSelect }: StepProps & ServerProps & { onSelect: (i: number) => void }) {
  const setItems = (items: ListItem[]) => patch({ items })
  const upd = (i: number, p: Partial<ListItem>) => setItems(l.items.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const updEv = (i: number, p: Partial<NonNullable<ListItem['event']>>) => {
    const x = l.items[i]!
    if (!x.event) return
    upd(i, { event: { ...x.event, ...p } })
  }
  const move = (i: number, d: number) => {
    const m = [...l.items]
    const j = i + d
    if (j < 0 || j >= m.length) return
    ;[m[i], m[j]] = [m[j]!, m[i]!]
    setItems(m)
  }
  const wm = l.watermark
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <H hint="Giriş kartında büyük yazılır (ör. «Antalya'da Bu Hafta»).">1 · Video başlığı</H>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={l.introTitle} onChange={(e) => patch({ introTitle: e.target.value })} placeholder="Antalya'da Bu Hafta" className={field} />
          <input value={l.introSubtitle} onChange={(e) => patch({ introSubtitle: e.target.value })} placeholder="ör. 27 Kasım – 3 Aralık" className={field} />
        </div>
      </div>
      <div className="space-y-2">
        <H hint={`Hesap: ${l.publisher.name || '—'}${l.publisher.handle ? ` (@${l.publisher.handle})` : ''}. Hesap adı her karede filigran olarak görünür; kapanış kartında da yazılır.`}>Filigran</H>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!wm} onChange={(e) => patch({ watermark: e.target.checked ? { text: l.publisher.handle ? `@${l.publisher.handle}` : l.publisher.name, pos: 'sag-ust', opacity: 0.8 } : null })} /> Filigran açık
          </label>
          {wm && (
            <>
              <input value={wm.text} onChange={(e) => patch({ watermark: { ...wm, text: e.target.value } })} className="h-8 w-56 rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 text-sm" />
              {WM_POSITIONS.map((p) => (
                <button key={p} type="button" onClick={() => patch({ watermark: { ...wm, pos: p } })} className={chip(wm.pos === p)}>
                  {WM_POS_LABEL[p]}
                </button>
              ))}
              <label className="text-[12px] font-semibold">
                Saydamlık %{Math.round(wm.opacity * 100)}
                <input type="range" min={0.3} max={1} step={0.05} value={wm.opacity} onChange={(e) => patch({ watermark: { ...wm, opacity: Number(e.target.value) } })} className="ml-2 w-28 align-middle" />
              </label>
            </>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <H hint="Sıra videodaki sırayı belirler. Tarih, saat, mekân ve bilet bilgisi kartta yazılır ve anlatımda okunur.">Etkinlikler ({l.items.length})</H>
        {l.items.map((x, i) => (
          <div key={x.id} className="grid grid-cols-[34px_minmax(0,1fr)] items-start gap-2 rounded-xl border border-[rgb(var(--color-border))] p-2.5" onFocus={() => onSelect(i)}>
            <div className="flex h-9 items-center justify-center rounded-lg bg-fuchsia-600 text-sm font-black text-white">{i + 1}</div>
            <div className="space-y-2">
              <input value={x.title} onChange={(e) => upd(i, { title: e.target.value })} placeholder="Etkinlik adı" className={field} />
              {x.event && (
                <div className="grid gap-2 sm:grid-cols-4">
                  <input value={x.event.date} onChange={(e) => updEv(i, { date: e.target.value })} placeholder="Tarih" className={field} />
                  <input value={x.event.time} onChange={(e) => updEv(i, { time: e.target.value })} placeholder="Saat (21.00)" className={field} />
                  <input value={x.event.venue} onChange={(e) => updEv(i, { venue: e.target.value })} placeholder="Mekân" className={field} />
                  <input value={x.event.price} onChange={(e) => updEv(i, { price: e.target.value })} placeholder="Bilet (ör. 750 TL)" className={field} />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                {x.event && <span className="rounded bg-[rgb(var(--color-border))] px-1.5 py-0.5 font-semibold">{x.event.city} · {x.event.category}{x.event.source ? ` · ${x.event.source}` : ''}</span>}
                <span className={cn('rounded px-1.5 py-0.5 font-semibold', x.media ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300')}>{x.media ? `${x.media.kind === 'video' ? 'video' : 'görsel'} ${sec(eventSectionMs(l, x))}` : 'medya yok — «Medya & süre» adımında ekleyin'}</span>
                <button type="button" onClick={() => upd(i, { announce: eventAnnounce(x) })} className="rounded border border-[rgb(var(--color-border))] px-1.5 py-1 font-semibold">Anonsu bilgilere göre yaz</button>
                <div className="ml-auto flex gap-1">
                  <button type="button" title="Yukarı" onClick={() => move(i, -1)} className="rounded border border-[rgb(var(--color-border))] p-1.5"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" title="Aşağı" onClick={() => move(i, 1)} className="rounded border border-[rgb(var(--color-border))] p-1.5"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" title="Videodan çıkar" disabled={l.items.length <= 1} onClick={() => setItems(l.items.filter((_, j) => j !== i))} className="rounded border border-[rgb(var(--color-border))] p-1.5 text-red-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
        <a href="/admin/events?video=1" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-fuchsia-400 px-3 text-sm font-semibold text-fuchsia-700 dark:text-fuchsia-300">
          <Plus className="h-4 w-4" /> Başka etkinliklerle yeni video
        </a>
      </div>
    </div>
  )
}

function ListStepInner({ l, patch, onSelect, flush, takeServer }: StepProps & ServerProps & { onSelect: (i: number) => void }) {
  const [paste, setPaste] = useState('')
  const T = LIST_TYPE_INFO[l.listType]
  const urun = modeOf(l.listType) === 'urun'
  const tech = l.studio === 'teknoloji'
  const setItems = (items: ListItem[]) => patch({ items })
  const upd = (i: number, p: Partial<ListItem>) => setItems(l.items.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const move = (i: number, d: number) => {
    const m = [...l.items]
    const j = i + d
    if (j < 0 || j >= m.length) return
    ;[m[i], m[j]] = [m[j]!, m[i]!]
    setItems(m)
  }
  const resize = (n: number) => {
    const k = Math.max(1, Math.min(LIST_LIMITS.items, n))
    if (k < l.items.length && l.items.slice(k).some((x) => x.media || x.title) && !window.confirm(`Son ${l.items.length - k} sıra (klipleriyle birlikte) kaldırılsın mı?`)) return
    setItems(k <= l.items.length ? l.items.slice(0, k) : [...l.items, ...Array.from({ length: k - l.items.length }, () => newListItem())])
  }
  const importPaste = () => {
    const rows = parsePastedList(paste, T.category)
    if (!rows.length) return toast.error('Yapıştırılan metinde satır bulunamadı')
    const items = rows.map((r, i) => ({ ...(l.items[i] ?? newListItem()), title: r.title, subtitle: r.subtitle }))
    setItems(items)
    setPaste('')
    toast.success(`${rows.length} sıra aktarıldı`)
  }
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <H hint={`Veri kaynağı: ${T.source}`}>1 · {tech ? 'Video türü' : 'Liste türü'}</H>
        <div className="flex flex-wrap gap-2">
          {typesOf(l.studio).map((t) => (
            <button key={t} type="button" onClick={() => patch({ listType: t })} className={chip(l.listType === t)}>
              {LIST_TYPE_INFO[t].label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[12px] font-semibold">
            {urun ? (l.listType === 'tek-haber' ? 'Haber başlığı' : l.listType === 'ai-tanitim' ? 'Yapay zekâ adı (ör. Gemini 3)' : 'Ürün adı (ör. iPhone 18 Pro)') : 'Giriş başlığı'}
            <input value={l.introTitle} onChange={(e) => patch({ introTitle: e.target.value })} placeholder={T.title} className={field} />
          </label>
          <label className="text-[12px] font-semibold">
            {urun ? 'Alt başlık (marka · fiyat · çıkış tarihi)' : 'Alt başlık (tarih / hafta)'}
            <input value={l.introSubtitle} onChange={(e) => patch({ introSubtitle: e.target.value })} placeholder={urun ? 'ör. Apple · 89.999 TL · Eylül 2026' : 'ör. 24–30 Kasım 2026 · Hafta 48'} className={field} />
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <H hint="Hazır düğmeler ya da istediğiniz sayı (en fazla 30).">{urun ? 'Bölüm (özellik) sayısı' : 'Sıra sayısı'}</H>
        <div className="flex flex-wrap items-center gap-2">
          {(urun ? [3, 5, 7] : [5, 10, 20]).map((n) => (
            <button key={n} type="button" onClick={() => resize(n)} className={chip(l.items.length === n)}>
              {urun ? `${n} bölüm` : `Top ${n}`}
            </button>
          ))}
          <input type="number" min={1} max={LIST_LIMITS.items} value={l.items.length} onChange={(e) => resize(Math.round(Number(e.target.value) || 1))} className="w-20 rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5 text-sm" />
          {!urun && (
            <label className="ml-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={l.countdown} onChange={(e) => patch({ countdown: e.target.checked })} /> Geri sayım ({l.items.length} → 1)
            </label>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <H hint={T.category === 'sinema' ? 'Her satıra bir başlık; «Başlık - alt bilgi» de olur. Baştaki sıra numaraları silinir.' : 'Spotify, Shazam, radyo listesini kopyalayıp yapıştırın: «1. Sanatçı - Şarkı» biçimi. Baştaki sıra numaraları silinir.'}>
          <span className="inline-flex items-center gap-1.5">
            <ClipboardPaste className="h-4 w-4" /> Listeyi yapıştır
          </span>
        </H>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder={T.category === 'sinema' ? '1. Film adı\n2. Film adı - Tür' : '1. Sanatçı - Şarkı\n2. Sanatçı - Şarkı'} className={field} />
        <button type="button" disabled={!paste.trim()} onClick={importPaste} className="h-9 rounded-xl bg-fuchsia-600 px-4 text-sm font-bold text-white disabled:opacity-40">
          Sıralara aktar
        </button>
      </div>

      <div className="space-y-2">
        <H hint={urun ? 'Her bölüm bir özellik / başlık: kartta büyük ad + açıklama, klipte özellik paneli.' : tech ? '1 = zirve. Fiyat ve özellikler klipte panel olarak görünür; fiyat anonsta okunur.' : '1 = zirve. Değişim ve hafta bilgisi sıra kartında rozet olarak görünür ve anonsta okunur.'}>{urun ? 'Bölümler' : 'Sıralar'}</H>
        {l.items.map((x, i) => (
          <div key={x.id} className="grid grid-cols-[34px_minmax(0,1fr)] items-start gap-2 rounded-xl border border-[rgb(var(--color-border))] p-2.5" onFocus={() => onSelect(i)}>
            <div className="flex h-9 items-center justify-center rounded-lg bg-fuchsia-600 text-sm font-black text-white">{i + 1}</div>
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={x.title} onChange={(e) => upd(i, { title: e.target.value })} placeholder={T.titleLabel ?? (T.category === 'sinema' ? 'Film / dizi adı' : T.category === 'kisi' ? 'DJ adı' : 'Şarkı adı')} className={field} />
                <input value={x.subtitle} onChange={(e) => upd(i, { subtitle: e.target.value })} placeholder={T.subtitleLabel} className={field} />
              </div>
              {tech && <SpecEditor item={x} urun={urun} onChange={(p) => upd(i, p)} />}
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                {!urun && (<>
                <select value={x.change} onChange={(e) => upd(i, { change: e.target.value as ListItem['change'] })} className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5">
                  {CHANGES.map((c) => (
                    <option key={c} value={c}>
                      {CHANGE_LABEL[c]}
                    </option>
                  ))}
                </select>
                {(x.change === 'up' || x.change === 'down') && (
                  <label>
                    Geçen hafta
                    <input type="number" min={1} value={x.prevRank ?? ''} onChange={(e) => upd(i, { prevRank: e.target.value ? Math.round(Number(e.target.value)) : null })} className="ml-1 w-16 rounded border border-[rgb(var(--color-border))] bg-transparent px-1.5 py-1" />
                  </label>
                )}
                <label>
                  Hafta
                  <input type="number" min={1} value={x.weeks ?? ''} onChange={(e) => upd(i, { weeks: e.target.value ? Math.round(Number(e.target.value)) : null })} className="ml-1 w-16 rounded border border-[rgb(var(--color-border))] bg-transparent px-1.5 py-1" />
                </label>
                </>)}
                <span className={cn('rounded px-1.5 py-0.5 font-semibold', x.media ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300')}>{x.media ? `klip ${sec(clipLenMs(x.media))}` : 'klip yok'}</span>
                <div className="ml-auto flex gap-1">
                  <button type="button" title="Yukarı" onClick={() => move(i, -1)} className="rounded border border-[rgb(var(--color-border))] p-1.5"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" title="Aşağı" onClick={() => move(i, 1)} className="rounded border border-[rgb(var(--color-border))] p-1.5"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" title="Kaldır" disabled={l.items.length <= 1} onClick={() => setItems(l.items.filter((_, j) => j !== i))} className="rounded border border-[rgb(var(--color-border))] p-1.5 text-red-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
        <button type="button" disabled={l.items.length >= LIST_LIMITS.items} onClick={() => setItems([...l.items, newListItem()])} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-fuchsia-400 px-3 text-sm font-semibold text-fuchsia-700 disabled:opacity-40 dark:text-fuchsia-300">
          <Plus className="h-4 w-4" /> {urun ? 'Bölüm ekle' : 'Sıra ekle'}
        </button>
      </div>

      <div className="space-y-2">
        <H hint="Videonun sonundaki kart. NaHaber adı ya da logosu kullanılmaz.">Yayıncı (sayfa)</H>
        <div className="grid gap-2 sm:grid-cols-3">
          <input value={l.publisher.name} onChange={(e) => patch({ publisher: { ...l.publisher, name: e.target.value } })} placeholder="Sayfa adı (ör. Müzik Listesi TR)" className={field} />
          <input value={l.publisher.handle} onChange={(e) => patch({ publisher: { ...l.publisher, handle: e.target.value } })} placeholder="@kullanıcıadı" className={field} />
          <input value={l.publisher.slogan} onChange={(e) => patch({ publisher: { ...l.publisher, slogan: e.target.value } })} placeholder="Takip et · her hafta yeni liste" className={field} />
        </div>
      </div>

      <PlatformLogo l={l} patch={patch} flush={flush} takeServer={takeServer} />
    </div>
  )
}

const SPEC_PRESETS = ['Ekran', 'İşlemci', 'Kamera', 'Batarya', 'Bellek', 'Depolama', 'Şarj', 'Ağırlık', 'Yazılım', 'Bağlantı']
function SpecEditor({ item, urun, onChange }: { item: ListItem; urun: boolean; onChange: (p: Partial<ListItem>) => void }) {
  const specs = item.specs
  const set = (i: number, p: Partial<{ label: string; value: string }>) => onChange({ specs: specs.map((r, j) => (j === i ? { ...r, ...p } : r)) })
  return (
    <div className="space-y-1.5 rounded-lg bg-[rgb(var(--color-border))]/30 p-2">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="font-semibold">Özellik paneli</span>
        {!urun && <input value={item.price} onChange={(e) => onChange({ price: e.target.value })} placeholder="Fiyat (ör. 64.999 TL)" className="w-40 rounded border border-[rgb(var(--color-border))] bg-transparent px-2 py-1" />}
        {specs.length < 6 && (
          <select value="" onChange={(e) => e.target.value && onChange({ specs: [...specs, { label: e.target.value === '+' ? '' : e.target.value, value: '' }] })} className="rounded border border-[rgb(var(--color-border))] bg-transparent px-2 py-1">
            <option value="">+ satır ekle</option>
            {SPEC_PRESETS.filter((p) => !specs.some((r) => r.label === p)).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
            <option value="+">Başka…</option>
          </select>
        )}
      </div>
      {specs.map((r, i) => (
        <div key={i} className="flex gap-1.5">
          <input value={r.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Etiket" className="w-28 rounded border border-[rgb(var(--color-border))] bg-transparent px-2 py-1 text-[12px]" />
          <input value={r.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="ör. 6,3 inç OLED 120 Hz" className="min-w-0 flex-1 rounded border border-[rgb(var(--color-border))] bg-transparent px-2 py-1 text-[12px]" />
          <button type="button" onClick={() => onChange({ specs: specs.filter((_, j) => j !== i) })} className="px-1 text-red-600">×</button>
        </div>
      ))}
      {specs.length > 0 && <p className="text-[11px] text-[rgb(var(--color-muted))]">Özellikleri yalnız doğrulanmış kaynaktan (üretici / haber) yazın; sistem özellik uydurmaz.</p>}
    </div>
  )
}

function PlatformLogo({ l, patch, flush, takeServer }: StepProps & ServerProps) {
  const input = useRef<HTMLInputElement>(null)
  const [pct, setPct] = useState<number | null>(null)
  const add = async (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return toast.error('Logo bir görsel olmalı (PNG / SVG / JPG)')
    try {
      await flush()
      setPct(0)
      const url = await uploadFile(f, l.id, setPct)
      const r = await call<{ list: ListProject }>('POST', `${API}/${l.id}/media`, { url, type: 'image', role: 'platformLogo', name: f.name })
      if (!r.ok) toast.error(r.error)
      else takeServer(r.data.list)
    } catch (e) {
      toast.error(`Logo yüklenemedi (${e instanceof Error ? e.message.slice(0, 80) : 'hata'})`)
    } finally {
      setPct(null)
    }
  }
  return (
    <div className="space-y-2">
      <H hint="Platforma özel listelerde (Netflix, Spotify, Shazam…) logoyu kendiniz yükleyin; tercihen şeffaf PNG.">Platform logosu</H>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void add(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      <div className="flex flex-wrap items-center gap-2">
        {l.platformLogoUrl && <img src={l.platformLogoUrl} alt="" className="h-10 max-w-[120px] rounded bg-neutral-800 object-contain p-1" />}
        <button type="button" onClick={() => input.current?.click()} disabled={pct !== null} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold">
          {pct !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {pct !== null ? `%${pct}` : l.platformLogoUrl ? 'Logoyu değiştir' : 'Logo yükle'}
        </button>
        {l.platformLogoUrl && (
          <button type="button" onClick={() => patch({ platformLogoUrl: null, logoPlacement: 'yok' })} className="text-[12px] font-semibold text-red-600">
            Kaldır
          </button>
        )}
      </div>
      {l.platformLogoUrl && (
        <div className="flex flex-wrap gap-2">
          {LOGO_PLACEMENTS.map((p) => (
            <button key={p} type="button" onClick={() => patch({ logoPlacement: p })} className={chip(l.logoPlacement === p)}>
              {LOGO_PLACEMENT_LABEL[p]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 2 · klipler ──────────────────────────────────────────────────────────────
function ClipStep({ l, patch, flush, takeServer, sel, onSelect }: StepProps & ServerProps & { sel: number; onSelect: (i: number) => void }) {
  const total = listTotalMs(l)
  const fit = platformFit(total, l.aspect)
  const warnings = listWarnings(l)
  const i = Math.min(sel, l.items.length - 1)
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <H hint="Bütün sıralar için. «Tamamı görünsün» yatay fragmanı dikey videoya bulanık zeminle sığdırır.">2 · Biçim</H>
        <div className="flex flex-wrap gap-2">
          {LIST_ASPECTS.map((a) => (
            <button key={a} type="button" onClick={() => patch({ aspect: a })} className={chip(l.aspect === a)}>
              {a} {a === '9:16' ? 'Reels / TikTok / Shorts' : a === '4:5' ? 'Gönderi' : a === '1:1' ? 'Kare' : 'YouTube'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => patch({ fit: 'blur' })} className={chip(l.fit === 'blur')}>Tamamı görünsün (bulanık zemin)</button>
          <button type="button" onClick={() => patch({ fit: 'cover' })} className={chip(l.fit === 'cover')}>Kadrajı doldur (kırp)</button>
        </div>
      </div>

      <div className="rounded-xl border border-[rgb(var(--color-border))] p-3">
        <div className="text-sm font-extrabold">Toplam süre: {total ? mmss(total) : '—'} <span className="font-normal text-[rgb(var(--color-muted))]">(tek parça video)</span></div>
        <div className="mt-2 flex flex-wrap gap-2">
          {fit.map((f) => (
            <span key={f.platform} title={f.note} className={cn('rounded-full px-2.5 py-1 text-[12px] font-semibold', f.ok ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300')}>
              {f.platform}: {f.note}
            </span>
          ))}
        </div>
        {warnings.length > 0 && <ul className="mt-2 list-disc pl-5 text-[12px] text-amber-700 dark:text-amber-300">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {l.items.map((x, j) => (
          <button key={x.id} type="button" onClick={() => onSelect(j)} className={cn('h-9 min-w-9 rounded-lg border px-2 text-sm font-black', j === i ? 'border-fuchsia-600 bg-fuchsia-600 text-white' : x.media ? 'border-emerald-400 text-emerald-700 dark:text-emerald-300' : 'border-[rgb(var(--color-border))]')}>
            {j + 1}
          </button>
        ))}
      </div>
      <ItemClip key={l.items[i]!.id} l={l} i={i} patch={patch} flush={flush} takeServer={takeServer} />
    </div>
  )
}

function ItemClip({ l, i, patch, flush, takeServer }: StepProps & ServerProps & { i: number }) {
  const x = l.items[i]!
  const clipIn = useRef<HTMLInputElement>(null)
  const coverIn = useRef<HTMLInputElement>(null)
  const vid = useRef<HTMLVideoElement>(null)
  const [pct, setPct] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const upd = (p: Partial<ListItem>) => patch({ items: l.items.map((y, j) => (j === i ? { ...y, ...p } : y)) })
  const setRange = (inMs: number, outMs: number) => {
    if (!x.media) return
    const max = x.media.durationMs ?? LIST_LIMITS.clipMaxMs
    const a = Math.max(0, Math.min(Math.round(inMs), max - LIST_LIMITS.clipMinMs))
    const b = Math.max(a + LIST_LIMITS.clipMinMs, Math.min(Math.round(outMs), max, a + LIST_LIMITS.clipMaxMs))
    upd({ media: { ...x.media, inMs: a, outMs: b } })
  }
  const upload = async (f: File | undefined, role: 'clip' | 'cover') => {
    if (!f) return
    const isVideo = f.type.startsWith('video/')
    if (role === 'cover' && !f.type.startsWith('image/')) return toast.error('Kapak bir görsel olmalı')
    if (!isVideo && !f.type.startsWith('image/')) return toast.error('Yalnız video ya da görsel')
    if (f.size > (isVideo ? 200 : 50) * 1024 * 1024) return toast.error(`${isVideo ? 200 : 50} MB sınırını aşıyor`)
    try {
      await flush()
      setPct(0)
      const url = await uploadFile(f, l.id, setPct)
      const r = await call<{ list: ListProject }>('POST', `${API}/${l.id}/media`, { url, type: isVideo ? 'video' : 'image', role, itemId: x.id, name: f.name })
      if (!r.ok) toast.error(r.error)
      else takeServer(r.data.list)
    } catch (e) {
      toast.error(`Yüklenemedi (${e instanceof Error ? e.message.slice(0, 80) : 'hata'})`)
    } finally {
      setPct(null)
    }
  }
  const etk = l.studio === 'etkinlik'
  const [link, setLink] = useState('')
  const addLink = async () => {
    if (!link.trim()) return
    await flush()
    setPct(0)
    const r = await call<{ list: ListProject }>('POST', `${API}/${l.id}/media`, { link: link.trim(), role: 'clip', itemId: x.id })
    setPct(null)
    if (!r.ok) return toast.error(r.error)
    setLink('')
    takeServer(r.data.list)
    toast.success('Bağlantıdaki dosya eklendi')
  }
  const len = clipLenMs(x.media)
  const lenOk = etk || (len >= LIST_LIMITS.softMinMs && len <= LIST_LIMITS.softMaxMs)
  const playRange = () => {
    const v = vid.current
    if (!v || !x.media) return
    v.currentTime = x.media.inMs / 1000
    void v.play()
  }
  useEffect(() => {
    const v = vid.current
    if (!v || !x.media) return
    const t = () => {
      setNow(v.currentTime * 1000)
      if (x.media && v.currentTime * 1000 >= x.media.outMs) v.pause()
    }
    v.addEventListener('timeupdate', t)
    return () => v.removeEventListener('timeupdate', t)
  }, [x.media])
  return (
    <div className="space-y-3 rounded-xl border border-[rgb(var(--color-border))] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-fuchsia-600 text-sm font-black text-white">{i + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold">{x.title || 'Adsız sıra'}</div>
          <div className="truncate text-[12px] text-[rgb(var(--color-muted))]">{x.subtitle}</div>
        </div>
        <input ref={clipIn} type="file" accept="video/*,image/*" hidden onChange={(e) => void upload(e.target.files?.[0], 'clip').finally(() => (e.target.value = ''))} />
        <input ref={coverIn} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0], 'cover').finally(() => (e.target.value = ''))} />
        <button type="button" disabled={pct !== null} onClick={() => clipIn.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-fuchsia-600 px-3 text-sm font-bold text-white disabled:opacity-60">
          {pct !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />} {pct !== null ? `%${pct}` : x.media ? 'Klibi değiştir' : 'Klip / fragman yükle'}
        </button>
        <button type="button" disabled={pct !== null} onClick={() => coverIn.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold">
          <ImageIcon className="h-4 w-4" /> {x.coverUrl ? 'Kapağı değiştir' : 'Kapak (isteğe bağlı)'}
        </button>
      </div>
      {etk ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link2 className="h-4 w-4" />
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… doğrudan video / görsel bağlantısı (.mp4, .jpg)" className="h-9 min-w-[240px] flex-1 rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 text-sm" />
            <button type="button" disabled={pct !== null || !link.trim()} onClick={() => void addLink()} className="h-9 rounded-xl border border-fuchsia-500 px-3 text-sm font-bold text-fuchsia-700 disabled:opacity-40 dark:text-fuchsia-300">Bağlantıdan ekle</button>
          </div>
          <p className="text-[12px] text-[rgb(var(--color-muted))]">Konser videosu, afiş ya da mekân görseli: cihazdan yükleyin ya da doğrudan dosya bağlantısı verin (YouTube / Instagram sayfa bağlantıları indirilemez). Video ≤ 200 MB. Masada hakkı «Bilinmiyor» olan medya otomatik kullanılmaz.</p>
        </div>
      ) : (
        <p className="text-[12px] text-[rgb(var(--color-muted))]">Kapak (albüm kapağı / afiş / DJ fotoğrafı) sıra kartının arka planında kullanılır; yoksa klibin ilk saniyeleri kullanılır. Video ≤ 200 MB.</p>
      )}
      {x.coverUrl && <img src={x.coverUrl} alt="" className="h-20 rounded-lg object-cover" />}
      {x.media && (
        <>
          {x.media.kind === 'video' ? <video ref={vid} src={x.media.url} controls playsInline className="max-h-[340px] w-full rounded-lg bg-black" /> : <img src={x.media.url} alt="" className="max-h-[340px] rounded-lg" />}
          {isLowResMedia(x.media) && <div className="rounded-md bg-amber-50 px-2 py-1 text-[12px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">Düşük çözünürlük ({x.media.width}×{x.media.height}) — video en fazla bu kalitede olur.</div>}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className={cn('rounded-full px-2.5 py-1 text-[12px] font-bold', lenOk ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300')}>Kullanılan: {sec(len)} {lenOk ? '' : '(önerilen 15–30 sn)'}</span>
            {x.media.kind === 'video' && (
              <>
                <span className="text-[12px] text-[rgb(var(--color-muted))]">Video {mmss(x.media.durationMs ?? 0)} · oynatma {sec(now)}</span>
                <button type="button" onClick={playRange} className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-[12px] font-semibold"><Play className="h-3.5 w-3.5" /> Seçili aralığı oynat</button>
                <button type="button" onClick={() => setRange(now, now + len)} className="rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-[12px] font-semibold">[ Başlangıç = şimdi</button>
                <button type="button" onClick={() => setRange(x.media!.inMs, now)} className="rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-[12px] font-semibold">Bitiş = şimdi ]</button>
              </>
            )}
          </div>
          {x.media.kind === 'video' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[12px] font-semibold">
                Başlangıç: {sec(x.media.inMs)}
                <input type="range" min={0} max={x.media.durationMs ?? 0} step={100} value={x.media.inMs} onChange={(e) => setRange(Number(e.target.value), Number(e.target.value) + len)} className="w-full" />
              </label>
              <label className="text-[12px] font-semibold">
                Süre: {sec(len)}
                <input type="range" min={LIST_LIMITS.clipMinMs} max={Math.min(LIST_LIMITS.clipMaxMs, (x.media.durationMs ?? 0) - x.media.inMs)} step={500} value={len} onChange={(e) => setRange(x.media!.inMs, x.media!.inMs + Number(e.target.value))} className="w-full" />
              </label>
              <div className="flex flex-wrap gap-1.5 sm:col-span-2">
                {[15, 20, 25, 30].map((s) => (
                  <button key={s} type="button" onClick={() => setRange(x.media!.inMs, x.media!.inMs + s * 1000)} className={chip(Math.round(len / 1000) === s)}>
                    {s} sn
                  </button>
                ))}
              </div>
            </div>
          )}
          {x.media.kind === 'image' && (
            <label className="text-[12px] font-semibold">
              Görsel süresi: {sec(len)}
              <input type="range" min={LIST_LIMITS.clipMinMs} max={LIST_LIMITS.clipMaxMs} step={500} value={len} onChange={(e) => setRange(0, Number(e.target.value))} className="w-full" />
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-[12px] font-semibold">
              Kadraj ↔ {Math.round(x.posX * 100)}
              <input type="range" min={-1} max={1} step={0.05} value={x.posX} onChange={(e) => upd({ posX: Number(e.target.value) })} className="w-full" />
            </label>
            <label className="text-[12px] font-semibold">
              Kadraj ↕ {Math.round(x.posY * 100)}
              <input type="range" min={-1} max={1} step={0.05} value={x.posY} onChange={(e) => upd({ posY: Number(e.target.value) })} className="w-full" />
            </label>
            <label className="text-[12px] font-semibold">
              Yakınlaştır ×{x.scale.toFixed(2)}
              <input type="range" min={1} max={2} step={0.05} value={x.scale} onChange={(e) => upd({ scale: Number(e.target.value) })} className="w-full" />
            </label>
            <label className="text-[12px] font-semibold">
              Klip sesi %{Math.round(x.volume * 100)}
              <input type="range" min={0} max={1} step={0.05} value={x.volume} onChange={(e) => upd({ volume: Number(e.target.value) })} className="w-full" />
            </label>
          </div>
          {etk && <EventAudio l={l} x={x} upd={upd} now={now} />}
          {etk && <ExtrasEditor l={l} x={x} upd={upd} flush={flush} takeServer={takeServer} />}
          <button type="button" onClick={() => upd({ media: null })} className="text-[12px] font-semibold text-red-600">Klibi kaldır</button>
        </>
      )}
    </div>
  )
}

// ── ETKİNLİK: ses sırası ve anlatım başlangıcı ───────────────────────────────
function EventAudio({ l, x, upd, now }: { l: ListProject; x: ListItem; upd: (p: Partial<ListItem>) => void; now: number }) {
  if (!x.media) return null
  const total = eventSectionMs(l, x)
  const video = x.media.kind === 'video'
  const voiceMs = x.voice?.durationMs ?? 0
  const narr = Math.min(x.narrStartMs, Math.max(0, total - 1_500))
  const pct = (ms: number) => `${Math.max(0, Math.min(100, (ms / Math.max(1, total)) * 100))}%`
  return (
    <div className="space-y-3 rounded-xl border border-fuchsia-300/60 bg-fuchsia-50/40 p-3 dark:bg-fuchsia-500/5">
      <div className="text-sm font-extrabold">Ses sırası ve anlatım · bölüm {sec(total)}</div>
      {video && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => upd({ ownFirst: true, narrStartMs: Math.max(x.narrStartMs, 4_000) })} className={chip(x.ownFirst)}>Önce videonun sesi (ör. konser), sonra anlatım</button>
          <button type="button" onClick={() => upd({ ownFirst: false, narrStartMs: 600 })} className={chip(!x.ownFirst)}>Anlatım hemen başlasın</button>
        </div>
      )}
      <label className="block text-[12px] font-semibold">
        Anlatım başlangıcı: {sec(narr)}
        <input type="range" min={0} max={Math.max(0, total - 1_500)} step={100} value={narr} onChange={(e) => upd({ narrStartMs: Number(e.target.value), ownFirst: Number(e.target.value) >= 2_000 })} className="w-full" />
      </label>
      {video && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <button type="button" onClick={() => upd({ narrStartMs: Math.max(0, Math.round(now - x.media!.inMs)), ownFirst: now - x.media!.inMs >= 2_000 })} className="rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 font-semibold">Anlatım = oynatılan an</button>
          <span className="font-semibold">Anlatım başlayınca videonun sesi:</span>
          {DUCK_MODES.map((d) => (
            <button key={d} type="button" onClick={() => upd({ duck: d })} className={chip(x.duck === d)}>
              {DUCK_LABEL[d]}
            </button>
          ))}
        </div>
      )}
      <div className="relative h-14 rounded-lg bg-neutral-900 text-[10.5px] font-bold text-white">
        <div className="absolute inset-y-0 left-0 rounded-l-lg bg-sky-600/70" style={{ width: pct(narr) }} />
        <div className="absolute top-0 h-1/2 rounded bg-fuchsia-600" style={{ left: pct(narr), width: voiceMs ? pct(voiceMs) : '30%' }} />
        <span className="absolute left-2 top-1">{video && x.ownFirst ? 'Videonun sesi' : 'Başlık'}</span>
        <span className="absolute top-1" style={{ left: `calc(${pct(narr)} + 6px)` }}>Anlatım{voiceMs ? ` ${sec(voiceMs)}` : ' (ses üretilmedi)'}</span>
        <span className="absolute bottom-1 left-2">0</span>
        <span className="absolute bottom-1 right-2">{sec(total)}</span>
      </div>
      {!video && <p className="text-[12px] text-[rgb(var(--color-muted))]">Görselde süre anlatım sığacak kadar otomatik uzar (anlatım + 1,2 sn).</p>}
    </div>
  )
}

// ── 3 · sunum ────────────────────────────────────────────────────────────────
function PresentStep({ l, patch, flush, takeServer }: StepProps & ServerProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [sample, setSample] = useState<string | null>(null)
  const applyPack = (p: ListPack) => {
    const P = LIST_PACK_INFO[p]
    patch({ pack: p, voiceId: P.voice, textStyle: P.textStyle, accent: P.accent, filter: P.filter, bars: P.bars, transition: 'karisik', sfxOn: P.sfx !== null })
  }
  const writeAll = (onlyEmpty: boolean) => {
    const items = l.items.map((x, i) => (onlyEmpty && x.announce.trim() ? x : { ...x, announce: defaultAnnounce(l, x, i + 1) }))
    patch({ items, ...(onlyEmpty && l.introAnnounce.trim() ? {} : { introAnnounce: defaultIntroAnnounce(l) }) })
  }
  const missing = voicesMissing(l)
  const generate = async () => {
    if (!(await flush())) return
    setBusy('voice')
    try {
      for (let round = 0; round < 12; round++) {
        const r = await call<{ list: ListProject; remaining: number; made: number }>('POST', `${API}/${l.id}/voice`)
        if (!r.ok) return void toast.error(r.error)
        takeServer(r.data.list)
        if (!r.data.remaining) return void toast.success('Seslendirmeler hazır')
        if (!r.data.made) return void toast.error('Seslendirme ilerlemedi; tekrar deneyin')
      }
    } finally {
      setBusy(null)
    }
  }
  const listen = async () => {
    if (!(await flush())) return
    setBusy('sample')
    const r = await call<{ url: string }>('POST', `${API}/${l.id}/sample`)
    setBusy(null)
    if (!r.ok) return toast.error(r.error)
    setSample(r.data.url)
  }
  const upd = (i: number, announce: string) => patch({ items: l.items.map((x, j) => (j === i ? { ...x, announce } : x)) })
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <H hint="Paket sesi, yazı stilini, rengi, renk tonunu ve geçişleri birlikte ayarlar; sonra tek tek değiştirebilirsiniz.">3 · Sunum paketi</H>
        <div className="grid gap-2 sm:grid-cols-2">
          {packsOf(l.studio).map((p) => (
            <button key={p} type="button" onClick={() => applyPack(p)} className={card(l.pack === p)}>
              <div className="flex items-center gap-1.5 text-sm font-extrabold">
                {l.pack === p && <Check className="h-4 w-4 text-fuchsia-600" />}
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: LIST_PACK_INFO[p].accent }} /> {LIST_PACK_INFO[p].label}
              </div>
              <div className="text-[12px] text-[rgb(var(--color-muted))]">{LIST_PACK_INFO[p].desc}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <H hint="Gemini profesyonel ses (ücretli, aylık ses bütçesinden). Top 20 anonsları ≈ 0,02 $.">Sunucu sesi</H>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={l.voiceOn} onChange={(e) => patch({ voiceOn: e.target.checked })} /> Seslendirme açık
        </label>
        <div className="flex flex-wrap gap-2">
          {AD_VOICE_IDS.map((v) => (
            <button key={v} type="button" onClick={() => patch({ voiceId: v })} className={chip(l.voiceId === v)}>
              {AD_VOICES[v].name} · {AD_VOICES[v].desc}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!!busy} onClick={() => void listen()} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold">
            {busy === 'sample' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Bu paket + sesle örnek dinle
          </button>
          {sample && <audio src={sample} controls autoPlay className="h-9" />}
        </div>
        {l.studio === 'etkinlik' ? (
          <div className="space-y-2 rounded-xl border border-[rgb(var(--color-border))] p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">Anlatım:</span>
              <button type="button" onClick={() => patch({ voiceOn: true })} className={chip(l.voiceOn)}>Seslendirmeli</button>
              <button type="button" onClick={() => patch({ voiceOn: false })} className={chip(!l.voiceOn)}>Seslendirmesiz (yalnız yazı)</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">Müzik:</span>
              {MUSIC_MODES.map((m) => (
                <button key={m} type="button" onClick={() => patch({ music: m })} className={chip(l.music === m)}>
                  {MUSIC_MODE_LABEL[m]}
                </button>
              ))}
            </div>
            {l.music === 'on' && <MusicPicker l={l} patch={patch} flush={flush} takeServer={takeServer} />}
            <p className="text-[12px] text-[rgb(var(--color-muted))]">
              {l.music === 'on' ? 'Fon müziği; videonun kendi sesi önce çalıyorsa müzik anlatımla birlikte girer.' : l.music === 'own' ? 'Fon müziği yok; yalnız yüklediğiniz videonun kendi sesi/müziği çalar (görsellerde sessiz).' : 'Müzik yok, videoların sesi de kapalı; yalnız anlatım (açıksa) ve efekt sesleri.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">Klibin kendi sesi:</span>
            {CLIP_SOUNDS.map((c) => (
              <button key={c} type="button" onClick={() => patch({ clipSound: c })} className={chip(l.clipSound === c)}>
                {CLIP_SOUND_LABEL[c]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <H hint="Anonslar sıra kartında okunur (≈ 2–4 sn); klip başlayınca susar. Ücretsiz şablonla yazılır, istediğiniz gibi düzenleyin.">Anonslar</H>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => writeAll(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold">
            <Sparkles className="h-4 w-4" /> Boş anonsları yaz
          </button>
          <button type="button" onClick={() => window.confirm('Bütün anonslar şablondan yeniden yazılsın mı?') && writeAll(false)} className="h-9 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold">
            Hepsini yeniden yaz
          </button>
          <button type="button" disabled={!l.voiceOn || !missing || !!busy} onClick={() => void generate()} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-fuchsia-600 px-4 text-sm font-bold text-white disabled:opacity-40">
            {busy === 'voice' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />} Seslendirmeleri oluştur{missing ? ` (${missing} satır)` : ' — hazır'}
          </button>
        </div>
        <label className="block text-[12px] font-semibold">
          Giriş anonsu {l.introAnnounce.trim() && <VoiceDot ok={introVoiceCurrent(l)} />}
          <textarea value={l.introAnnounce} onChange={(e) => patch({ introAnnounce: e.target.value })} rows={2} className={field} placeholder={defaultIntroAnnounce(l)} />
        </label>
        {playOrder(l).map(({ item, rank, index }) => (
          <label key={item.id} className="block text-[12px] font-semibold">
            #{rank} {item.title || 'Adsız'} {item.announce.trim() && <VoiceDot ok={itemVoiceCurrent(l, item)} />}
            <input value={item.announce} onChange={(e) => upd(index, e.target.value)} placeholder={defaultAnnounce(l, item, rank)} className={field} />
          </label>
        ))}
      </div>
    </div>
  )
}

function VoiceDot({ ok }: { ok: boolean }) {
  return <span className={cn('ml-1 rounded px-1.5 py-0.5 text-[10.5px] font-bold', ok ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300')}>{ok ? 'ses hazır' : 'ses gerekiyor'}</span>
}

// ── 4 · yazı stili ───────────────────────────────────────────────────────────
function StyleStep({ l, patch }: StepProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <H hint="Klip başladıktan sonra ~7 sn görünen alt bant: «#3 Şarkı – Sanatçı». Sıra kartı ve köşe rozeti her zaman çizilir.">4 · Alt bant yazı stili</H>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={l.textOn} onChange={(e) => patch({ textOn: e.target.checked })} /> Alt bant göster
        </label>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {AD_TEXT_STYLES.map((s) => (
            <button key={s} type="button" onClick={() => patch({ textStyle: s })} className={card(l.textStyle === s)}>
              <div className="flex items-center gap-1.5 text-sm font-extrabold">{l.textStyle === s && <Check className="h-4 w-4 text-fuchsia-600" />}{AD_TEXT_STYLE_INFO[s].label}</div>
              <div className="text-[12px] text-[rgb(var(--color-muted))]">{AD_TEXT_STYLE_INFO[s].desc}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <H>Renk</H>
        <div className="flex flex-wrap items-center gap-2">
          {PALETTE.map((c) => (
            <button key={c} type="button" title={c} onClick={() => patch({ accent: c })} className={cn('h-8 w-8 rounded-full border-2', l.accent === c ? 'border-fuchsia-600 ring-2 ring-fuchsia-500/40' : 'border-white/40')} style={{ background: c }} />
          ))}
          <input type="color" value={l.accent} onChange={(e) => patch({ accent: e.target.value })} className="h-8 w-12 rounded" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Yer:</span>
        {TEXT_POSITIONS.map((p) => (
          <button key={p} type="button" onClick={() => patch({ textPos: p })} className={chip(l.textPos === p)}>
            {p === 'alt' ? 'Alt' : p === 'orta' ? 'Orta' : 'Üst'}
          </button>
        ))}
        <label className="ml-2 text-[12px] font-semibold">
          Boyut {l.textSize}
          <input type="range" min={36} max={110} value={l.textSize} onChange={(e) => patch({ textSize: Number(e.target.value) })} className="ml-2 align-middle" />
        </label>
      </div>
      <div className="space-y-2">
        <H hint="İsteğe bağlı: bir sıraya özel renk (ör. 1. sıra altın).">Sıraya özel renk</H>
        <div className="flex flex-wrap gap-2">
          {l.items.map((x, i) => (
            <label key={x.id} className="flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-[12px] font-semibold">
              #{i + 1}
              <input type="color" value={x.accent ?? l.accent} onChange={(e) => patch({ items: l.items.map((y, j) => (j === i ? { ...y, accent: e.target.value } : y)) })} className="h-6 w-8" />
              {x.accent && <button type="button" onClick={() => patch({ items: l.items.map((y, j) => (j === i ? { ...y, accent: null } : y)) })} className="text-red-600">×</button>}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 5 · geçiş & efekt ────────────────────────────────────────────────────────
function FxStep({ l, patch }: StepProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <H hint={l.studio === 'etkinlik' ? 'Etkinlikler arası ve bir etkinliğin medyaları arası geçiş. Video 150 sn\'yi aşmazsa tek parça üretilir ve geçişler gerçekten iki görüntüyü üst üste bindirir.' : 'Sıra kartından klibe geçiş. «Karışık» seçili pakete uygun geçişleri sırayla kullanır.'}>5 · Geçiş</H>
        <div className="flex flex-wrap gap-2">
          {LIST_TRANSITIONS.map((t) => (
            <button key={t} type="button" onClick={() => patch({ transition: t })} className={chip(l.transition === t)}>
              {LIST_TRANSITION_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <H hint="Bütün kliplere ve kartlara uygulanır.">Renk tonu</H>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f} type="button" onClick={() => patch({ filter: f })} className={chip(l.filter === f)}>
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <H>Efektler</H>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={l.zoomOn} onChange={(e) => patch({ zoomOn: e.target.checked })} /> Sıra kartında yakınlaşma (zoom) hareketi</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={l.bars} onChange={(e) => patch({ bars: e.target.checked })} /> Sinema bantları (üst/alt siyah şerit)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={l.sfxOn} onChange={(e) => patch({ sfxOn: e.target.checked })} /> Geçiş ses efektleri (whoosh, giriş ve kapanış sesi)</label>
        <p className="text-[12px] text-[rgb(var(--color-muted))]">Glitch, flaş, ritme oturan geçişler ve doku efektleri 2. aşamada eklenecek.</p>
      </div>
    </div>
  )
}

// ── 6 · çıktı ────────────────────────────────────────────────────────────────
function OutputStep(props: StepProps & { reload: () => Promise<void> } & ServerProps) {
  if (props.l.studio === 'etkinlik' && isCardTemplate(props.l.template)) return <CardsOutput {...props} />
  return <VideoOutput {...props} />
}

function VideoOutput({ l, patch, flush, takeServer, reload }: StepProps & { reload: () => Promise<void> } & ServerProps) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const problem = listRenderProblem(l)
  const warnings = listWarnings(l)
  const segs = useMemo(() => segmentIds(l), [l])
  const ready = segs.filter((s) => l.segments[s]?.key === segmentKey(l, s)).length
  const label = (s: string) => {
    if (s === 'intro') return 'Giriş'
    if (s === 'outro') return 'Kapanış'
    const rank = l.items.findIndex((x) => `i_${x.id}` === s) + 1
    return `#${rank}`
  }
  const whole = l.studio === 'etkinlik' && wholeEligible(l)
  const produce = async () => {
    if (!(await flush())) return
    setBusy(true)
    try {
      if (whole) {
        // tek parça: bölümler arası gerçek geçişler, tek iş
        const t0 = Date.now()
        setProgress('Video tek parça üretiliyor…')
        const r = await runReelJob(`${API}/${l.id}/render`, { whole: true }, (ms) => setProgress(`Video tek parça üretiliyor… ${Math.round(ms / 1000)} sn`))
        if (!r.ok) toast.error(r.error)
        else toast.success(`Video hazır (${Math.round((Date.now() - t0) / 1000)} sn)`)
        await reload()
        return
      }
      const todo = segs.filter((s) => l.segments[s]?.key !== segmentKey(l, s))
      let done = 0
      let failed: string | null = null
      const queue = [...todo]
      const worker = async () => {
        while (queue.length && !failed) {
          const s = queue.shift()!
          setProgress(`Parçalar üretiliyor: ${done}/${todo.length} (${label(s)})`)
          const r = await runReelJob(`${API}/${l.id}/render`, { segment: s })
          if (!r.ok) failed = `${label(s)}: ${r.error}`
          else if (r.job.status === 'failed') failed = `${label(s)}: ${r.job.error ?? 'üretilemedi'}`
          else done++
        }
      }
      await Promise.all([worker(), worker()])
      if (failed) {
        toast.error(failed)
        await reload()
        return
      }
      setProgress('Parçalar tek videoda birleştiriliyor…')
      const c = await runReelJob(`${API}/${l.id}/render`, { concat: true })
      if (!c.ok) toast.error(c.error)
      else if (c.job.status === 'failed') toast.error(c.job.error ?? 'Birleştirilemedi')
      else toast.success('Video hazır')
      await reload()
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }
  const out = l.render.status === 'ready' ? l.render : null
  return (
    <div className="space-y-4">
      <H hint={whole ? 'Video tek parça üretilir: etkinlikler arası geçişler («Geçiş & efekt» adımı) ve tek fon müziği. 150 sn\'yi aşan videolar parça parça üretilir.' : 'Her sıra ayrı parça olarak üretilir ve sonra yeniden kodlanmadan tek videoda birleşir. Değişmeyen parçalar yeniden üretilmez.'}>6 · Çıktı</H>
      {problem ? <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{problem}</div> : <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">Üretime hazır · tahmini süre {mmss(listTotalMs(l))}</div>}
      {warnings.length > 0 && <ul className="list-disc pl-5 text-[12px] text-amber-700 dark:text-amber-300">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      {!whole && <div className="flex flex-wrap gap-1.5">
        {segs.map((s) => (
          <span key={s} className={cn('rounded-md px-2 py-1 text-[11.5px] font-bold', l.segments[s]?.key === segmentKey(l, s) ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-[rgb(var(--color-border))]')}>
            {label(s)}
          </span>
        ))}
      </div>}
      {!whole && <p className="text-[12px] text-[rgb(var(--color-muted))]">Hazır parça: {ready}/{segs.length}</p>}
      {l.studio === 'etkinlik' && !whole && <p className="text-[12px] text-amber-700 dark:text-amber-300">Video 150 sn&apos;yi aştığı için parça parça üretilecek: etkinlikler arası geçiş kesme olur (bir etkinliğin kendi medyaları arasında geçiş vardır).</p>}
      <button type="button" disabled={!!problem || busy} onClick={() => void produce()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-fuchsia-600 px-5 text-sm font-extrabold text-white disabled:opacity-40">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />} {busy ? progress ?? 'Üretiliyor…' : out && out.key ? 'Videoyu yeniden üret' : 'Videoyu üret'}
      </button>
      {l.render.status === 'failed' && l.render.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">Son deneme: {l.render.error}</div>}
      {out?.outputUrl && (
        <div className="space-y-2">
          <video src={out.outputUrl} controls playsInline poster={out.coverUrl ?? undefined} className="max-h-[520px] w-full rounded-xl bg-black" />
          <div className="flex flex-wrap gap-2">
            <a href={out.outputUrl} download target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold">
              <Download className="h-4 w-4" /> MP4 indir {out.seconds ? `(${mmss(out.seconds * 1000)})` : ''}
            </a>
            {out.coverUrl && (
              <a href={out.coverUrl} download target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold">
                <ImageIcon className="h-4 w-4" /> Kapak
              </a>
            )}
            <button type="button" onClick={() => void navigator.clipboard.writeText(out.outputUrl!).then(() => toast.success('Bağlantı kopyalandı'))} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold">
              <Copy className="h-4 w-4" /> Bağlantıyı kopyala
            </button>
          </div>
        </div>
      )}
      <SharePanel l={l} patch={patch} flush={flush} />
    </div>
  )
}

// ── paylaşım ─────────────────────────────────────────────────────────────────
type ShareAccount = { accountId: string; platform: SharePlatform; displayName: string; username: string | null; selectable: boolean; reason: string | null }
type ShareOutcome = { state: 'running' | 'ok' | 'fail' | 'uncertain'; text: string }

function SharePanel({ l, patch, flush, media = 'video' }: StepProps & Pick<ServerProps, 'flush'> & { media?: 'video' | 'cards' }) {
  const [format, setFormat] = useState<ShareFormat>('reel')
  const [accounts, setAccounts] = useState<ShareAccount[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<Record<string, ShareOutcome>>({})
  const ready = media === 'cards' ? l.cards.status === 'ready' && l.cards.urls.length > 0 && l.cards.key === cardsKey(l) : l.render.status === 'ready' && !!l.render.outputUrl && l.render.key === effectiveRenderKey(l)
  const renderKey = l.render.key
  useEffect(() => {
    let live = true
    setAccounts(null)
    void call<{ accounts: ShareAccount[] }>('GET', `${API}/${l.id}/share?format=${format}&media=${media}`).then((r) => {
      if (!live) return
      if (r.ok) {
        setAccounts(r.data.accounts)
        // etkinlik videosu: önceden seçilen hesap işaretli gelir
        if (l.accountId && r.data.accounts.some((a) => a.accountId === l.accountId && a.selectable)) setPicked((cur) => (cur.size ? cur : new Set([l.accountId!])))
      } else {
        setAccounts([])
        toast.error(r.error)
      }
    })
    return () => {
      live = false
    }
  }, [l.id, l.accountId, format, renderKey, media, l.cards.key])
  const toggle = (id: string) =>
    setPicked((cur) => {
      const n = new Set(cur)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const share = async () => {
    const ids = (accounts ?? []).filter((a) => a.selectable && picked.has(a.accountId))
    if (!ids.length) return
    const names = ids.map((a) => `${SHARE_PLATFORM_NAME[a.platform]} · ${a.displayName}`).join('\n')
    if (!window.confirm(`Video şu hesaplarda HERKESE AÇIK paylaşılacak:\n\n${names}\n\nDevam edilsin mi?`)) return
    if (!(await flush())) return
    setBusy(true)
    try {
      for (const a of ids) {
        setOut((o) => ({ ...o, [a.accountId]: { state: 'running', text: 'Gönderiliyor…' } }))
        const r = await runReelJob(`${API}/${l.id}/share`, { accountId: a.accountId, format, media })
        let res: ShareOutcome
        if (!r.ok) res = { state: 'fail', text: r.error }
        else {
          const inner = (r.job.result as { result?: { success?: boolean; error?: string; ledgerStatus?: string } } | null)?.result
          if (r.job.status === 'failed') res = { state: 'fail', text: r.job.error ?? 'Paylaşılamadı' }
          else if (inner?.success) res = { state: 'ok', text: 'Paylaşıldı' }
          else if (inner?.ledgerStatus === 'uncertain') res = { state: 'uncertain', text: 'Sonuç belirsiz — platform yanıtı kayboldu; hesabı kontrol edin (tekrar gönderilmedi)' }
          else res = { state: 'fail', text: inner?.error ?? 'Paylaşılamadı' }
        }
        setOut((o) => ({ ...o, [a.accountId]: res }))
      }
    } finally {
      setBusy(false)
    }
  }
  const n = (accounts ?? []).filter((a) => a.selectable && picked.has(a.accountId)).length
  return (
    <div className="space-y-3 rounded-2xl border border-[rgb(var(--color-border))] p-3">
      <H hint="Hesap Merkezi / Hesaplar ekranında bağladığınız Instagram, Facebook, Threads ve YouTube hesapları. Aynı video aynı hesaba ikinci kez gönderilmez.">Hesaplarda paylaş</H>
      <label className="block text-[12px] font-semibold">
        Paylaşım metni
        <textarea value={captionFor(l)} onChange={(e) => patch({ caption: e.target.value })} rows={7} className={field} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => patch({ caption: '' })} className="h-8 rounded-lg border border-[rgb(var(--color-border))] px-2.5 text-[12px] font-semibold">
          Otomatik metne dön
        </button>
        <span className="text-[12px] text-[rgb(var(--color-muted))]">{captionFor(l).length}/2200 · otomatik metin listeden yeniden oluşur</span>
      </div>
      {media === 'video' ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFormat('reel')} className={chip(format === 'reel')}>Reels / video</button>
          <button type="button" onClick={() => setFormat('video_story')} className={chip(format === 'video_story')}>Hikâye (≤ 60 sn)</button>
        </div>
      ) : (
        <p className="text-[12px] text-[rgb(var(--color-muted))]">Instagram: {l.cards.urls.length > 1 ? `kaydırmalı gönderi (${l.cards.urls.length} kare)` : 'tek görselli gönderi'} · Facebook: yalnız tek kart. Metin aynen gider (NaHaber bağlantısı / etiketi eklenmez).</p>
      )}
      {!ready && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{media === 'cards' ? 'Paylaşmak için önce kartları (güncel hâliyle) üretin.' : 'Paylaşmak için önce videoyu (güncel hâliyle) üretin.'}</div>}
      {!accounts ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : !accounts.length ? (
        <p className="text-sm text-[rgb(var(--color-muted))]">Bu biçim için bağlı, etkin hesap yok. Hesapları «Hesap Merkezi» ya da «Hesaplar» ekranından ekleyin.</p>
      ) : (
        <div className="space-y-1.5">
          {accounts.map((a) => {
            const o = out[a.accountId]
            return (
              <label key={a.accountId} className={cn('flex items-start gap-2 rounded-lg border px-2.5 py-2 text-sm', a.selectable ? 'border-[rgb(var(--color-border))]' : 'border-dashed border-[rgb(var(--color-border))] opacity-60')}>
                <input type="checkbox" disabled={!a.selectable || busy} checked={picked.has(a.accountId)} onChange={() => toggle(a.accountId)} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <b>{SHARE_PLATFORM_NAME[a.platform]}</b> · {a.displayName}
                  {a.username ? <span className="text-[rgb(var(--color-muted))]"> @{a.username}</span> : null}
                  {!a.selectable && a.reason && <span className="block text-[12px] text-amber-700 dark:text-amber-300">{a.reason}</span>}
                  {o && (
                    <span className={cn('block text-[12px] font-semibold', o.state === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : o.state === 'running' ? 'text-[rgb(var(--color-muted))]' : o.state === 'uncertain' ? 'text-amber-700 dark:text-amber-300' : 'text-red-600')}>
                      {o.state === 'running' && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                      {o.state === 'ok' && <Check className="mr-1 inline h-3 w-3" />}
                      {o.text}
                    </span>
                  )}
                </span>
              </label>
            )
          })}
        </div>
      )}
      <button type="button" disabled={!ready || !n || busy} onClick={() => void share()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-fuchsia-600 px-4 text-sm font-extrabold text-white disabled:opacity-40">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Seçilen {n || ''} hesapta paylaş
      </button>
      <p className="text-[12px] text-[rgb(var(--color-muted))]">TikTok paylaşımı (TikTok&apos;un kendi gizlilik / onay penceresiyle) sonraki adımda eklenecek. Uzun videolarda (Top 20) Instagram&apos;ın işlemesi birkaç dakika sürebilir.</p>
    </div>
  )
}

// ── ETKİNLİK: şablon ve renk ────────────────────────────────────────────────
const SWATCHES = ['#e11d48', '#ff2d55', '#f59e0b', '#facc15', '#22c55e', '#a3e635', '#38bdf8', '#2563eb', '#a855f7', '#ff48b0', '#ffffff', '#0a0a0a']
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [txt, setTxt] = useState(value)
  useEffect(() => setTxt(value), [value])
  return (
    <div className="space-y-1.5">
      <div className="text-[12px] font-bold">{label}</div>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} seç`} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-[rgb(var(--color-border))] bg-transparent" />
        <input aria-label={`${label} (hex)`} value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={() => /^#[0-9a-fA-F]{6}$/.test(txt) ? onChange(txt.toLowerCase()) : setTxt(value)} className="h-9 w-24 rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 font-mono text-sm" />
      </div>
      <div className="flex flex-wrap gap-1">
        {SWATCHES.map((c) => (
          <button key={c} type="button" aria-label={c} onClick={() => onChange(c)} className={cn('h-6 w-6 rounded-full border', value.toLowerCase() === c ? 'ring-2 ring-fuchsia-500 ring-offset-1' : 'border-[rgb(var(--color-border))]')} style={{ background: c }} />
        ))}
      </div>
    </div>
  )
}

function TemplateStep({ l, patch }: StepProps) {
  const [tab, setTab] = useState<'kart' | 'video'>(isCardTemplate(l.template) ? 'kart' : 'video')
  const list: readonly EventTemplate[] = tab === 'kart' ? CARD_TEMPLATES : VIDEO_TEMPLATES
  const sug = suggestTemplates(l.items.length, tab)
  const T = TEMPLATE_INFO[l.template]
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <H hint="Kart şablonları tek kare ya da kaydırmalı görsel (JPEG) üretir; video şablonları Reels / Hikâye üretir. Şablon değişince renkler şablonun varsayılanına döner.">4 · Şablon</H>
        <div className="flex gap-2">
          <button type="button" onClick={() => setTab('video')} className={chip(tab === 'video')}><Film className="h-4 w-4" /> Video şablonları ({VIDEO_TEMPLATES.length})</button>
          <button type="button" onClick={() => setTab('kart')} className={chip(tab === 'kart')}><ImageIcon className="h-4 w-4" /> Kart şablonları ({CARD_TEMPLATES.length})</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => {
            const I = TEMPLATE_INFO[t]
            const on = l.template === t
            return (
              <button key={t} type="button" onClick={() => patch({ template: t, accent: I.accent, bgColor: I.bg, textColor: I.text })} className={cn(card(on), 'flex gap-3')}>
                <span aria-hidden="true" className="flex h-16 w-11 shrink-0 flex-col justify-end overflow-hidden rounded-md border border-[rgb(var(--color-border))]" style={{ background: I.bg }}>
                  <span className="mx-1 mb-1 h-1.5 rounded-full" style={{ background: I.accent }} />
                  <span className="mx-1 mb-1.5 h-1 rounded-full opacity-70" style={{ background: I.text }} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-sm font-extrabold">{on && <Check className="h-4 w-4 text-fuchsia-600" />}{I.label}</span>
                  <span className="block text-[12px] text-[rgb(var(--color-muted))]">{I.desc}</span>
                  <span className="mt-0.5 block text-[11.5px] font-semibold text-fuchsia-700 dark:text-fuchsia-300">{I.fits}{sug.includes(t) ? ' · önerilen' : ''}</span>
                </span>
              </button>
            )
          })}
        </div>
        {isCardTemplate(l.template) && <p className="text-[12px] text-[rgb(var(--color-muted))]">Bu şablonla {cardCount(l.template as CardTemplate, l.items.length)} kare üretilir{T.max && l.items.length > T.max ? ` (ilk ${T.max} etkinlik kullanılır)` : ''}.</p>}
      </div>
      <div className="space-y-2">
        <H hint="Bütün kartlara / video katmanlarına uygulanır. Hesap ya da il rengini girebilirsiniz.">Renkler</H>
        <div className="grid gap-4 sm:grid-cols-3">
          <ColorField label="Vurgu" value={l.accent} onChange={(v) => patch({ accent: v })} />
          <ColorField label="Zemin" value={l.bgColor} onChange={(v) => patch({ bgColor: v })} />
          <ColorField label="Yazı" value={l.textColor} onChange={(v) => patch({ textColor: v })} />
        </div>
        <button type="button" onClick={() => patch({ accent: T.accent, bgColor: T.bg, textColor: T.text })} className="h-8 rounded-lg border border-[rgb(var(--color-border))] px-2.5 text-[12px] font-semibold">Şablonun renklerine dön</button>
      </div>
    </div>
  )
}

// ── ETKİNLİK: fon müziği seçici ─────────────────────────────────────────────
function MusicPicker({ l, patch, flush, takeServer }: StepProps & ServerProps) {
  const fileIn = useRef<HTMLInputElement>(null)
  const [pct, setPct] = useState<number | null>(null)
  const [startSec, setStartSec] = useState(0)
  const [link, setLink] = useState('')
  const send = async (body: Record<string, unknown>) => {
    await flush()
    setPct((v) => v ?? 100)
    const r = await call<{ list: ListProject }>('POST', `${API}/${l.id}/media`, { role: 'music', startMs: Math.round(startSec * 1000), ...body })
    setPct(null)
    if (!r.ok) return toast.error(r.error)
    takeServer(r.data.list)
    toast.success('Müzik eklendi')
  }
  const upload = async (f: File | undefined) => {
    if (!f) return
    if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|wav)$/i.test(f.name)) return toast.error('MP3 / M4A / WAV seçin')
    if (f.size > 60 * 1024 * 1024) return toast.error('60 MB sınırını aşıyor')
    try {
      setPct(0)
      const url = await uploadAudio(f, l.id, setPct)
      await send({ url, name: f.name })
    } catch (e) {
      setPct(null)
      toast.error(`Yüklenemedi (${e instanceof Error ? e.message.slice(0, 80) : 'hata'})`)
    }
  }
  const tr = l.musicTrack
  return (
    <div className="space-y-2 rounded-lg border border-[rgb(var(--color-border))] p-2.5">
      <div className="text-[12px] font-bold">Fon müziği</div>
      {tr ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">🎵 {tr.name}</span>
          <span className="text-[12px] text-[rgb(var(--color-muted))]">{mmss(tr.durationMs)} · {Math.round(tr.startMs / 1000)}. sn&apos;den</span>
          <audio src={tr.url} controls className="h-8" />
          <button type="button" onClick={() => patch({ musicTrack: null })} className="text-[12px] font-semibold text-red-600">Kaldır (hazır müziğe dön)</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => patch({ musicPreset: 'auto' })} className={chip(l.musicPreset === 'auto')}>Pakete göre</button>
          {MUSIC_PRESETS.map((m) => (
            <button key={m} type="button" onClick={() => patch({ musicPreset: m })} className={chip(l.musicPreset === m)}>{MUSIC_LABEL[m]}</button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <input ref={fileIn} type="file" accept="audio/*,.mp3,.m4a,.wav" hidden onChange={(e) => void upload(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
        <button type="button" disabled={pct !== null} onClick={() => fileIn.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-fuchsia-500 px-2.5 font-semibold text-fuchsia-700 disabled:opacity-50 dark:text-fuchsia-300">
          {pct !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {pct !== null ? `%${pct}` : 'Kendi müziğini yükle'}
        </button>
        <label className="flex items-center gap-1">başlangıç <input type="number" min={0} max={1800} value={startSec} onChange={(e) => setStartSec(Math.max(0, Number(e.target.value) || 0))} className="w-16 rounded border border-[rgb(var(--color-border))] bg-transparent px-1.5 py-1" /> sn</label>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="ya da https://… .mp3 bağlantısı" className="h-8 min-w-[180px] flex-1 rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2" />
        <button type="button" disabled={!link.trim() || pct !== null} onClick={() => void send({ link: link.trim() })} className="h-8 rounded-lg border border-[rgb(var(--color-border))] px-2.5 font-semibold disabled:opacity-40">Ekle</button>
      </div>
      <label className="block text-[12px] font-semibold">
        Müzik sesi %{Math.round(l.musicVolume * 100)}
        <input type="range" min={0.05} max={1} step={0.05} value={l.musicVolume} onChange={(e) => patch({ musicVolume: Number(e.target.value) })} className="w-full" />
      </label>
      <p className="text-[11.5px] text-[rgb(var(--color-muted))]">Yüklenen parça seçilen saniyeden kesilir (en çok 5 dk). Müziğin yayın hakkı sizin sorumluluğunuzdadır.</p>
    </div>
  )
}

// ── ETKİNLİK: ek medya (aynı etkinliğe 2.–4. görsel / video) ────────────────
function ExtrasEditor({ l, x, upd, flush, takeServer }: { l: ListProject; x: ListItem; upd: (p: Partial<ListItem>) => void } & ServerProps) {
  const fileIn = useRef<HTMLInputElement>(null)
  const [pct, setPct] = useState<number | null>(null)
  const [link, setLink] = useState('')
  const extras = x.extras ?? []
  const add = async (body: Record<string, unknown>) => {
    await flush()
    const r = await call<{ list: ListProject }>('POST', `${API}/${l.id}/media`, { role: 'extra', itemId: x.id, ...body })
    setPct(null)
    if (!r.ok) return toast.error(r.error)
    takeServer(r.data.list)
  }
  const upload = async (f: File | undefined) => {
    if (!f) return
    const isVideo = f.type.startsWith('video/')
    if (!isVideo && !f.type.startsWith('image/')) return toast.error('Yalnız video ya da görsel')
    try {
      setPct(0)
      const url = await uploadFile(f, l.id, setPct)
      await add({ url, type: isVideo ? 'video' : 'image', name: f.name })
    } catch (e) {
      setPct(null)
      toast.error(`Yüklenemedi (${e instanceof Error ? e.message.slice(0, 80) : 'hata'})`)
    }
  }
  const setLen = (i: number, sec: number) => upd({ extras: extras.map((m, j) => (j !== i ? m : { ...m, outMs: Math.min(m.kind === 'image' ? 30_000 : (m.durationMs ?? 60_000), m.inMs + Math.round(sec * 1000)) })) })
  const move = (i: number, d: number) => {
    const n = [...extras]
    const j = i + d
    if (j < 0 || j >= n.length) return
    ;[n[i], n[j]] = [n[j]!, n[i]!]
    upd({ extras: n })
  }
  return (
    <div className="space-y-2 rounded-xl border border-[rgb(var(--color-border))] p-3">
      <div className="text-sm font-extrabold">Ek medya ({extras.length}/{EXTRAS_MAX}) <span className="font-normal text-[12px] text-[rgb(var(--color-muted))]">ana medyadan sonra, aralarında geçişle</span></div>
      {extras.map((m, i) => (
        <div key={m.url} className="flex flex-wrap items-center gap-2 text-[12px]">
          {m.kind === 'image' ? <img src={m.url} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded bg-black text-white"><Film className="h-4 w-4" /></span>}
          <span className="min-w-0 flex-1 truncate font-semibold">{m.name}</span>
          <label className="flex items-center gap-1">süre <input type="number" min={2} max={30} step={0.5} value={(m.outMs - m.inMs) / 1000} onChange={(e) => setLen(i, Math.max(2, Number(e.target.value) || 2))} className="w-16 rounded border border-[rgb(var(--color-border))] bg-transparent px-1.5 py-1" /> sn</label>
          <button type="button" title="Yukarı" onClick={() => move(i, -1)} className="rounded border border-[rgb(var(--color-border))] p-1"><ArrowUp className="h-3.5 w-3.5" /></button>
          <button type="button" title="Aşağı" onClick={() => move(i, 1)} className="rounded border border-[rgb(var(--color-border))] p-1"><ArrowDown className="h-3.5 w-3.5" /></button>
          <button type="button" title="Kaldır" onClick={() => upd({ extras: extras.filter((_, j) => j !== i) })} className="rounded border border-[rgb(var(--color-border))] p-1 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      {extras.length < EXTRAS_MAX && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <input ref={fileIn} type="file" accept="video/*,image/*" hidden onChange={(e) => void upload(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
          <button type="button" disabled={pct !== null} onClick={() => fileIn.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-fuchsia-500 px-2.5 font-semibold text-fuchsia-700 disabled:opacity-50 dark:text-fuchsia-300">
            {pct !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} {pct !== null ? `%${pct}` : 'Görsel / video ekle'}
          </button>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="ya da doğrudan dosya bağlantısı" className="h-8 min-w-[180px] flex-1 rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2" />
          <button type="button" disabled={!link.trim() || pct !== null} onClick={() => { setPct(100); void add({ link: link.trim() }).then(() => setLink('')) }} className="h-8 rounded-lg border border-[rgb(var(--color-border))] px-2.5 font-semibold disabled:opacity-40">Bağlantıdan ekle</button>
        </div>
      )}
    </div>
  )
}

// ── ETKİNLİK: kart çıktısı ──────────────────────────────────────────────────
function CardsOutput({ l, patch, flush, reload }: StepProps & { reload: () => Promise<void> } & ServerProps) {
  const [busy, setBusy] = useState(false)
  const current = l.cards.status === 'ready' && l.cards.key === cardsKey(l) && l.cards.urls.length > 0
  const n = cardCount(l.template as CardTemplate, l.items.length)
  const produce = async () => {
    if (!(await flush())) return
    setBusy(true)
    try {
      const r = await runReelJob(`${API}/${l.id}/render`, { cards: true })
      if (!r.ok) toast.error(r.error)
      else toast.success('Kartlar hazır')
      await reload()
    } finally {
      setBusy(false)
    }
  }
  const ratio = l.aspect === '9:16' ? '9 / 16' : l.aspect === '1:1' ? '1 / 1' : l.aspect === '16:9' ? '16 / 9' : '4 / 5'
  return (
    <div className="space-y-4">
      <H hint={`${TEMPLATE_INFO[l.template].label} · ${n} kare · biçim ${l.aspect} («Medya & süre» adımında değişir; Instagram gönderisi için 4:5 önerilir).`}>6 · Kartlar</H>
      <div className="flex flex-wrap gap-2">
        {(['4:5', '1:1', '9:16'] as const).map((a) => (
          <button key={a} type="button" onClick={() => patch({ aspect: a })} className={chip(l.aspect === a)}>{a}{a === '4:5' ? ' gönderi' : a === '1:1' ? ' kare' : ' hikâye'}</button>
        ))}
      </div>
      <button type="button" disabled={busy} onClick={() => void produce()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-fuchsia-600 px-5 text-sm font-extrabold text-white disabled:opacity-40">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />} {busy ? 'Kartlar çiziliyor…' : current ? 'Kartları yeniden üret' : 'Kartları üret'}
      </button>
      {l.cards.status === 'error' && l.cards.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">Son deneme: {l.cards.error}</div>}
      {l.cards.urls.length > 0 && (
        <div className="space-y-2">
          {!current && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">Proje değişti — kartları yeniden üretin.</div>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {l.cards.urls.map((u, i) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-[rgb(var(--color-border))]" style={{ aspectRatio: ratio }}>
                <img src={u} alt={`Kart ${i + 1}`} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
          <p className="text-[12px] text-[rgb(var(--color-muted))]">Karta tıklayınca tam boyutu açılır (indirmek için sağ tık › kaydet).</p>
        </div>
      )}
      <SharePanel l={l} patch={patch} flush={flush} media="cards" />
    </div>
  )
}

// ── önizleme (yaklaşık) ──────────────────────────────────────────────────────
function Preview({ l, item, rank }: { l: ListProject; item: ListItem; rank: number }) {
  const ratio = l.aspect === '9:16' ? '9 / 16' : l.aspect === '4:5' ? '4 / 5' : l.aspect === '1:1' ? '1 / 1' : '16 / 9'
  const accent = item.accent ?? l.accent
  const P = LIST_PACK_INFO[l.pack]
  const neon = P.rankLook === 'neon'
  const serif = P.rankLook === 'cinema' || P.rankLook === 'soft'
  const bg = item.coverUrl ?? (item.media?.kind === 'image' ? item.media.url : null)
  return (
    <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
      <div className="text-[12px] font-bold text-[rgb(var(--color-muted))]">Önizleme (yaklaşık) · sıra kartı</div>
      <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-2xl bg-neutral-900" style={{ aspectRatio: ratio }}>
        {bg ? <img src={bg} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-md" /> : item.media?.kind === 'video' ? <video src={`${item.media.url}#t=${item.media.inMs / 1000}`} muted playsInline className="absolute inset-0 h-full w-full scale-110 object-cover blur-md" /> : null}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/80" />
        {(l.bars || P.rankLook === 'cinema') && (
          <>
            <div className="absolute inset-x-0 top-0 h-[8%] bg-black" />
            <div className="absolute inset-x-0 bottom-0 h-[8%] bg-black" />
          </>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center text-white">
          <div className="text-[10px] font-bold tracking-widest opacity-80">{modeOf(l.listType) === 'urun' ? `${String(rank).padStart(2, '0')} / ${String(l.items.length).padStart(2, '0')}` : rank === 1 ? 'ZİRVE' : `TOP ${l.items.length}`}</div>
          {modeOf(l.listType) === 'liste' && <div className="font-black leading-none" style={{ fontSize: 110, color: P.rankLook === 'cinema' ? accent : '#fff', textShadow: neon ? `0 0 18px ${accent}, 0 0 36px ${accent}` : P.rankLook === 'bold' ? `6px 6px 0 ${accent}` : '0 4px 16px rgba(0,0,0,.6)' }}>
            {rank}
          </div>}
          {item.price && <div className="mt-1 text-[15px] font-black" style={{ color: accent }}>{item.price}</div>}
          <div className={cn('mt-2 text-[20px] leading-tight', serif ? 'font-serif italic' : 'font-black uppercase')}>{item.title || 'Şarkı / film adı'}</div>
          {item.subtitle && <div className="mt-1 text-[13px] font-semibold" style={{ color: neon ? accent : 'rgba(255,255,255,.88)' }}>{item.subtitle}</div>}
          <div className="mt-2 h-1 w-14 rounded" style={{ background: accent }} />
          {item.change !== 'none' && <div className="mt-2 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold">{item.change === 'new' ? 'YENİ' : item.change === 'up' ? '▲ YÜKSELDİ' : item.change === 'down' ? '▼ DÜŞTÜ' : '= AYNI'}</div>}
        </div>
        {l.platformLogoUrl && l.logoPlacement === 'kose' && <img src={l.platformLogoUrl} alt="" className="absolute right-3 top-[9%] h-6 object-contain" />}
      </div>
      <div className="rounded-xl border border-[rgb(var(--color-border))] p-2.5 text-[12px]">
        <div><b>Paket:</b> {P.label} · <b>Ses:</b> {l.voiceOn ? AD_VOICES[l.voiceId].name : 'kapalı'}</div>
        <div><b>Geçiş:</b> {LIST_TRANSITION_LABEL[l.transition]} · <b>Ton:</b> {FILTER_LABEL[l.filter]}</div>
        <div><b>Alt bant:</b> {l.textOn ? AD_TEXT_STYLE_INFO[l.textStyle].label : 'kapalı'}</div>
        <div><b>Klip:</b> {item.media ? sec(clipLenMs(item.media)) : 'yok'}</div>
      </div>
    </aside>
  )
}

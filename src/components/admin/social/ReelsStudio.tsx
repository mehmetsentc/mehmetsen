'use client'

/**
 * REELS-4 — NaHaber Reels Stüdyosu (professional 3-pane layout).
 *   Left   : news picker (search, filters; single select or 2–7 ordered for the digest)
 *   Center : sticky 9:16 preview, render / re-render / MP4 / share, media-rights banner
 *   Right  : tabs — Ayarlar (presenter, script, intro, outro, music) · Paylaş · Sesler & sunucular
 * Modes: Tek haber · Günün Öne Çıkanları · Video yükle (yakında).
 * Each pane scrolls on its own; the page itself does not scroll on desktop.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Clapperboard, Download, Film, Image as ImageIcon, Loader2, Pause, Play, RefreshCw, Search, Send, Sparkles, X } from 'lucide-react'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import { ManualShareFlow } from './ManualShareFlow'
import { ReelsVoiceLibrary } from './ReelsVoiceLibrary'
import { GENDER_TEXT, reelsCall, voiceLabel, type VoicesResponse } from './reelsApi'

// ── types ────────────────────────────────────────────────────────────────────
type NewsPick = {
  newsId: string
  title: string
  category: string
  city: string | null
  citySlug: string | null
  publishedAt: number | null
  imageUrl: string | null
  hasVideo: boolean
  /** file → reel uses the story's video; youtube / embed → photos (YouTube is never downloaded). */
  videoKind?: 'file' | 'youtube' | 'embed' | 'none'
  mediaOk: boolean
  /** media cleared by the social rights check / editor approval (without the «always use» policy) */
  rightsOk?: boolean
  approved: boolean
  featured: boolean
}
type Persona = {
  id: string
  name: string
  title: string
  styles: string[]
  voice: string
  rate: number
  writingStyle: string
  geminiStyle: string
  geminiVoice: string
  useGemini: boolean
  photoUrl: string | null
  showCard: boolean
}
type PersonasView = {
  personas: Persona[]
  defaults: { intro: string; outro: string; music: string; cover?: string; layout?: string; postTheme?: string; alwaysUseMedia?: boolean }
  gemini: { enabled: boolean; monthlyUsd: number; usedUsd: number; month: string }
  options: { intros: string[]; outros: string[]; music: string[]; transitions: string[]; covers?: Array<{ id: string; label: string }> }
}
type ReelResult = {
  newsId: string
  url: string
  reused: boolean
  seconds?: number
  media: 'image' | 'video' | 'none'
  mediaBasis: string
  voiceText?: string
  voice?: string
  rate?: number
  style?: string
  persona?: { id: string; name: string; title: string }
  engine?: 'gemini' | 'google'
  editor?: 'ai' | 'rules' | 'studio'
  intro?: string
  outro?: string
  music?: string
  note?: string
  coverUrl?: string | null
}
type LibraryItem = { newsId: string; slug: string | null; headline: string; url: string; coverUrl: string | null; seconds: number | null; persona: string | null; style: string | null; media: string | null; updatedAt: string | null; renders: number }
type Digest = { id: string; newsIds: string[]; title: string; url: string; caption: string; seconds: number; createdAt: number; lines: string[] }
type Usage = { month: string; overageApproved: boolean; tiers: Array<{ tier: string; used: number; cap: number }> }
type Mode = 'single' | 'digest' | 'library' | 'upload'
type Tab = 'settings' | 'share' | 'voices'

const INTRO_TEXT: Record<string, [string, string]> = {
  list: ['Liste kartı', 'haberler sırayla'],
  soft: ['Yumuşak', 'logo belirir'],
  slide: ['Kayan', 'çizgi + panel'],
  perde: ['Perde', 'lacivert açılır'],
  zoom: ['Yakınlaşma', 'logo zoom'],
  minimal: ['Minimal', 'girişsiz'],
}
const OUTRO_TEXT: Record<string, [string, string]> = {
  logo: ['Logo + nahaber.com', '2 sn'],
  follow: ['Takip et çağrısı', '@nahaber_com'],
  short: ['Kısa kapanış', '1 sn'],
}
const MUSIC_TEXT: Record<string, [string, string]> = {
  auto: ['Türe göre', 'otomatik'],
  sakin: ['Sakin', 'piyano'],
  modern: ['Modern', 'hafif ritim'],
  akustik: ['Akustik', 'gitar'],
  kurumsal: ['Kurumsal', 'bülten'],
  enerjik: ['Enerjik', 'spor'],
  sondakika: ['Son dakika', 'gergin'],
  lofi: ['Lo-fi', 'akşam'],
  none: ['Müziksiz', ''],
}
const COVER_TEXT: Record<string, [string, string]> = {
  foto: ['Foto', 'tam foto, manşet + özet'],
  manset: ['Manşet', 'foto + büyük başlık'],
  panel: ['Panel', 'foto kartı + lacivert'],
  bulten: ['Bülten', 'foto + beyaz panel'],
}
const LAYOUT_TEXT: Record<string, [string, string]> = {
  dinamik: ['Dinamik', 'tam ekran, ortada yazı'],
  bulten: ['Bülten', 'foto üstte, beyaz panel'],
  kart: ['Kart', 'foto kartı, lacivert'],
}
const TRANSITION_TEXT: Record<string, string> = { fade: 'Yumuşak geçiş', slide: 'Kaydır', number: 'Numara kartı' }
const STYLE_COLOR: Record<string, string> = { haber: '#e31b23', spor: '#13a058', magazin: '#d81b72', analiz: '#e0a100' }
const DIGEST_TITLES = ['Günün Öne Çıkanları', 'Sabah Bülteni', 'Akşam Bülteni', 'Haftanın Özeti', "Çanakkale'de Bugün"]

function fold(s: string): string {
  return s.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')
}

/** Accepts a raw id or a CMS edit URL (/admin/news/{id}/edit). */
export function parseNewsId(input: string): string {
  const s = input.trim()
  const m = s.match(/\/admin\/news\/([A-Za-z0-9_-]{4,64})/)
  return m ? m[1]! : s
}

// ── small UI pieces ─────────────────────────────────────────────────────────
function OptionGrid({ items, value, onChange, labels, cols = 3 }: { items: string[]; value: string; onChange: (v: string) => void; labels: Record<string, [string, string]>; cols?: number }) {
  return (
    <div className={cn('grid gap-1.5', cols === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {items.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={cn(
            'rounded-lg border px-2 py-1.5 text-center text-[11px] font-bold transition',
            value === k ? 'border-red-600 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-surface))]',
          )}
        >
          {labels[k]?.[0] ?? k}
          {labels[k]?.[1] ? <span className="block text-[10px] font-medium text-[rgb(var(--color-muted))]">{labels[k][1]}</span> : null}
        </button>
      ))}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-b border-[rgb(var(--color-border))] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-extrabold">{title}</h4>
        {hint ? <span className="text-[10px] font-semibold text-[rgb(var(--color-muted))]">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-xs">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={cn('relative h-5 w-9 shrink-0 rounded-full transition', on ? 'bg-red-600' : 'bg-slate-300 dark:bg-slate-600')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', on ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

function MusicPreview({ name }: { name: string }) {
  const [playing, setPlaying] = useState(false)
  const ref = useRef<HTMLAudioElement | null>(null)
  if (name === 'auto' || name === 'none') return null
  return (
    <button
      type="button"
      onClick={() => {
        if (playing) {
          ref.current?.pause()
          setPlaying(false)
          return
        }
        const a = new Audio(`/api/reels/music/${name}`)
        a.volume = 0.7
        a.onended = () => setPlaying(false)
        ref.current = a
        void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
      }}
      className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--color-border))] px-2 py-0.5 text-[10px] font-bold"
    >
      {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />} {MUSIC_TEXT[name]?.[0] ?? name} dinle
    </button>
  )
}

// ── main ────────────────────────────────────────────────────────────────────
export function ReelsStudio() {
  const [mode, setMode] = useState<Mode>('single')
  const [tab, setTab] = useState<Tab>('settings')
  const [ready, setReady] = useState(false)

  // data
  const [news, setNews] = useState<NewsPick[]>([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'video' | 'media' | 'canakkale' | 'featured'>('all')
  const [pv, setPv] = useState<PersonasView | null>(null)
  const [voices, setVoices] = useState<VoicesResponse | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)

  // single
  const [picked, setPicked] = useState<NewsPick | null>(null)
  const [personaId, setPersonaId] = useState<string>('') // '' = AI editor picks
  const [voiceOverride, setVoiceOverride] = useState('')
  const [script, setScript] = useState('')
  const [scriptSource, setScriptSource] = useState<'ai' | 'rules' | 'studio' | null>(null)
  const [intro, setIntro] = useState('soft')
  const [outro, setOutro] = useState('logo')
  const [music, setMusic] = useState('auto')
  const [cover, setCover] = useState('foto')
  const [layout, setLayout] = useState('dinamik')
  const [result, setResult] = useState<ReelResult | null>(null)
  const [busy, setBusy] = useState<null | 'plan' | 'render' | 'approve' | 'digest'>(null)
  const [error, setError] = useState<string | null>(null)
  const [shareFmt, setShareFmt] = useState<'reel' | 'video_story'>('reel')

  // digest
  const [selected, setSelected] = useState<NewsPick[]>([])
  const [dTitle, setDTitle] = useState(DIGEST_TITLES[0]!)
  const [dIntro, setDIntro] = useState('list')
  const [dTransition, setDTransition] = useState('fade')
  const [dOutro, setDOutro] = useState('logo')
  const [dMusic, setDMusic] = useState('modern')
  const [dPersonaMode, setDPersonaMode] = useState<'single' | 'perStyle'>('single')
  const [digest, setDigest] = useState<Digest | null>(null)

  const loadNews = useCallback(async (query: string) => {
    setNewsLoading(true)
    const r = await reelsCall<{ items: NewsPick[] }>('GET', `/api/admin/social/reels/news?q=${encodeURIComponent(query)}`)
    setNewsLoading(false)
    if (r.ok) setNews(r.data.items)
  }, [])
  const loadPersonas = useCallback(async () => {
    const r = await reelsCall<PersonasView>('GET', '/api/admin/social/reels/personas')
    if (r.ok) {
      setPv(r.data)
      setIntro((v) => (v === 'soft' ? r.data.defaults.intro : v))
      setOutro((v) => (v === 'logo' ? r.data.defaults.outro : v))
      setMusic((v) => (v === 'auto' ? r.data.defaults.music : v))
      setCover((v) => (v === 'foto' ? r.data.defaults.cover ?? 'foto' : v))
      setLayout((v) => (v === 'dinamik' ? r.data.defaults.layout ?? 'dinamik' : v))
    }
  }, [])
  const loadUsage = useCallback(async () => {
    const r = await reelsCall<{ usage: Usage }>('GET', '/api/admin/social/reels/tts-usage')
    if (r.ok) setUsage(r.data.usage)
  }, [])
  const loadVoices = useCallback(async () => {
    const r = await reelsCall<VoicesResponse>('GET', '/api/admin/social/reels/voices')
    if (r.ok) setVoices(r.data)
  }, [])

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) return
      setReady(true)
      void loadNews('')
      void loadPersonas()
      void loadUsage()
      void loadVoices()
    })
    return () => unsub()
  }, [loadNews, loadPersonas, loadUsage, loadVoices])

  // ?newsId= from the news list «Stüdyoda önizle»
  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get('newsId')
      if (id && news.length && !picked) {
        const n = news.find((x) => x.newsId === id)
        if (n) setPicked(n)
        else setPicked({ newsId: id, title: id, category: '', city: null, citySlug: null, publishedAt: null, imageUrl: null, hasVideo: false, mediaOk: false, approved: false, featured: false })
      }
    } catch {
      // ignore
    }
  }, [news, picked])

  const shown = useMemo(() => {
    return news.filter((n) => {
      if (filter === 'video') return n.hasVideo
      if (filter === 'media') return n.mediaOk
      if (filter === 'canakkale') return n.citySlug === 'canakkale' || fold(n.city ?? '') === 'canakkale'
      if (filter === 'featured') return n.featured
      return true
    })
  }, [news, filter])

  const pickSingle = (n: NewsPick) => {
    setPicked(n)
    setResult(null)
    setScript('')
    setScriptSource(null)
    setError(null)
  }
  const toggleDigest = (n: NewsPick) => {
    setDigest(null)
    setSelected((cur) => (cur.some((x) => x.newsId === n.newsId) ? cur.filter((x) => x.newsId !== n.newsId) : cur.length >= 7 ? cur : [...cur, n]))
  }
  const move = (i: number, d: -1 | 1) =>
    setSelected((cur) => {
      const j = i + d
      if (j < 0 || j >= cur.length) return cur
      const next = [...cur]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })

  const opts = () => ({
    personaId: personaId || null,
    voice: voiceOverride || null,
    intro,
    outro,
    music,
    cover,
    layout,
    voiceText: scriptSource === 'studio' && script.trim() ? script.trim() : null,
  })

  const plan = async () => {
    if (!picked) return
    setBusy('plan')
    setError(null)
    const r = await reelsCall<{ result: ReelResult }>('POST', '/api/admin/social/reels/render', { newsId: picked.newsId, dryRun: true, personaId: personaId || null, intro, outro, music })
    setBusy(null)
    if (!r.ok) return setError(r.error)
    setScript(r.data.result.voiceText ?? '')
    setScriptSource(r.data.result.editor ?? 'rules')
    if (!personaId && r.data.result.persona) setPersonaId(r.data.result.persona.id)
  }

  const render = async (force: boolean) => {
    if (!picked) return
    setBusy('render')
    setError(null)
    const r = await reelsCall<{ result: ReelResult }>('POST', '/api/admin/social/reels/render', { newsId: picked.newsId, force, ...opts() })
    setBusy(null)
    void loadUsage()
    if (!r.ok) return setError(r.error)
    setResult(r.data.result)
    if (r.data.result.voiceText && scriptSource !== 'studio') {
      setScript(r.data.result.voiceText)
      setScriptSource(r.data.result.editor ?? null)
    }
  }

  const approveMedia = async (approve: boolean) => {
    if (!picked) return
    if (approve && !window.confirm('Bu haberin görselini/videosunu Reels\'te kullanma hakkımız olduğunu onaylıyor musunuz? Onay sizin adınıza kaydedilir.')) return
    setBusy('approve')
    const r = await reelsCall<{ approved: boolean }>('POST', '/api/admin/social/reels/media-approval', { newsId: picked.newsId, approve })
    setBusy(null)
    if (!r.ok) return setError(r.error)
    const upd = { ...picked, approved: approve, mediaOk: approve || picked.mediaOk }
    setPicked(upd)
    setNews((cur) => cur.map((n) => (n.newsId === upd.newsId ? upd : n)))
  }

  const buildDigest = async () => {
    if (selected.length < 2) return
    setBusy('digest')
    setError(null)
    const r = await reelsCall<{ digest: Digest }>('POST', '/api/admin/social/reels/digest', {
      newsIds: selected.map((s) => s.newsId),
      title: dTitle,
      intro: dIntro,
      transition: dTransition,
      outro: dOutro,
      music: dMusic,
      personaMode: dPersonaMode,
      personaId: personaId || null,
    })
    setBusy(null)
    void loadUsage()
    if (!r.ok) return setError(r.error)
    setDigest(r.data.digest)
    setTab('share')
  }

  const personas = pv?.personas ?? []
  const activePersona = personas.find((p) => p.id === personaId) ?? null
  const std = usage?.tiers.find((t) => t.tier === 'standard')
  const videoUrl = mode === 'digest' ? digest?.url : result?.url

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[640px] flex-col overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2.5">
        <Clapperboard className="h-5 w-5 text-red-600" />
        <h2 className="text-base font-extrabold">Reels Stüdyosu</h2>
        <div className="flex rounded-xl bg-[rgb(var(--color-surface))] p-1 text-xs font-bold">
          {([
            ['single', 'Tek haber'],
            ['digest', 'Günün Öne Çıkanları'],
            ['library', 'Kaydedilenler'],
            ['upload', 'Video yükle'],
          ] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={cn('rounded-lg px-3 py-1.5', mode === k ? 'bg-[rgb(var(--color-card))] shadow' : 'text-[rgb(var(--color-muted))]')}>
              {l}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-[rgb(var(--color-muted))]">
          {std ? (
            <span className="flex items-center gap-2">
              Seslendirme {usage?.month}
              <span className="h-1.5 w-28 overflow-hidden rounded bg-[rgb(var(--color-border))]">
                <span className="block h-full bg-emerald-500" style={{ width: `${Math.min(100, (std.used / std.cap) * 100)}%` }} />
              </span>
              {std.used.toLocaleString('tr-TR')} / {std.cap.toLocaleString('tr-TR')}
            </span>
          ) : null}
          {pv?.gemini.enabled ? (
            <span className="rounded-md border border-[rgb(var(--color-border))] px-2 py-0.5 font-bold">
              Gemini: {pv.gemini.usedUsd.toFixed(2)} $ / {pv.gemini.monthlyUsd} $
            </span>
          ) : null}
        </div>
      </div>

      {mode === 'library' ? (
        <ReelLibrary />
      ) : mode === 'upload' ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[rgb(var(--color-muted))]">
          <div className="max-w-md space-y-2">
            <Film className="mx-auto h-10 w-10" />
            <p className="font-bold text-[rgb(var(--color-text))]">Video yükleme bir sonraki adımda geliyor</p>
            <p>Şimdilik: videoyu haberin medyasına (admin editör) ekleyin; stüdyo haberdeki videoyu otomatik kullanır. Ajans videolarında «Görseli kullan — hakkımız var» onayı gerekir.</p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 lg:grid-cols-[320px_minmax(0,1fr)_380px] lg:overflow-hidden">
          {/* LEFT — news */}
          <section className="flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
            <div className="space-y-2 border-b border-[rgb(var(--color-border))] p-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                1 · {mode === 'digest' ? `Haberleri seç (2–7) · ${selected.length} seçili` : 'Haber seç'}
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1.5">
                <Search className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void loadNews(q)
                  }}
                  placeholder="Başlıkta ara — Enter"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
                {newsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              </div>
              <div className="flex flex-wrap gap-1">
                {([
                  ['all', 'Son yayınlar'],
                  ['video', 'Videolu'],
                  ['media', 'Görsel hazır'],
                  ['canakkale', 'Çanakkale'],
                  ['featured', 'Öne çıkan'],
                ] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-bold', filter === k ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]')}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {mode === 'digest' && selected.length > 0 ? (
              <ol className="space-y-1 border-b border-[rgb(var(--color-border))] bg-red-50/60 p-2 dark:bg-red-950/20">
                {selected.map((n, i) => (
                  <li key={n.newsId} className="flex items-center gap-2 text-xs">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-red-600 font-extrabold text-white">{i + 1}</span>
                    <span className="line-clamp-1 flex-1 font-semibold">{n.title}</span>
                    <button type="button" aria-label="Yukarı" onClick={() => move(i, -1)} className="p-0.5 disabled:opacity-30" disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="Aşağı" onClick={() => move(i, 1)} className="p-0.5 disabled:opacity-30" disabled={i === selected.length - 1}><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="Çıkar" onClick={() => toggleDigest(n)} className="p-0.5"><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ol>
            ) : null}
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {shown.map((n) => {
                const on = mode === 'digest' ? selected.some((s) => s.newsId === n.newsId) : picked?.newsId === n.newsId
                const idx = selected.findIndex((s) => s.newsId === n.newsId)
                return (
                  <li key={n.newsId}>
                    <button
                      type="button"
                      onClick={() => (mode === 'digest' ? toggleDigest(n) : pickSingle(n))}
                      className={cn('flex w-full items-center gap-2.5 border-b border-[rgb(var(--color-border))]/60 px-3 py-2 text-left hover:bg-[rgb(var(--color-surface))]', on && 'bg-red-50 shadow-[inset_3px_0_0_#e31b23] dark:bg-red-950/30')}
                    >
                      {mode === 'digest' ? (
                        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-xs font-extrabold', on ? 'border-red-600 bg-red-600 text-white' : 'border-slate-300')}>{on ? idx + 1 : ''}</span>
                      ) : null}
                      {n.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={n.imageUrl} alt="" className="h-11 w-16 shrink-0 rounded-md object-cover" />
                      ) : (
                        <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--color-border))]"><ImageIcon className="h-4 w-4" /></span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[13px] font-semibold leading-snug">{n.title}</span>
                        <span className="text-[11px] text-[rgb(var(--color-muted))]">
                          {n.category}
                          {n.city ? ` · ${n.city}` : ''}
                          {n.publishedAt ? ` · ${new Date(n.publishedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        {n.hasVideo ? (
                          n.videoKind === 'youtube' || n.videoKind === 'embed' ? (
                            <span title="Video YouTube / dış oynatıcıda: indirilip yeniden yüklenmez. Reels haberin fotoğraflarıyla üretilir; gönderide videoya yönlendirilir." className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-800">
                              {n.videoKind === 'youtube' ? 'YOUTUBE' : 'DIŞ VİDEO'}
                            </span>
                          ) : (
                            <span title="Reels haberin kendi videosuyla üretilir" className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-extrabold text-red-700">VİDEO</span>
                          )
                        ) : null}
                        {n.mediaOk ? (
                          <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-extrabold', n.rightsOk === false ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-700')} title={n.rightsOk === false ? 'Başka kaynaktan — «her zaman kullan» ayarıyla kullanılıyor' : undefined}>
                            {n.rightsOk === false ? 'GÖRSEL · KAYNAK' : 'GÖRSEL ✓'}
                          </span>
                        ) : n.imageUrl ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-800">HAK ONAYI</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                )
              })}
              {!newsLoading && shown.length === 0 ? <li className="p-4 text-xs text-[rgb(var(--color-muted))]">Haber bulunamadı.</li> : null}
            </ul>
          </section>

          {/* CENTER — preview */}
          <section className="flex min-h-[560px] flex-col items-center gap-3 overflow-y-auto rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
            <div className="relative aspect-[9/16] w-full max-w-[320px] shrink-0 overflow-hidden rounded-[2rem] border-[10px] border-black bg-black shadow-2xl">
              {videoUrl ? (
                <video key={videoUrl} src={videoUrl} controls playsInline autoPlay className="h-full w-full object-cover" />
              ) : mode === 'single' && picked?.imageUrl ? (
                <div className="relative h-full w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={picked.imageUrl} alt="" className={cn('h-full w-full object-cover', !picked.mediaOk && 'opacity-40 grayscale')} />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#071530] to-transparent p-4 pt-16 text-white">
                    <p className="text-sm font-extrabold leading-snug">{picked.title}</p>
                    <p className="mt-1 text-[11px] opacity-80">Önizleme için «Videoyu üret»</p>
                  </div>
                </div>
              ) : mode === 'digest' && selected.length > 0 ? (
                <div className="flex h-full w-full flex-col gap-2 bg-gradient-to-b from-[#0d2147] to-[#071530] p-5 text-white">
                  <p className="mt-6 text-center text-xs font-bold text-white/70">{dTitle.toLocaleUpperCase('tr-TR')}</p>
                  <ol className="mt-2 space-y-2">
                    {selected.map((n, i) => (
                      <li key={n.newsId} className="flex items-start gap-2 text-[11px] leading-snug">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-red-600 text-[10px] font-extrabold">{i + 1}</span>
                        <span className="line-clamp-2">{n.title}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-auto text-center text-[11px] text-white/70">{selected.length < 2 ? 'En az 2 haber seçin' : '«Toplu videoyu üret» ile hazırlayın'}</p>
                </div>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-[#0d2147] to-[#071530] p-6 text-center text-white">
                  <Clapperboard className="h-10 w-10 text-red-500" />
                  <p className="text-sm font-bold">{mode === 'digest' ? 'Soldan 2–7 haber seçin' : 'Soldan bir haber seçin'}</p>
                </div>
              )}
              {busy === 'render' || busy === 'digest' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-xs font-semibold">{busy === 'digest' ? 'Toplu video hazırlanıyor (1–3 dk)…' : 'Video hazırlanıyor (20–60 sn)…'}</p>
                </div>
              ) : null}
            </div>

            {mode === 'single' && result ? (
              <div className="flex max-w-xl flex-wrap justify-center gap-1.5 text-[11px] font-bold">
                <span className="rounded-full border border-[rgb(var(--color-border))] px-2.5 py-1">{result.media === 'video' ? '🎬 Haber videosu' : result.media === 'image' ? '🖼 Haber görseli' : '🎨 Marka arka planı'}</span>
                {result.seconds ? <span className="rounded-full border border-[rgb(var(--color-border))] px-2.5 py-1">⏱ {result.seconds.toFixed(1)} sn</span> : null}
                {result.persona ? <span className="rounded-full border border-[rgb(var(--color-border))] px-2.5 py-1">🎙 {result.persona.name} · {result.engine === 'gemini' ? 'Gemini' : voiceLabel(result.voice ?? '')}</span> : null}
                {result.music ? <span className="rounded-full border border-[rgb(var(--color-border))] px-2.5 py-1">🎵 {MUSIC_TEXT[result.music]?.[0] ?? result.music}</span> : null}
                {result.intro ? <span className="rounded-full border border-[rgb(var(--color-border))] px-2.5 py-1">✨ {INTRO_TEXT[result.intro]?.[0]} · {OUTRO_TEXT[result.outro ?? 'logo']?.[0]}</span> : null}
                {result.editor ? <span className="rounded-full border border-[rgb(var(--color-border))] px-2.5 py-1">📝 {result.editor === 'ai' ? 'AI editör' : result.editor === 'studio' ? 'Sizin metniniz' : 'Kural metni'}</span> : null}
              </div>
            ) : null}
            {mode === 'digest' && digest ? (
              <p className="text-xs font-bold text-[rgb(var(--color-muted))]">
                {digest.newsIds.length} haber · {digest.seconds.toFixed(0)} sn · {digest.title}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-center gap-2">
              {mode === 'single' ? (
                <>
                  <button type="button" disabled={!picked || !!busy} onClick={() => void render(false)} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50">
                    <Clapperboard className="h-4 w-4" /> Videoyu üret
                  </button>
                  <button type="button" disabled={!picked || !!busy} onClick={() => void render(true)} className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-bold disabled:opacity-50">
                    <RefreshCw className="h-4 w-4" /> Yeniden üret
                  </button>
                </>
              ) : (
                <button type="button" disabled={selected.length < 2 || !!busy} onClick={() => void buildDigest()} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50">
                  <Clapperboard className="h-4 w-4" /> Toplu videoyu üret ({selected.length})
                </button>
              )}
              {videoUrl ? (
                <a href={videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-bold">
                  <Download className="h-4 w-4" /> MP4
                </a>
              ) : null}
              {mode === 'single' && result?.coverUrl ? (
                <a href={result.coverUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-bold">
                  <ImageIcon className="h-4 w-4" /> Kapak
                </a>
              ) : null}
              {videoUrl ? (
                <button type="button" onClick={() => setTab('share')} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-extrabold text-white">
                  <Send className="h-4 w-4" /> Paylaş
                </button>
              ) : null}
            </div>
            {error ? <p className="max-w-xl rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">{error}</p> : null}

            {mode === 'single' && picked && picked.imageUrl && !picked.mediaOk ? (
              <div className="max-w-xl rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <b>Görsel kullanım hakkı:</b> Bu haberin görseli başka bir kaynaktan; hak onayı yoksa videoda marka arka planı kullanılır.{' '}
                <button type="button" disabled={busy === 'approve'} onClick={() => void approveMedia(true)} className="font-bold underline">
                  Görseli kullan — hakkımız var
                </button>
              </div>
            ) : null}
            {mode === 'single' && picked?.approved ? (
              <p className="text-[11px] text-[rgb(var(--color-muted))]">
                Görsel kullanımı sizin onayınızla açık.{' '}
                <button type="button" onClick={() => void approveMedia(false)} className="underline">Onayı kaldır</button>
              </p>
            ) : null}
          </section>

          {/* RIGHT — tabs */}
          <section className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
            <div className="flex border-b border-[rgb(var(--color-border))] text-xs font-extrabold">
              {([
                ['settings', '2 · Ayarlar'],
                ['share', '3 · Paylaş'],
                ['voices', 'Sunucular'],
              ] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setTab(k)} className={cn('flex-1 py-3', tab === k ? 'text-red-600 shadow-[inset_0_-2px_0_#e31b23]' : 'text-[rgb(var(--color-muted))]')}>
                  {l}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!ready ? <p className="p-4 text-xs text-[rgb(var(--color-muted))]">Giriş bekleniyor…</p> : null}

              {tab === 'settings' && mode === 'single' ? (
                <>
                  <Section title="Haber sunucusu" hint={personaId ? 'sizin seçiminiz' : 'AI editör seçer'}>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" onClick={() => setPersonaId('')} className={cn('flex items-center gap-2 rounded-xl border p-2 text-left', !personaId ? 'border-red-600 ring-2 ring-red-200' : 'border-[rgb(var(--color-border))]')}>
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-white"><Sparkles className="h-4 w-4" /></span>
                        <span className="text-xs"><b className="block">Otomatik</b><span className="text-[10px] text-[rgb(var(--color-muted))]">türe göre</span></span>
                      </button>
                      {personas.map((p) => (
                        <button key={p.id} type="button" onClick={() => setPersonaId(p.id)} className={cn('flex items-center gap-2 rounded-xl border p-2 text-left', personaId === p.id ? 'border-red-600 ring-2 ring-red-200' : 'border-[rgb(var(--color-border))]')}>
                          {p.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold text-white" style={{ background: STYLE_COLOR[p.styles[0] ?? 'haber'] }}>{p.name.charAt(0)}</span>
                          )}
                          <span className="min-w-0 text-xs"><b className="block truncate">{p.name}</b><span className="block truncate text-[10px] text-[rgb(var(--color-muted))]">{p.title}</span></span>
                        </button>
                      ))}
                    </div>
                    {voices ? (
                      <select value={voiceOverride} onChange={(e) => setVoiceOverride(e.target.value)} className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5 text-xs">
                        <option value="">Sunucunun sesi{activePersona ? ` (${voiceLabel(activePersona.voice)})` : ''}</option>
                        {voices.voices.map((v) => (
                          <option key={v.name} value={v.name}>{voiceLabel(v.name)} · {GENDER_TEXT[v.gender]}</option>
                        ))}
                      </select>
                    ) : null}
                  </Section>
                  <Section
                    title="Seslendirme metni"
                    hint={
                      <button type="button" disabled={!picked || busy === 'plan'} onClick={() => void plan()} className="inline-flex items-center gap-1 font-bold text-blue-700 underline disabled:opacity-40 dark:text-blue-300">
                        {busy === 'plan' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI editör yazsın
                      </button>
                    }
                  >
                    <textarea
                      value={script}
                      onChange={(e) => {
                        setScript(e.target.value.slice(0, 320))
                        setScriptSource('studio')
                      }}
                      rows={4}
                      placeholder="Boş bırakırsanız AI editör yazar. Düzenlerseniz sizin metniniz okunur."
                      className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent p-2 text-xs leading-relaxed"
                    />
                    <p className="text-[10px] text-[rgb(var(--color-muted))]">
                      {script.length}/320 · {scriptSource === 'ai' ? 'AI editör yazdı' : scriptSource === 'studio' ? 'sizin metniniz' : scriptSource === 'rules' ? 'kural metni (AI yanıt vermedi)' : '—'} · haberde olmayan rakam kabul edilmez
                    </p>
                  </Section>
                  <Section title="Video düzeni">
                    <OptionGrid items={['dinamik', 'bulten', 'kart']} value={layout} onChange={setLayout} labels={LAYOUT_TEXT} cols={3} />
                    <p className="text-[10px] text-[rgb(var(--color-muted))]">Dinamik: haberde ses içeren video varsa seslendirmeden sonra videonun kendi sesi çalar (en fazla 25 sn).</p>
                  </Section>
                  <Section title="Giriş efekti">
                    <OptionGrid items={pv?.options.intros ?? ['soft', 'slide', 'perde', 'zoom', 'minimal']} value={intro} onChange={setIntro} labels={INTRO_TEXT} />
                  </Section>
                  <Section title="Çıkış efekti">
                    <OptionGrid items={pv?.options.outros ?? ['logo', 'follow', 'short']} value={outro} onChange={setOutro} labels={OUTRO_TEXT} />
                  </Section>
                  <Section title="Müzik" hint={<MusicPreview name={music} />}>
                    <OptionGrid items={pv?.options.music ?? Object.keys(MUSIC_TEXT)} value={music} onChange={setMusic} labels={MUSIC_TEXT} />
                  </Section>
                  <Section title="Instagram kapağı" hint={<span className="text-[10px] text-[rgb(var(--color-muted))]">profil ızgarası + Reels sekmesi</span>}>
                    <OptionGrid items={(pv?.options.covers ?? [{ id: 'foto', label: '' }, { id: 'bulten', label: '' }, { id: 'manset', label: '' }, { id: 'panel', label: '' }]).map((c) => c.id)} value={cover} onChange={setCover} labels={COVER_TEXT} cols={2} />
                    {result?.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={result.coverUrl} alt="Reels kapağı" className="mt-2 h-40 rounded-lg border border-[rgb(var(--color-border))] object-cover" />
                    ) : null}
                  </Section>
                  <Section title="Post ve hikâye görselleri">
                    <Toggle
                      on={pv?.defaults.postTheme !== 'onyeditivi'}
                      onChange={async (v) => {
                        const r = await reelsCall<PersonasView>('POST', '/api/admin/social/reels/personas', { postTheme: v ? 'nahaber' : 'onyeditivi' })
                        if (r.ok) setPv(r.data)
                      }}
                      label="Post / hikâye paylaşımları da NaHaber Bülten temasıyla"
                    />
                    <p className="text-[10px] text-[rgb(var(--color-muted))]">Kapalıysa eski (onyeditivi) post kartı kullanılır.</p>
                  </Section>
                  <Section title="Medya">
                    <Toggle
                      on={pv?.defaults.alwaysUseMedia !== false}
                      onChange={async (v) => {
                        const r = await reelsCall<PersonasView>('POST', '/api/admin/social/reels/personas', { alwaysUseMedia: v })
                        if (r.ok) {
                          setPv(r.data)
                          void loadNews(q)
                        }
                      }}
                      label="Haberin görselini / videosunu her zaman kullan"
                    />
                    <p className="text-[10px] text-[rgb(var(--color-muted))]">Video varsa video, yoksa görsel ön planda oynar. Ajans/başka kaynak görsellerinde telif sorumluluğu yayıncıdadır.</p>
                  </Section>
                </>
              ) : null}

              {tab === 'settings' && mode === 'digest' ? (
                <>
                  <Section title="Başlık">
                    <select value={DIGEST_TITLES.includes(dTitle) ? dTitle : '__custom'} onChange={(e) => setDTitle(e.target.value === '__custom' ? '' : e.target.value)} className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5 text-xs font-bold">
                      {DIGEST_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
                      <option value="__custom">Özel başlık…</option>
                    </select>
                    {!DIGEST_TITLES.includes(dTitle) ? (
                      <input value={dTitle} onChange={(e) => setDTitle(e.target.value.slice(0, 40))} placeholder="Özel başlık" className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5 text-xs" />
                    ) : null}
                  </Section>
                  <Section title="Giriş efekti">
                    <OptionGrid items={['list', ...(pv?.options.intros ?? ['soft', 'slide', 'perde', 'zoom', 'minimal'])]} value={dIntro} onChange={setDIntro} labels={INTRO_TEXT} />
                  </Section>
                  <Section title="Haberler arası geçiş">
                    <div className="grid grid-cols-3 gap-1.5">
                      {(pv?.options.transitions ?? ['fade', 'slide', 'number']).map((k) => (
                        <button key={k} type="button" onClick={() => setDTransition(k)} className={cn('rounded-lg border px-2 py-1.5 text-[11px] font-bold', dTransition === k ? 'border-red-600 bg-red-50 text-red-700' : 'border-[rgb(var(--color-border))]')}>
                          {TRANSITION_TEXT[k] ?? k}
                        </button>
                      ))}
                    </div>
                  </Section>
                  <Section title="Çıkış efekti">
                    <OptionGrid items={pv?.options.outros ?? ['logo', 'follow', 'short']} value={dOutro} onChange={setDOutro} labels={OUTRO_TEXT} />
                  </Section>
                  <Section title="Müzik" hint={<MusicPreview name={dMusic} />}>
                    <OptionGrid items={(pv?.options.music ?? Object.keys(MUSIC_TEXT)).filter((m) => m !== 'auto')} value={dMusic} onChange={setDMusic} labels={MUSIC_TEXT} />
                  </Section>
                  <Section title="Seslendirme">
                    <Toggle on={dPersonaMode === 'single'} onChange={(v) => setDPersonaMode(v ? 'single' : 'perStyle')} label={`Tek sunucu${activePersona ? ` (${activePersona.name})` : ' (Gündem sunucusu)'}`} />
                    <Toggle on={dPersonaMode === 'perStyle'} onChange={(v) => setDPersonaMode(v ? 'perStyle' : 'single')} label="Her habere kendi türünün sunucusu" />
                    <p className="text-[10px] text-[rgb(var(--color-muted))]">AI editör her haber için tek cümle yazar. Sunucuyu «Tek haber» sekmesindeki listeden seçebilirsiniz.</p>
                  </Section>
                  {digest ? (
                    <Section title="Okunan cümleler">
                      <ol className="list-decimal space-y-1 pl-4 text-[11px]">
                        {digest.lines.map((l, i) => <li key={i}>{l}</li>)}
                      </ol>
                    </Section>
                  ) : null}
                </>
              ) : null}

              {tab === 'share' && mode === 'single' ? (
                result ? (
                  <div className="space-y-3 p-4">
                    <div className="flex gap-1.5 text-xs">
                      {(['reel', 'video_story'] as const).map((f) => (
                        <button key={f} type="button" onClick={() => setShareFmt(f)} className={cn('rounded-full border px-3 py-1 font-bold', shareFmt === f ? 'border-red-600 bg-red-600 text-white' : 'border-[rgb(var(--color-border))]')}>
                          {f === 'reel' ? 'Reels' : 'Video hikâye'}
                        </button>
                      ))}
                    </div>
                    <ManualShareFlow key={shareFmt} newsId={result.newsId} newsTitle={picked?.title ?? result.newsId} mode={shareFmt} onClose={() => setTab('settings')} />
                  </div>
                ) : (
                  <p className="p-4 text-xs text-[rgb(var(--color-muted))]">Önce videoyu üretin.</p>
                )
              ) : null}
              {tab === 'share' && mode === 'digest' ? (
                digest ? <DigestShare digest={digest} /> : <p className="p-4 text-xs text-[rgb(var(--color-muted))]">Önce toplu videoyu üretin.</p>
              ) : null}

              {tab === 'voices' ? (
                <div className="space-y-3 p-3">
                  {pv ? <PersonaEditor view={pv} voices={voices} onSaved={setPv} /> : null}
                  {voices ? <ReelsVoiceLibrary data={voices} onSaved={() => void loadVoices()} onUsageChange={() => void loadUsage()} /> : null}
                </div>
              ) : null}
            </div>
            {tab === 'settings' ? (
              <div className="flex gap-2 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3">
                {mode === 'single' ? (
                  <button type="button" disabled={!picked || !!busy} onClick={() => void render(false)} className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-extrabold text-white disabled:opacity-50">Videoyu üret</button>
                ) : (
                  <button type="button" disabled={selected.length < 2 || !!busy} onClick={() => void buildDigest()} className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-extrabold text-white disabled:opacity-50">Toplu videoyu üret</button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    const r = await reelsCall<PersonasView>('POST', '/api/admin/social/reels/personas', mode === 'single' ? { intro, outro, music, cover, layout } : { music: dMusic })
                    if (r.ok) setPv(r.data)
                  }}
                  className="rounded-xl border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-bold"
                >
                  Varsayılan yap
                </button>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  )
}

// ── saved reels (REELS-5) ────────────────────────────────────────────────────
function ReelLibrary() {
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const load = useCallback(async () => {
    const r = await reelsCall<{ items: LibraryItem[] }>('GET', '/api/admin/social/reels/library?limit=90')
    if (r.ok) setItems(r.data.items)
    else setError(r.error)
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-3 flex items-center gap-2">
        <p className="text-sm font-extrabold">Kaydedilen videolar</p>
        <span className="text-xs text-[rgb(var(--color-muted))]">Üretilen her haber videosu kapağıyla burada saklanır ve Akış 2’de haber kartında oynar.</span>
        <button type="button" onClick={() => void load()} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1 text-xs font-bold">
          <RefreshCw className="h-3.5 w-3.5" /> Yenile
        </button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!items ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : items.length === 0 ? (
        <p className="text-sm text-[rgb(var(--color-muted))]">Henüz kayıtlı video yok — «Tek haber» sekmesinden üretin.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((it) => (
            <div key={it.newsId} className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
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
              </div>
              <div className="space-y-1 p-2">
                <p className="line-clamp-2 text-xs font-bold">{it.headline}</p>
                <p className="text-[10px] text-[rgb(var(--color-muted))]">
                  {it.updatedAt ? new Date(it.updatedAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                  {it.seconds ? ` · ${it.seconds.toFixed(0)} sn` : ''}
                  {it.renders > 1 ? ` · ${it.renders}. sürüm` : ''}
                </p>
                <div className="flex gap-1 text-[10px] font-bold">
                  <a href={it.url} target="_blank" rel="noreferrer" className="rounded border border-[rgb(var(--color-border))] px-1.5 py-0.5">MP4</a>
                  {it.coverUrl ? <a href={it.coverUrl} target="_blank" rel="noreferrer" className="rounded border border-[rgb(var(--color-border))] px-1.5 py-0.5">Kapak</a> : null}
                  <a href={`/admin/news/${it.newsId}/edit`} className="rounded border border-[rgb(var(--color-border))] px-1.5 py-0.5">Haber</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── digest share (central accounts, one request per account) ─────────────────
function DigestShare({ digest }: { digest: Digest }) {
  const [fmt, setFmt] = useState<'reel' | 'video_story'>('reel')
  const [accounts, setAccounts] = useState<Array<{ accountId: string; platform: 'instagram' | 'facebook'; displayName: string; username: string | null }>>([])
  const [sel, setSel] = useState<string[]>([])
  const [rows, setRows] = useState<Array<{ id: string; ok: boolean; text: string }>>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setSel([])
    setRows([])
    void reelsCall<{ accounts: typeof accounts }>('GET', `/api/admin/social/reels/digest/share?format=${fmt}`).then((r) => r.ok && setAccounts(r.data.accounts))
  }, [fmt])
  const send = async () => {
    if (!sel.length || !window.confirm(`Toplu video ${sel.length} hesapta ${fmt === 'reel' ? 'Reels' : 'video hikâye'} olarak yayımlansın mı?`)) return
    setBusy(true)
    const out: typeof rows = []
    for (const id of sel) {
      const r = await reelsCall<{ result: { success: boolean; error?: string; code?: string } }>('POST', '/api/admin/social/reels/digest/share', { digestId: digest.id, accountId: id, format: fmt })
      const a = accounts.find((x) => x.accountId === id)
      out.push({ id, ok: r.ok && r.data.result.success, text: `${a?.platform === 'instagram' ? 'Instagram' : 'Facebook'} · ${a?.displayName ?? id}: ${r.ok ? (r.data.result.success ? 'yayımlandı ✓' : r.data.result.error ?? r.data.result.code ?? 'başarısız') : r.error}` })
      setRows([...out])
    }
    setBusy(false)
  }
  return (
    <div className="space-y-3 p-4 text-xs">
      <div className="flex gap-1.5">
        {(['reel', 'video_story'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFmt(f)} className={cn('rounded-full border px-3 py-1 font-bold', fmt === f ? 'border-red-600 bg-red-600 text-white' : 'border-[rgb(var(--color-border))]')}>
            {f === 'reel' ? 'Reels' : 'Video hikâye'}
          </button>
        ))}
      </div>
      {accounts.length > 1 ? (
        <button type="button" onClick={() => setSel(sel.length === accounts.length ? [] : accounts.map((a) => a.accountId))} className="rounded-md bg-blue-600 px-2 py-1 font-bold text-white">
          {sel.length === accounts.length ? 'Temizle' : `Hepsini seç (${accounts.length})`}
        </button>
      ) : null}
      <ul className="space-y-1">
        {accounts.map((a) => (
          <li key={a.accountId}>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sel.includes(a.accountId)} onChange={() => setSel((c) => (c.includes(a.accountId) ? c.filter((x) => x !== a.accountId) : [...c, a.accountId]))} />
              <span className="font-semibold">{a.platform === 'instagram' ? 'Instagram' : 'Facebook'} · {a.displayName}{a.username ? ` (@${a.username})` : ''}</span>
            </label>
          </li>
        ))}
        {accounts.length === 0 ? <li className="text-[rgb(var(--color-muted))]">Uygun merkez hesap yok.</li> : null}
      </ul>
      <button type="button" disabled={!sel.length || busy} onClick={() => void send()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-2 font-extrabold text-white disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {sel.length} hesapta paylaş
      </button>
      {rows.length ? (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className={cn('rounded-md px-2 py-1', r.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900')}>{r.text}</li>
          ))}
        </ul>
      ) : null}
      <details className="text-[11px] text-[rgb(var(--color-muted))]">
        <summary className="cursor-pointer font-semibold">Açıklama metni</summary>
        <pre className="mt-1 whitespace-pre-wrap font-sans">{digest.caption}</pre>
      </details>
    </div>
  )
}

// ── persona editor ──────────────────────────────────────────────────────────
function PersonaEditor({ view, voices, onSaved }: { view: PersonasView; voices: VoicesResponse | null; onSaved: (v: PersonasView) => void }) {
  const [list, setList] = useState<Persona[]>(view.personas)
  const [open, setOpen] = useState<string | null>(null)
  const [gemini, setGemini] = useState(view.gemini.enabled)
  const [budget, setBudget] = useState(view.gemini.monthlyUsd)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const upd = (id: string, patch: Partial<Persona>) => setList((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const save = async () => {
    setSaving(true)
    const r = await reelsCall<PersonasView>('POST', '/api/admin/social/reels/personas', { personas: list, geminiEnabled: gemini, geminiMonthlyUsd: budget })
    setSaving(false)
    if (r.ok) {
      onSaved(r.data)
      setList(r.data.personas)
      setMsg('Kaydedildi')
    } else setMsg(r.error)
  }
  return (
    <div className="space-y-2 rounded-xl border border-[rgb(var(--color-border))] p-3 text-xs">
      <div className="flex items-center justify-between">
        <p className="font-extrabold">Haber sunucuları</p>
        <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1 font-bold text-white disabled:opacity-50">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Kaydet
        </button>
      </div>
      {list.map((p) => (
        <div key={p.id} className="rounded-lg border border-[rgb(var(--color-border))]">
          <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} className="flex w-full items-center gap-2 p-2 text-left">
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold text-white" style={{ background: STYLE_COLOR[p.styles[0] ?? 'haber'] }}>{p.name.charAt(0)}</span>
            <span className="flex-1"><b>{p.name}</b> <span className="text-[rgb(var(--color-muted))]">· {p.title} · {voiceLabel(p.voice)}</span></span>
            <span className="text-[10px] text-[rgb(var(--color-muted))]">{open === p.id ? 'kapat' : 'düzenle'}</span>
          </button>
          {open === p.id ? (
            <div className="space-y-1.5 border-t border-[rgb(var(--color-border))] p-2">
              <div className="grid grid-cols-2 gap-1.5">
                <input value={p.name} onChange={(e) => upd(p.id, { name: e.target.value.slice(0, 32) })} placeholder="İsim" className="rounded border border-[rgb(var(--color-border))] bg-transparent px-2 py-1" />
                <input value={p.title} onChange={(e) => upd(p.id, { title: e.target.value.slice(0, 48) })} placeholder="Ünvan (ekranda)" className="rounded border border-[rgb(var(--color-border))] bg-transparent px-2 py-1" />
              </div>
              <select value={p.voice} onChange={(e) => upd(p.id, { voice: e.target.value })} className="w-full rounded border border-[rgb(var(--color-border))] bg-transparent px-2 py-1">
                {(voices?.voices ?? [{ name: p.voice, gender: 'UNKNOWN' as const, tier: '' }]).map((v) => (
                  <option key={v.name} value={v.name}>{voiceLabel(v.name)} · {GENDER_TEXT[v.gender]}</option>
                ))}
              </select>
              <label className="flex items-center gap-2">Hız <input type="range" min={0.8} max={1.3} step={0.01} value={p.rate} onChange={(e) => upd(p.id, { rate: Number(e.target.value) })} className="flex-1" /> {p.rate.toFixed(2)}</label>
              <div className="flex flex-wrap gap-1">
                {(['haber', 'spor', 'magazin', 'analiz'] as const).map((s) => (
                  <button key={s} type="button" onClick={() => upd(p.id, { styles: p.styles.includes(s) ? p.styles.filter((x) => x !== s) : [...p.styles, s] })} className={cn('rounded-full border px-2 py-0.5 font-bold', p.styles.includes(s) ? 'text-white' : 'border-[rgb(var(--color-border))]')} style={p.styles.includes(s) ? { background: STYLE_COLOR[s], borderColor: STYLE_COLOR[s] } : undefined}>
                    {s === 'haber' ? 'Gündem' : s === 'spor' ? 'Spor' : s === 'magazin' ? 'Magazin' : 'Analiz'}
                  </button>
                ))}
              </div>
              <textarea value={p.writingStyle} onChange={(e) => upd(p.id, { writingStyle: e.target.value.slice(0, 400) })} rows={2} placeholder="Yazım tarzı (AI editöre talimat)" className="w-full rounded border border-[rgb(var(--color-border))] bg-transparent p-1.5" />
              <input value={p.photoUrl ?? ''} onChange={(e) => upd(p.id, { photoUrl: e.target.value.trim() || null })} placeholder="Fotoğraf URL (https://…, Medya Kütüphanesi'nden kopyalayın)" className="w-full rounded border border-[rgb(var(--color-border))] bg-transparent px-2 py-1" />
              <Toggle on={p.showCard} onChange={(v) => upd(p.id, { showCard: v })} label="Videoda sunucu kartı göster" />
              <Toggle on={p.useGemini} onChange={(v) => upd(p.id, { useGemini: v })} label="Gemini sesi (tarz komutu) kullan" />
              {p.useGemini ? (
                <textarea value={p.geminiStyle} onChange={(e) => upd(p.id, { geminiStyle: e.target.value.slice(0, 400) })} rows={2} placeholder="Konuşma tarzı komutu" className="w-full rounded border border-[rgb(var(--color-border))] bg-transparent p-1.5" />
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
      <div className="space-y-1.5 rounded-lg bg-[rgb(var(--color-surface))] p-2">
        <Toggle on={gemini} onChange={setGemini} label="Gemini sunucu sesi (ücretli, tarz komutlu)" />
        <label className="flex items-center gap-2">
          Aylık bütçe ($)
          <input type="number" min={0} max={200} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="w-20 rounded border border-[rgb(var(--color-border))] bg-transparent px-2 py-0.5" />
          <span className="text-[rgb(var(--color-muted))]">bu ay {view.gemini.usedUsd.toFixed(2)} $ — dolunca standart ses</span>
        </label>
      </div>
      {msg ? <p className="text-[11px] text-emerald-600">{msg}</p> : null}
    </div>
  )
}

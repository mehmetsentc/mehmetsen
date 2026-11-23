'use client'

/**
 * VIDEO-MERKEZI — CapCut düzeninde video düzenleyici (tam ekran odak modu).
 *
 *   ┌ üst çubuk: geri · başlık · tür · kayıt durumu · süre · «Videoyu üret» · «Paylaş» ┐
 *   │ sol: araç şeridi (Medya · Haber · Anlatım · Ses · Müzik · Tür · AI · Kapanış) + paneli │
 *   │ orta: önizleme (sahne karesi ya da üretilen video)                                    │
 *   │ sağ: seçili sahnenin ayrıntıları (gelişmiş alanlar katlı)                            │
 *   └ alt: zaman çizelgesi — Görüntü / Başlık / Anlatım / Müzik izleri + kapanış             ┘
 *
 * Bütün durum ve işlemler eski stüdyoyla ortak: useStoryStudio (StoryStudioPro.tsx).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  Flag,
  Image as ImageIcon,
  Loader2,
  Mic,
  Music2,
  Newspaper,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { FramePreview, useStoryStudio } from '@/components/admin/social/StoryStudioPro'
import { ReelsVideoPicker } from '@/components/admin/social/ReelsVideoPicker'
import {
  hasHeadline,
  MUSIC_LABEL,
  STORY_MUSIC,
  STORY_STYLES,
  STYLE_THEME,
  TARGET_MINUTES,
  type SceneVisual,
  type StoryFormat,
  type StoryMusic,
  type StoryStyle,
  type TargetMin,
} from '@/lib/story/storyProject'
import { TURKISH_PROVINCES } from '@/constants/cities'

export type EditorStart =
  | { kind: 'project'; id: string; autoPlan?: boolean }
  | { kind: 'news'; newsId: string; style: StoryStyle; format: StoryFormat; targetMin: TargetMin }

type Tool = 'media' | 'news' | 'script' | 'voice' | 'music' | 'style' | 'ai' | 'end'
const TOOLS: Array<[Tool, string, typeof ImageIcon]> = [
  ['media', 'Medya', ImageIcon],
  ['news', 'Haber', Newspaper],
  ['script', 'Anlatım', Type],
  ['voice', 'Ses', Mic],
  ['music', 'Müzik', Music2],
  ['style', 'Tür', Palette],
  ['ai', 'AI', Sparkles],
  ['end', 'Kapanış', Flag],
]

const fld = 'w-full rounded-lg border border-[#2F3136] bg-[#0E0F11] px-2.5 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-500 focus:border-red-500 focus:outline-none'
const lbl = 'mb-1.5 block text-[11px] font-semibold text-zinc-400'
const ghost = 'inline-flex items-center gap-1.5 rounded-lg border border-[#3F3F46] bg-[#1C1D21] px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-[#26272B] disabled:cursor-not-allowed disabled:opacity-40'
const card = (on: boolean) => cn('rounded-xl border p-2.5 text-left transition', on ? 'border-red-500 bg-[#2A1416]' : 'border-[#2A2C31] bg-[#1C1D21] hover:border-zinc-500')
const sceneLen = (text: string) => Math.max(1.6, [...text].length / 14.5 + 0.4)
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const KIND_COLOR: Record<SceneVisual['kind'], string> = { asset: '#16A34A', ai: '#7C3AED', card: '#D97706' }
const KIND_LABEL: Record<SceneVisual['kind'], string> = { asset: 'Kendi görüntüm', ai: 'AI çizimi', card: 'Metin kartı' }

const fold = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/[^a-zçğıöşü0-9 ]/g, ' ')
const CITY_NAMES = TURKISH_PROVINCES.map((c) => fold(c.name).trim()).filter(Boolean)
type AccGroup = 'main' | 'city' | 'other'
function accountGroup(name: string): AccGroup {
  const f = ` ${fold(name)} `
  if (CITY_NAMES.some((c) => f.includes(` ${c} `))) return 'city'
  if (/^\s*(na ?haber|nahaber com)\s*$/.test(fold(name).replace(/\s+/g, ' ').trim()) || /^\s*nahaber\s*(\|.*)?$/i.test(name.trim())) return 'main'
  return 'other'
}
const GROUP_LABEL: Record<AccGroup, string> = { main: 'ANA HESAPLAR', city: 'İL HESAPLARI', other: 'KONU VE DİĞER HESAPLAR' }
const PLATFORM_LABEL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', tiktok: 'TikTok', youtube: 'YouTube', x: 'X' }

export function VideoEditor({ start, onExit }: { start: EditorStart; onExit: () => void }) {
  const S = useStoryStudio()
  const { p, draft, scenes, sel, busy, progress, cur, selIdx, timing, total, missing, problem, fresh, th } = S
  const [tool, setTool] = useState<Tool>('media')
  const [view, setView] = useState<'edit' | 'share'>('edit')
  const [showVideo, setShowVideo] = useState(false)
  const [dragAsset, setDragAsset] = useState<string | null>(null)
  const [dragScene, setDragScene] = useState<string | null>(null)
  const [hot, setHot] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── open / create the project once the list is loaded ──
  const started = useRef(false)
  useEffect(() => {
    if (started.current || S.list === null) return
    started.current = true
    void (async () => {
      if (start.kind === 'news') {
        await S.fromNews(start.newsId, start.style, { format: start.format, targetMin: start.targetMin })
        return
      }
      const found = S.list?.find((x) => x.id === start.id)
      if (found) S.open(found)
      await S.reload(start.id)
      if (start.autoPlan) setPendingPlan(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S.list])
  const [pendingPlan, setPendingPlan] = useState(false)
  useEffect(() => {
    if (pendingPlan && p && !busy) {
      setPendingPlan(false)
      void S.plan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPlan, p, busy])
  useEffect(() => {
    if (fresh && p?.render.outputUrl) setShowVideo(true)
  }, [fresh, p?.render.outputUrl])

  const unsaved = S.dirty || S.metaDirty
  const exit = () => {
    if (unsaved && !confirm('Kaydedilmemiş değişiklikler var. Yine de çıkılsın mı?')) return
    onExit()
  }
  const save = async () => {
    if (await S.saveAll()) toast.success('Kaydedildi')
  }

  const assetOf = S.assetOf
  const thumb = cur ? S.thumbOf(cur.visual) : null
  const pxPerSec = (draft.targetMin === 1 ? 26 : draft.targetMin === 3 ? 12 : draft.targetMin === 5 ? 8 : 5) * S.zoom
  const musicName = MUSIC_LABEL[draft.music] ?? draft.music

  // ── share ──
  const groups = useMemo(() => {
    const out: Record<AccGroup, NonNullable<typeof S.accounts>> = { main: [], city: [], other: [] }
    for (const a of S.accounts ?? []) out[accountGroup(a.displayName)].push(a)
    return out
  }, [S.accounts])
  const [accQ, setAccQ] = useState('')
  const [accFilter, setAccFilter] = useState<'all' | AccGroup | 'sel'>('all')
  const chosen = (S.accounts ?? []).filter((a) => S.picked.has(a.accountId))
  const chosenSummary = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of chosen) m.set(a.platform, (m.get(a.platform) ?? 0) + 1)
    return [...m].map(([k, n]) => `${PLATFORM_LABEL[k] ?? k} ${n}`).join(', ')
  }, [chosen])
  const togglePick = (id: string) =>
    S.setPicked((cur0) => {
      const n = new Set(cur0)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const doShare = async () => {
    if (S.metaDirty && !(await S.saveMeta())) return
    await S.share()
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col gap-1.5 bg-[#111214] px-1.5 pb-1.5 text-zinc-200" role="dialog" aria-label="Video düzenleyici">
      {/* ── top bar ── */}
      <header className="flex h-[52px] shrink-0 flex-wrap items-center gap-3 px-2">
        <button type="button" onClick={view === 'share' ? () => setView('edit') : exit} className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {view === 'share' ? 'Düzenlemeye dön' : 'Video Merkezi'}
        </button>
        <input
          value={draft.title}
          onChange={(e) => S.setD({ title: e.target.value })}
          aria-label="Video başlığı"
          placeholder="Video başlığı"
          className="min-w-[200px] max-w-[440px] flex-1 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-bold text-white hover:border-[#2F3136] focus:border-red-500 focus:outline-none"
        />
        <span className="rounded-md border border-red-900/60 bg-[#2A1416] px-2 py-0.5 text-[11px] font-bold uppercase text-red-400">{th.label}</span>
        <span className="text-xs text-zinc-500">{unsaved ? 'Kaydedilmedi' : p ? 'Kaydedildi' : ''}</span>
        {unsaved && p ? (
          <button type="button" onClick={() => void save()} disabled={!!busy} className={ghost}>
            <Save className="h-3.5 w-3.5" /> Kaydet
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-lg border border-[#3F3F46] bg-[#1C1D21] px-3 py-1.5 text-xs font-semibold text-zinc-300">
            {draft.format === 'vertical' ? 'Dikey 9:16' : 'Yatay 16:9'} · ~{fmt(total)}
          </span>
          {view === 'edit' ? (
            <>
              <button
                type="button"
                onClick={() => void S.render()}
                disabled={!p || !!busy || !scenes.length || !!problem}
                title={problem ?? undefined}
                className="inline-flex h-[34px] items-center gap-1.5 rounded-lg bg-red-600 px-4 text-[13px] font-extrabold text-white hover:bg-red-500 disabled:opacity-40"
              >
                {busy === 'render' || busy === 'images' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {fresh ? 'Video güncel' : 'Videoyu üret'}
              </button>
              <button
                type="button"
                onClick={() => setView('share')}
                disabled={!fresh}
                title={fresh ? undefined : 'Önce videoyu üretin'}
                className="inline-flex h-[34px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[13px] font-extrabold text-white hover:bg-blue-500 disabled:opacity-40"
              >
                Paylaş <ArrowRight className="h-4 w-4" />
              </button>
            </>
          ) : null}
        </div>
      </header>
      {progress ? (
        <div className="mx-2 -mt-1 flex items-center gap-3 rounded-lg bg-[#1A1B1E] px-3 py-2 text-xs text-zinc-300">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-red-400" />
          <span className="truncate">{progress.text}</span>
          <span className="ml-auto h-1.5 w-48 overflow-hidden rounded bg-white/10">
            <span className={cn('block h-full bg-red-500', progress.pct == null && 'animate-pulse')} style={{ width: `${progress.pct ?? 35}%` }} />
          </span>
        </div>
      ) : null}

      {view === 'share' ? (
        <SharePanel
          S={S}
          groups={groups}
          accQ={accQ}
          setAccQ={setAccQ}
          accFilter={accFilter}
          setAccFilter={setAccFilter}
          togglePick={togglePick}
          chosenCount={chosen.length}
          chosenSummary={chosenSummary}
          onShare={() => void doShare()}
        />
      ) : (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.95fr)] gap-1.5">
            {/* ── LEFT: tools ── */}
            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-[#1A1B1E]">
              <nav aria-label="Araçlar" className="flex gap-0.5 overflow-x-auto border-b border-[#26272B] p-1.5">
                {TOOLS.map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTool(id)}
                    aria-pressed={tool === id}
                    className={cn('flex min-w-[58px] flex-col items-center gap-1 rounded-lg px-1.5 py-2 text-[11px] font-semibold', tool === id ? 'bg-[#2A2B30] text-white' : 'text-zinc-400 hover:bg-[#232428] hover:text-zinc-100')}
                  >
                    <Icon className={cn('h-5 w-5', tool === id && 'text-red-400')} />
                    {label}
                  </button>
                ))}
              </nav>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {tool === 'media' ? (
                  <>
                    <input ref={fileRef} type="file" multiple hidden accept="image/*,video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v" onChange={(e) => void S.uploadImages(e.target.files).finally(() => { if (fileRef.current) fileRef.current.value = '' })} />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => {
                        if (e.dataTransfer.types.includes('Files')) {
                          e.preventDefault()
                          setHot(true)
                        }
                      }}
                      onDragLeave={() => setHot(false)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setHot(false)
                        void S.uploadImages(e.dataTransfer.files)
                      }}
                      className={cn('flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-3 py-4 text-center text-[13px] font-semibold', hot ? 'border-red-500 bg-red-500/10' : 'border-[#3F3F46] bg-[#202125] hover:border-zinc-500')}
                    >
                      <Upload className="h-5 w-5 text-red-400" />
                      İçe aktar
                      <span className="text-[11px] font-normal text-zinc-400">Fotoğraf veya video sürükle · bilgisayardan seç (foto ≤ 50 MB, video ≤ 200 MB)</span>
                    </button>
                    {Object.entries(S.uploads).map(([n, v]) => (
                      <div key={n} className="text-[11px]">
                        <div className="flex justify-between"><span className="truncate">{n}</span><span>%{v}</span></div>
                        <div className="h-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-red-500" style={{ width: `${v}%` }} /></div>
                      </div>
                    ))}
                    <details className="rounded-xl border border-[#2A2C31] p-2 text-xs">
                      <summary className="cursor-pointer font-semibold text-zinc-300">Video Kütüphanesi’nden seç</summary>
                      <div className="mt-2 rounded-lg bg-white p-1 text-zinc-900 [&_*]:!text-zinc-900">
                        <ReelsVideoPicker value={null} onChange={(v) => void S.addVideo(v)} />
                      </div>
                    </details>
                    {p?.assets.length ? (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
                        {p.assets.map((a) => (
                          <div
                            key={a.id}
                            draggable
                            onDragStart={() => setDragAsset(a.id)}
                            onDragEnd={() => setDragAsset(null)}
                            className="group relative flex flex-col gap-1"
                          >
                            <button
                              type="button"
                              onClick={() => (cur ? S.assignAsset(cur.id, a.id) : toast('Önce zaman çizelgesinden bir sahne seçin'))}
                              title={cur ? `Sahne ${selIdx + 1} için kullan` : a.name}
                              className="relative h-[72px] overflow-hidden rounded-lg bg-[#2A2B30]"
                            >
                              {a.previewUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={a.previewUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <Film className="m-auto h-5 w-5 text-zinc-500" />
                              )}
                              <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] font-bold text-white">{a.kind === 'video' ? 'VİDEO' : a.source === 'news' ? 'HABER' : 'FOTO'}</span>
                              <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[9px] font-bold text-white">{S.useCount.get(a.id) ? `${S.useCount.get(a.id)} sahne` : 'boşta'}</span>
                            </button>
                            <span className="truncate text-[11px] text-zinc-400" title={a.description ?? a.describeError ?? undefined}>
                              {a.describeError ? '⚠ ' : a.description ? '' : '… '}
                              {a.name}
                            </span>
                            <button type="button" aria-label={`${a.name} kaldır`} onClick={() => void S.removeAsset(a.id)} className="absolute right-1 top-6 hidden rounded bg-black/70 p-0.5 text-zinc-200 group-hover:block">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500">Henüz görüntü yok. Görüntüsü olmayan sahnelere AI çizim yapar.</p>
                    )}
                    <p className="text-[11px] text-zinc-500">Bir görüntüye tıklayınca seçili sahneye yerleşir; ya da sürükleyip zaman çizelgesindeki sahneye bırakın.</p>
                  </>
                ) : null}

                {tool === 'news' ? (
                  <div className="space-y-3 text-[13px]">
                    {p?.newsId ? (
                      <p className="rounded-lg bg-[#202125] p-3 text-zinc-300">
                        Bu video bir haberden hazırlandı. <a className="text-red-300 underline" href={`/admin/news/${encodeURIComponent(p.newsId)}`} target="_blank" rel="noreferrer">Haberi aç</a>
                      </p>
                    ) : (
                      <p className="text-zinc-400">Bu video bir konudan / metinden hazırlandı.</p>
                    )}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        void S.searchNews(S.newsQ)
                      }}
                      className="flex gap-1.5"
                    >
                      <input value={S.newsQ} onChange={(e) => S.setNewsQ(e.target.value)} className={fld} placeholder="Başka bir haberden yeni video: başlıkta ara" />
                      <button type="submit" className={ghost}>Ara</button>
                    </form>
                    {S.newsHits?.map((n) => (
                      <button key={n.newsId} type="button" disabled={!!busy} onClick={() => void S.fromNews(n.newsId)} className="flex w-full items-center gap-2 rounded-lg border border-[#2A2C31] p-1.5 text-left hover:border-red-500 disabled:opacity-50">
                        {n.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={n.imageUrl} alt="" className="h-9 w-12 shrink-0 rounded object-cover" />
                        ) : (
                          <span className="h-9 w-12 shrink-0 rounded bg-white/10" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-[12px] font-semibold">{n.title}</span>
                          <span className="block text-[10px] text-zinc-500">{[n.category, n.city, n.hasVideo ? 'videolu' : null].filter(Boolean).join(' · ')}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {tool === 'script' ? (
                  <div className="space-y-3">
                    <label className="block">
                      <span className={lbl}>Konu</span>
                      <textarea value={draft.topic} onChange={(e) => S.setD({ topic: e.target.value })} rows={3} maxLength={1200} className={fld} />
                    </label>
                    <label className="block">
                      <span className={lbl}>Hazır anlatım metni (isteğe bağlı — AI değiştirmez, yalnız sahnelere böler)</span>
                      <textarea value={draft.script} onChange={(e) => S.setD({ script: e.target.value })} rows={6} className={fld} />
                    </label>
                    <button type="button" onClick={() => void S.plan()} disabled={!p || !!busy} className={ghost}>
                      <RefreshCw className="h-3.5 w-3.5" /> Anlatımı ve sahneleri yeniden hazırla
                    </button>
                    <div>
                      <span className={lbl}>Şu anki anlatım ({scenes.length} sahne · ~{fmt(total)})</span>
                      <ol className="space-y-1 text-[12px] text-zinc-300">
                        {scenes.map((s, i) => (
                          <li key={s.id}>
                            <button type="button" onClick={() => S.setSel(s.id)} className={cn('w-full rounded px-1.5 py-1 text-left hover:bg-white/5', s.id === sel && 'bg-white/10')}>
                              <b className="mr-1 text-zinc-500">{i + 1}.</b>
                              {s.text}
                            </button>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                ) : null}

                {tool === 'voice' ? (
                  <div className="space-y-3">
                    <span className={lbl}>Spiker</span>
                    <div className="grid max-h-[300px] grid-cols-2 gap-1.5 overflow-y-auto pr-1">
                      {S.voices
                        .filter((v) => v.tier === 'chirp')
                        .map((v) => {
                          const on = (draft.voice.name ?? S.studioVoice) === v.name
                          return (
                            <button key={v.name} type="button" onClick={() => S.setD({ voice: { ...draft.voice, name: v.name } })} className={card(on)}>
                              <span className="flex items-center justify-between text-[13px] font-bold">
                                {v.name.replace('tr-TR-Chirp3-HD-', '')}
                                <span className="text-[10px] text-amber-400">HD</span>
                              </span>
                              <span className="text-[11px] text-zinc-400">{v.gender === 'MALE' ? 'Erkek' : v.gender === 'FEMALE' ? 'Kadın' : '—'}</span>
                            </button>
                          )
                        })}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex-1">
                        <span className={lbl}>Konuşma hızı · {(draft.voice.rate ?? 1).toFixed(2).replace('.', ',')}×</span>
                        <input type="range" min={0.8} max={1.3} step={0.05} value={draft.voice.rate ?? 1} onChange={(e) => S.setD({ voice: { ...draft.voice, rate: Number(e.target.value) } })} className="w-full accent-red-500" />
                      </label>
                      <button type="button" onClick={() => void S.playSample()} disabled={S.sampling} className={ghost}>
                        {S.sampling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Dinle
                      </button>
                    </div>
                    <label className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" checked={draft.sfx} onChange={(e) => S.setD({ sfx: e.target.checked })} className="accent-red-500" />
                      Efekt sesleri (geçiş, vurgu, kapanış)
                    </label>
                  </div>
                ) : null}

                {tool === 'music' ? (
                  <div className="space-y-1.5">
                    <span className={lbl}>Arka plan müziği (konuşma sırasında otomatik kısılır)</span>
                    {STORY_MUSIC.map((m: StoryMusic) => (
                      <button key={m} type="button" onClick={() => S.setD({ music: m })} className={cn(card(draft.music === m), 'flex w-full items-center justify-between')}>
                        <span className="text-[13px] font-semibold">{MUSIC_LABEL[m]}</span>
                        {STYLE_THEME[draft.style].defaults?.music === m ? <span className="text-[10px] font-bold text-red-300">türün müziği</span> : null}
                      </button>
                    ))}
                  </div>
                ) : null}

                {tool === 'style' ? (
                  <div className="space-y-3">
                    <span className={lbl}>Video türü — ses, müzik ve başlık görünümü birlikte değişir</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {STORY_STYLES.filter((s) => STYLE_THEME[s].genre).map((s) => (
                        <button key={s} type="button" onClick={() => S.changeStyle(s)} className={card(draft.style === s)}>
                          <span className="mb-1 block h-1.5 w-10 rounded" style={{ background: STYLE_THEME[s].colors?.[0] ?? '#E30613' }} />
                          <span className="block text-[13px] font-bold">{STYLE_THEME[s].label}</span>
                          <span className="line-clamp-2 text-[11px] text-zinc-400">{STYLE_THEME[s].hint}</span>
                        </button>
                      ))}
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer font-semibold text-zinc-300">Sade çizim görünümleri</summary>
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        {STORY_STYLES.filter((s) => !STYLE_THEME[s].genre).map((s) => (
                          <button key={s} type="button" onClick={() => S.changeStyle(s)} className={card(draft.style === s)}>
                            <span className="text-[13px] font-bold">{STYLE_THEME[s].label}</span>
                          </button>
                        ))}
                      </div>
                    </details>
                    <div className="flex flex-wrap gap-4">
                      <div>
                        <span className={lbl}>Biçim</span>
                        <div className="inline-flex gap-1 rounded-lg bg-[#0E0F11] p-1">
                          {(['vertical', 'horizontal'] as const).map((f) => (
                            <button key={f} type="button" onClick={() => S.setD({ format: f })} className={cn('rounded-md px-3 py-1.5 text-xs font-semibold', draft.format === f ? 'bg-[#2A2B30] text-white' : 'text-zinc-400')}>
                              {f === 'vertical' ? 'Dikey 9:16' : 'Yatay 16:9'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className={lbl}>Süre hedefi</span>
                        <div className="inline-flex gap-1 rounded-lg bg-[#0E0F11] p-1">
                          {TARGET_MINUTES.map((t) => (
                            <button key={t} type="button" onClick={() => S.changeTarget(t)} className={cn('rounded-md px-3 py-1.5 text-xs font-semibold', draft.targetMin === t ? 'bg-[#2A2B30] text-white' : 'text-zinc-400')}>
                              {t} dk
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <label className="block">
                      <span className={lbl}>Üst etiket (videonun tepesindeki kırmızı yazı)</span>
                      <input value={draft.seriesLabel} onChange={(e) => S.setD({ seriesLabel: e.target.value })} className={fld} maxLength={32} />
                    </label>
                  </div>
                ) : null}

                {tool === 'ai' ? (
                  <div className="space-y-2">
                    <AiStep n={1} title="Anlatımı ve sahneleri hazırla" desc="Konudan / haberden, seçili türün tonunda; görüntüleri uygun cümlelere eşler." onClick={() => void S.plan()} disabled={!p || !!busy} />
                    <AiStep
                      n={2}
                      title="Eksik görselleri çiz"
                      desc={`${missing.length} sahne${S.usage ? ` · yaklaşık ${(missing.length * S.usage.price).toFixed(2)} $ · bu ay ${S.usage.usd.toFixed(2)} / ${S.usage.budget} $` : ''}`}
                      onClick={() => void S.makeImages()}
                      disabled={!p || !!busy || !missing.length}
                    />
                    <AiStep n={3} title="Videoyu üret" desc="Eksik görsel kalırsa önce çizer; bütçe yetmezse metin kartı kullanır." onClick={() => void S.render()} disabled={!p || !!busy || !scenes.length || !!problem} />
                    {problem ? <p className="rounded-lg bg-amber-500/10 p-2 text-[12px] text-amber-300">{problem}</p> : null}
                  </div>
                ) : null}

                {tool === 'end' ? (
                  <div className="space-y-2 text-[13px] text-zinc-300">
                    <p>Her video <b>nahaber.com</b> kapanış kartıyla biter (2,6 sn, NaHaber logosu ve kapanış sesi).</p>
                    <p className="text-zinc-500">Kapanış kapatılamaz; Reels, Medya projesi ve yüklenen videolarda da aynı kapanış kullanılır.</p>
                  </div>
                ) : null}
              </div>
            </section>

            {/* ── CENTER: preview ── */}
            <section className="flex min-h-0 flex-col rounded-xl bg-[#1A1B1E]">
              <div className="flex h-10 items-center justify-between border-b border-[#26272B] px-3 text-xs text-zinc-400">
                <span className="font-semibold text-zinc-200">Önizleme</span>
                <div className="flex items-center gap-2">
                  {p?.render.outputUrl ? (
                    <div className="inline-flex rounded-md bg-[#0E0F11] p-0.5">
                      <button type="button" onClick={() => setShowVideo(false)} className={cn('rounded px-2 py-0.5', !showVideo && 'bg-[#2A2B30] text-white')}>Sahne</button>
                      <button type="button" onClick={() => setShowVideo(true)} className={cn('rounded px-2 py-0.5', showVideo && 'bg-[#2A2B30] text-white')}>
                        Video{fresh ? '' : ' (eski)'}
                      </button>
                    </div>
                  ) : null}
                  <span>{cur ? `Sahne ${selIdx + 1} / ${scenes.length}` : ''}</span>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#0B0C0E] p-3">
                {showVideo && p?.render.outputUrl ? (
                  <video key={p.render.outputUrl} src={p.render.outputUrl} controls className="max-h-full max-w-full rounded-lg" />
                ) : scenes.length ? (
                  <div className="origin-center" style={{ transform: 'scale(var(--pv-scale, 1))' }}>
                    <FramePreview scene={cur} asset={cur ? assetOf(cur.visual) : undefined} thumb={thumb} format={draft.format} style={draft.style} series={draft.seriesLabel} title={draft.title} width={draft.format === 'vertical' ? 250 : 420} />
                  </div>
                ) : (
                  <div className="max-w-xs text-center text-sm text-zinc-500">
                    {busy ? 'Hazırlanıyor…' : 'Henüz sahne yok. Soldan «AI» → «Anlatımı ve sahneleri hazırla».'}
                  </div>
                )}
              </div>
              {p?.render.outputUrl ? (
                <div className="flex h-10 items-center justify-center gap-4 border-t border-[#26272B] text-xs">
                  <a href={p.render.outputUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-zinc-300 hover:text-white">
                    <Download className="h-3.5 w-3.5" /> MP4 indir
                  </a>
                  <span className="text-zinc-500">{p.render.seconds ? `${Math.round(p.render.seconds)} sn` : ''}</span>
                </div>
              ) : null}
            </section>

            {/* ── RIGHT: details ── */}
            <section className="flex min-h-0 flex-col rounded-xl bg-[#1A1B1E]">
              <div className="flex h-10 items-center justify-between border-b border-[#26272B] px-3">
                <span className="text-[13px] font-bold text-red-400">{cur ? `Sahne ${selIdx + 1} · Ayrıntılar` : 'Ayrıntılar'}</span>
                {cur ? (
                  <div className="flex items-center gap-0.5">
                    <button type="button" aria-label="Sahneyi sola taşı" onClick={() => S.nudge(cur.id, -1)} className="rounded p-1 text-zinc-400 hover:bg-white/10"><ChevronLeft className="h-4 w-4" /></button>
                    <button type="button" aria-label="Sahneyi sağa taşı" onClick={() => S.nudge(cur.id, 1)} className="rounded p-1 text-zinc-400 hover:bg-white/10"><ChevronRight className="h-4 w-4" /></button>
                    <button type="button" aria-label="Sahneyi sil" onClick={() => S.deleteScene(cur.id)} className="rounded p-1 text-zinc-400 hover:bg-white/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ) : null}
              </div>
              {cur ? (
                <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3.5">
                  <label className="block">
                    <span className={lbl}>Anlatım (seslendirilir ve altyazı olur)</span>
                    <textarea value={cur.text} onChange={(e) => S.patchScene(cur.id, (x) => ({ ...x, text: e.target.value }))} rows={4} className={fld} />
                    <span className="text-[10px] text-zinc-500">≈ {sceneLen(cur.text).toFixed(1).replace('.', ',')} sn · {[...cur.text].length} karakter</span>
                  </label>
                  <div>
                    <span className={lbl}>Görüntü</span>
                    <div className="flex items-center gap-2.5">
                      <span className="h-16 w-16 shrink-0 overflow-hidden rounded-lg" style={{ background: KIND_COLOR[cur.visual.kind] + '33' }}>
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </span>
                      <select value={cur.visual.kind === 'asset' ? cur.visual.assetId : cur.visual.kind} onChange={(e) => S.setVisualKind(cur, e.target.value)} className={fld} aria-label="Sahnenin görüntüsü">
                        {p?.assets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.kind === 'video' ? '🎬' : '🖼'} {a.name}
                          </option>
                        ))}
                        <option value="ai">AI çizimi</option>
                        <option value="card">Metin kartı (görüntüsüz)</option>
                      </select>
                    </div>
                    {cur.visual.kind === 'ai' ? (
                      <label className="mt-2 block">
                        <span className={lbl}>Çizim tarifi (boşsa anlatımdan)</span>
                        <textarea value={cur.visual.prompt} onChange={(e) => S.patchScene(cur.id, (x) => (x.visual.kind === 'ai' ? { ...x, visual: { ...x.visual, prompt: e.target.value } } : x))} rows={2} className={fld} />
                      </label>
                    ) : null}
                    {cur.visual.kind === 'asset' && assetOf(cur.visual)?.kind === 'video' ? (
                      <label className="mt-2 flex items-center gap-2 text-[12px]">
                        <input type="checkbox" checked={cur.keepAudio} onChange={(e) => S.patchScene(cur.id, (x) => ({ ...x, keepAudio: e.target.checked }))} className="accent-red-500" />
                        Videonun kendi sesi de duyulsun
                      </label>
                    ) : null}
                    {cur.visual.kind === 'asset' && assetOf(cur.visual)?.description ? (
                      <p className="mt-2 rounded-lg bg-[#202125] p-2 text-[11px] text-zinc-400">AI bu görüntüde: {assetOf(cur.visual)?.description}</p>
                    ) : null}
                  </div>
                  {hasHeadline(draft.style) ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      <label className="block">
                        <span className={lbl}>Hareketli başlık</span>
                        <input value={cur.headline ?? ''} onChange={(e) => S.patchScene(cur.id, (x) => ({ ...x, headline: e.target.value || null }))} maxLength={40} className={fld} />
                      </label>
                      <label className="block">
                        <span className={lbl}>Alt satır</span>
                        <input value={cur.sub ?? ''} onChange={(e) => S.patchScene(cur.id, (x) => ({ ...x, sub: e.target.value || null }))} maxLength={48} className={fld} placeholder="isteğe bağlı" />
                      </label>
                    </div>
                  ) : null}
                  <details className="border-t border-[#26272B] pt-2.5">
                    <summary className="cursor-pointer text-xs font-bold text-zinc-300">Gelişmiş — vurgu, etiket, çekim notu</summary>
                    <div className="mt-2.5 space-y-2.5">
                      <label className="block">
                        <span className={lbl}>Vurgu (sarı kelimeler, virgülle)</span>
                        <input value={cur.highlights.join(', ')} onChange={(e) => S.patchScene(cur.id, (x) => ({ ...x, highlights: e.target.value.split(',').map((w) => w.trim()).filter(Boolean).slice(0, 4) }))} className={fld} />
                      </label>
                      <label className="block">
                        <span className={lbl}>Etiket</span>
                        <input value={cur.label ?? ''} onChange={(e) => S.patchScene(cur.id, (x) => ({ ...x, label: e.target.value || null }))} className={fld} />
                      </label>
                      <label className="block">
                        <span className={lbl}>Çekim notu (eklenecek görüntü)</span>
                        <input value={cur.need ?? ''} onChange={(e) => S.patchScene(cur.id, (x) => ({ ...x, need: e.target.value || null }))} className={fld} placeholder="ör. olay yerinin geniş açı fotoğrafı" />
                      </label>
                    </div>
                  </details>
                </div>
              ) : (
                <p className="p-4 text-sm text-zinc-500">Zaman çizelgesinden bir sahne seçin.</p>
              )}
            </section>
          </div>

          {/* ── TIMELINE ── */}
          <section className="flex h-[250px] shrink-0 flex-col overflow-hidden rounded-xl bg-[#1A1B1E]">
            <div className="flex h-10 items-center gap-1.5 border-b border-[#26272B] px-2.5">
              <button type="button" onClick={S.addScene} className={ghost}>
                <Plus className="h-3.5 w-3.5" /> Sahne
              </button>
              {cur ? (
                <button type="button" onClick={() => S.deleteScene(cur.id)} className={ghost}>
                  <Trash2 className="h-3.5 w-3.5" /> Sil
                </button>
              ) : null}
              {S.dirty ? (
                <button type="button" onClick={() => void save()} disabled={!!busy} className={ghost}>
                  <Save className="h-3.5 w-3.5" /> Kaydet
                </button>
              ) : null}
              <div className="ml-auto flex items-center gap-3.5 text-[11px] text-zinc-400">
                {(['asset', 'ai', 'card'] as const).map((k) => (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" style={{ background: KIND_COLOR[k] }} />
                    {KIND_LABEL[k]}
                  </span>
                ))}
                <label className="flex items-center gap-1.5">
                  Yakınlık
                  <input type="range" min={0.5} max={3} step={0.1} value={S.zoom} onChange={(e) => S.setZoom(Number(e.target.value))} className="w-28 accent-red-500" />
                </label>
              </div>
            </div>
            <div className="flex min-h-0 flex-1">
              <div className="flex w-[84px] shrink-0 flex-col border-r border-[#26272B] text-[11px] font-semibold text-zinc-400">
                <div className="h-5" />
                <div className="flex h-[74px] items-center pl-3">Görüntü</div>
                <div className="flex h-9 items-center pl-3">Başlık</div>
                <div className="flex h-10 items-center pl-3">Anlatım</div>
                <div className="flex h-8 items-center pl-3">Müzik</div>
              </div>
              <div className="min-w-0 flex-1 overflow-x-auto px-3">
                <div style={{ width: Math.max(600, (total + 3) * pxPerSec) }} className="relative">
                  <div className="flex h-5 text-[10px] text-zinc-500">
                    {Array.from({ length: Math.ceil(total / 5) + 2 }, (_, i) => (
                      <span key={i} className="shrink-0 border-l border-[#2F3136] pl-1" style={{ width: 5 * pxPerSec }}>
                        {fmt(i * 5)}
                      </span>
                    ))}
                  </div>
                  <div className="flex h-[74px] items-stretch gap-[3px] py-1">
                    {scenes.map((s, i) => {
                      const t = S.thumbOf(s.visual)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          draggable
                          onDragStart={() => setDragScene(s.id)}
                          onDragEnd={() => setDragScene(null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault()
                            if (dragAsset) S.assignAsset(s.id, dragAsset)
                            else if (dragScene) S.moveScene(dragScene, s.id)
                            setDragAsset(null)
                            setDragScene(null)
                          }}
                          onClick={() => S.setSel(s.id)}
                          title={s.text}
                          className={cn('relative shrink-0 overflow-hidden rounded-md text-left', s.id === sel && 'ring-2 ring-white')}
                          style={{ width: timing[i]!.len * pxPerSec - 3, background: '#2A2B30', borderBottom: `4px solid ${KIND_COLOR[s.visual.kind]}` }}
                        >
                          {t ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={t} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
                          ) : null}
                          <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] font-bold text-white">{i + 1}</span>
                          <span className="absolute inset-x-1 bottom-1 truncate text-[10px] font-semibold text-white [text-shadow:0_1px_2px_#000]">{s.text}</span>
                        </button>
                      )
                    })}
                    <span className="flex shrink-0 items-center justify-center rounded-md border-b-4 border-red-600 bg-[#1F2937] text-[10px] font-bold text-white" style={{ width: 2.6 * pxPerSec - 3 }} title="nahaber.com kapanışı">
                      nahaber.com
                    </span>
                  </div>
                  <div className="flex h-9 items-center gap-[3px]">
                    {scenes.map((s, i) => (
                      <span key={s.id} className="shrink-0" style={{ width: timing[i]!.len * pxPerSec - 3 }}>
                        {s.headline || s.label ? <span className="block truncate rounded border border-amber-800 bg-[#3B2F0B] px-1.5 py-0.5 text-[10px] font-bold text-amber-200">{s.headline || s.label}</span> : null}
                      </span>
                    ))}
                  </div>
                  <div className="flex h-10 items-center gap-[3px]">
                    {scenes.map((s, i) => (
                      <span key={s.id} className="flex h-7 shrink-0 items-center gap-[2px] overflow-hidden rounded border border-emerald-900 bg-[#12322A] px-1" style={{ width: timing[i]!.len * pxPerSec - 3 }}>
                        {Array.from({ length: Math.max(2, Math.floor((timing[i]!.len * pxPerSec - 10) / 4)) }, (_, k) => (
                          <span key={k} className="w-[2px] shrink-0 rounded bg-emerald-400" style={{ height: 6 + ((k * 7 + i * 13) % 15) }} />
                        ))}
                      </span>
                    ))}
                  </div>
                  <div className="flex h-8 items-center">
                    <span className="flex h-[22px] items-center rounded border border-blue-900 bg-[#1E2A4A] px-2 text-[10px] font-semibold text-blue-300" style={{ width: Math.max(80, (total + 2.6) * pxPerSec) }}>
                      {draft.music === 'none' ? 'Müzik yok' : `${musicName} · konuşma sırasında kısılır`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function AiStep(props: { n: number; title: string; desc: string; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" onClick={props.onClick} disabled={props.disabled} className="flex w-full items-center gap-2.5 rounded-xl border border-[#2A2C31] bg-[#1C1D21] p-2.5 text-left hover:border-violet-500 disabled:opacity-40">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#3B1D5A] font-extrabold text-violet-300">{props.n}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold">{props.title}</span>
        <span className="block text-[11px] text-zinc-400">{props.desc}</span>
      </span>
    </button>
  )
}

type Studio = ReturnType<typeof useStoryStudio>
type Acc = NonNullable<Studio['accounts']>[number]

function SharePanel(props: {
  S: Studio
  groups: Record<AccGroup, Acc[]>
  accQ: string
  setAccQ: (v: string) => void
  accFilter: 'all' | AccGroup | 'sel'
  setAccFilter: (v: 'all' | AccGroup | 'sel') => void
  togglePick: (id: string) => void
  chosenCount: number
  chosenSummary: string
  onShare: () => void
}) {
  const { S } = props
  const p = S.p
  const q = fold(props.accQ).trim()
  const visible = (a: Acc) => (!q || fold(`${a.displayName} ${a.username ?? ''} ${a.platform}`).includes(q)) && (props.accFilter !== 'sel' || S.picked.has(a.accountId))
  const order: AccGroup[] = props.accFilter === 'all' || props.accFilter === 'sel' ? ['main', 'city', 'other'] : [props.accFilter]
  const sending = S.rows.some((r) => r.state === 'sending')
  return (
    <div className="flex min-h-0 flex-1 flex-wrap gap-4 overflow-auto p-4">
      <section className="flex min-w-0 flex-[1_1_420px] flex-wrap gap-4">
        <div className="shrink-0">
          {p?.render.outputUrl ? <video src={p.render.outputUrl} controls className="max-h-[520px] w-[280px] rounded-xl bg-black" /> : null}
        </div>
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-3">
          <div>
            <span className={lbl}>Biçim</span>
            <div className="inline-flex gap-1 rounded-lg bg-[#1C1D21] p-1">
              {(['reel', 'video_story'] as const).map((f) => (
                <button key={f} type="button" onClick={() => S.setShareFmt(f)} className={cn('rounded-md px-3 py-1.5 text-xs font-semibold', S.shareFmt === f ? 'bg-[#2A2B30] text-white' : 'text-zinc-400')}>
                  {f === 'reel' ? 'Reels / Shorts' : 'Video hikâye'}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-1 flex-col">
            <span className={lbl}>Açıklama</span>
            <textarea value={S.draft.caption || S.caption} onChange={(e) => S.setD({ caption: e.target.value })} rows={10} className={cn(fld, 'min-h-[200px] flex-1')} />
            <span className="mt-1 text-[11px] text-zinc-500">Paylaşırken kaydedilir. AI çizimi kullanıldıysa «temsilî çizim» notu kendiliğinden eklenir.</span>
          </label>
          {p?.render.outputUrl ? (
            <a href={p.render.outputUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-red-300 hover:text-red-200">
              <Download className="h-4 w-4" /> MP4 indir
            </a>
          ) : null}
        </div>
      </section>

      <section className="flex min-h-[520px] min-w-0 flex-[1_1_520px] flex-col overflow-hidden rounded-xl bg-[#1A1B1E]">
        <div className="space-y-2.5 border-b border-[#26272B] p-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-extrabold text-white">Hesaplar</h2>
            <span className="text-xs text-zinc-400">{S.accounts ? `${S.accounts.length} hesap` : 'yükleniyor…'}</span>
          </div>
          <input value={props.accQ} onChange={(e) => props.setAccQ(e.target.value)} className={fld} placeholder="Hesap veya il ara" aria-label="Hesap ara" />
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['all', 'Tümü'],
                ['main', 'Ana hesaplar'],
                ['city', 'İl hesapları'],
                ['other', 'Konu / diğer'],
                ['sel', `Seçili (${props.chosenCount})`],
              ] as const
            ).map(([id, l]) => (
              <button key={id} type="button" onClick={() => props.setAccFilter(id)} className={cn('rounded-full border px-3 py-1 text-xs font-semibold', props.accFilter === id ? 'border-zinc-100 bg-zinc-100 text-zinc-900' : 'border-[#3F3F46] bg-[#1C1D21] text-zinc-300')}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3.5">
          {order.map((g) => {
            const items = props.groups[g].filter(visible)
            if (!items.length) return null
            return (
              <div key={g}>
                <div className="mb-1.5 text-[11px] font-bold tracking-wider text-zinc-500">{GROUP_LABEL[g]}</div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1.5">
                  {items.map((a) => {
                    const on = S.picked.has(a.accountId)
                    return (
                      <button
                        key={a.accountId}
                        type="button"
                        disabled={!a.selectable}
                        onClick={() => props.togglePick(a.accountId)}
                        title={a.reason ?? undefined}
                        aria-pressed={on}
                        className={cn('flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left disabled:opacity-40', on ? 'border-red-500 bg-[#2A1416]' : 'border-[#2A2C31] bg-[#1C1D21] hover:border-zinc-500')}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2A2B30] text-[10px] font-extrabold uppercase">{(PLATFORM_LABEL[a.platform] ?? a.platform).slice(0, 2)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">{a.displayName}</span>
                          <span className="block text-[11px] text-zinc-400">{PLATFORM_LABEL[a.platform] ?? a.platform}{a.reason ? ` · ${a.reason}` : ''}</span>
                        </span>
                        <span className={cn('h-4 w-4 shrink-0 rounded border-2', on ? 'border-red-500 bg-red-500' : 'border-zinc-600')} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        {S.rows.length ? (
          <ul className="max-h-40 space-y-1 overflow-y-auto border-t border-[#26272B] p-3 text-[12px]">
            {S.rows.map((r) => (
              <li key={r.accountId} className="flex gap-2">
                <span className={cn('font-bold', r.state === 'ok' ? 'text-emerald-400' : r.state === 'failed' ? 'text-red-400' : r.state === 'uncertain' ? 'text-amber-400' : 'text-zinc-400')}>
                  {r.state === 'ok' ? '✓' : r.state === 'failed' ? '✗' : r.state === 'uncertain' ? '?' : '…'}
                </span>
                <span className="truncate">{r.label}</span>
                <span className="ml-auto shrink-0 text-zinc-400">{r.text}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-2.5 border-t border-[#26272B] p-3.5">
          <span className="min-w-[200px] flex-1 text-xs text-zinc-400">{props.chosenCount ? `${props.chosenCount} hesap seçildi · ${props.chosenSummary}` : 'Hesap seçin'}</span>
          <button type="button" onClick={props.onShare} disabled={!props.chosenCount || sending} className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-extrabold text-white hover:bg-red-500 disabled:opacity-40">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Şimdi paylaş
          </button>
        </div>
      </section>
    </div>
  )
}


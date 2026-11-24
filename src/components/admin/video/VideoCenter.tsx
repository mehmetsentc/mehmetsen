'use client'

/**
 * VIDEO-MERKEZI — tek giriş: «Ne üretmek istiyorsun?» → Başlat → Düzenle (odak modu) → Paylaş.
 * Eski Reels Stüdyosu /admin/media-studio/reels adresinde yedek olarak duruyor.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, FileText, Film, ListVideo, Loader2, Newspaper, Scissors, Search, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { reelsCall } from '@/components/admin/social/reelsApi'
import { VideoEditor, type EditorStart } from './VideoEditor'
import { ReelsStudio } from '@/components/admin/social/ReelsStudio'
import { VideoCutHome } from './VideoCutEditor'
import { renderKeyFor, STORY_STYLES, STYLE_THEME, TARGET_MINUTES, type StoryFormat, type StoryProject, type StoryStyle, type TargetMin } from '@/lib/story/storyProject'

const API = '/api/admin/social/story-projects'
type NewsHit = { newsId: string; title: string; category: string; city: string | null; imageUrl: string | null; hasVideo: boolean; publishedAt: number | null }
type Filter = 'all' | 'draft' | 'ready'

const statusOf = (p: StoryProject): { k: 'ready' | 'draft' | 'error'; label: string } =>
  p.render.status === 'ready' && p.render.key === renderKeyFor(p)
    ? { k: 'ready', label: 'Hazır' }
    : p.render.status === 'failed'
      ? { k: 'error', label: 'Hata' }
      : { k: 'draft', label: p.scenes.length ? 'Taslak' : 'Boş taslak' }
const BADGE = { ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', draft: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300', error: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' }
const when = (t: number) => {
  const d = new Date(t)
  const today = new Date()
  return d.toDateString() === today.toDateString() ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

export function VideoCenter() {
  const params = useSearchParams()
  const router = useRouter()
  const [editor, setEditor] = useState<EditorStart | null>(null)
  const [view, setView] = useState<'hub' | 'start' | 'upload' | 'digest' | 'cut'>('hub')
  const [src, setSrc] = useState<'news' | 'text'>('news')
  const [presetNews, setPresetNews] = useState<string | null>(null)
  const [editNews, setEditNews] = useState<string | null>(null)

  // deep links: ?news=<id> (Haberler listesi) · ?p=<projectId> · ?start=news|text
  useEffect(() => {
    const news = params.get('news')
    const pid = params.get('p')
    const st = params.get('start')
    const ev = params.get('editNewsVideo')
    if (ev) {
      setEditNews(ev)
      setView('cut')
    } else if (pid) setEditor({ kind: 'project', id: pid })
    else if (news) {
      setPresetNews(news)
      setSrc('news')
      setView('start')
    } else if (st === 'news' || st === 'text') {
      setSrc(st)
      setView('start')
    } else if (st === 'upload' || st === 'digest' || st === 'cut') setView(st)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [projects, setProjects] = useState<StoryProject[] | null>(null)
  const load = useCallback(async () => {
    const r = await reelsCall<{ projects: StoryProject[] }>('GET', API)
    setProjects(r.ok ? r.data.projects : [])
    if (!r.ok) toast.error(r.error)
  }, [])
  useEffect(() => {
    if (!editor) void load()
  }, [editor, load])

  const exitEditor = () => {
    setEditor(null)
    setView('hub')
    router.replace('/admin/video')
  }

  if (editor) return <VideoEditor start={editor} onExit={exitEditor} />
  if (view === 'cut') return <VideoCutHome initialNewsId={editNews} onBack={() => (setEditNews(null), setView('hub'))} />
  if (view === 'upload' || view === 'digest')
    return (
      <div className="p-3 lg:p-4">
        <ReelsStudio key={view} lockedMode={view} onBack={() => setView('hub')} />
      </div>
    )
  if (view === 'start') return <StartView src={src} setSrc={setSrc} presetNews={presetNews} onBack={() => setView('hub')} onGo={(s) => setEditor(s)} onUpload={() => setView('upload')} />
  return <Hub projects={projects} onStart={(s) => (s === 'upload' || s === 'digest' || s === 'cut' ? setView(s) : (setSrc(s), setView('start')))} onOpen={(id) => setEditor({ kind: 'project', id })} />
}

function Hub(props: { projects: StoryProject[] | null; onStart: (s: 'news' | 'text' | 'upload' | 'digest' | 'cut') => void; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const list = useMemo(
    () => (props.projects ?? []).filter((p) => (filter === 'all' || statusOf(p).k === filter) && (!q.trim() || p.title.toLocaleLowerCase('tr-TR').includes(q.trim().toLocaleLowerCase('tr-TR')))),
    [props.projects, filter, q],
  )
  const startCard = 'group flex flex-col gap-2.5 rounded-2xl border bg-[rgb(var(--color-card))] p-5 text-left transition hover:border-red-500 hover:shadow-md'
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-7 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-[rgb(var(--color-text))]">Video Merkezi</h1>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">Haberden, metinden veya kendi videondan sosyal medyaya hazır video.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/media-studio/reels" className="text-xs font-semibold text-[rgb(var(--color-muted))] underline hover:text-[rgb(var(--color-text))]">
            Eski stüdyo
          </Link>
          <label className="flex h-10 w-72 max-w-full items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3">
            <Search className="h-4 w-4 text-[rgb(var(--color-muted))]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Projelerde ara" aria-label="Projelerde ara" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
        </div>
      </header>

      <section>
        <h2 className="mb-3.5 text-base font-bold text-[rgb(var(--color-text))]">Ne üretmek istiyorsun?</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <button type="button" onClick={() => props.onStart('news')} className={cn(startCard, 'border-2 border-red-600')}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"><Newspaper className="h-5 w-5" /></span>
            <span className="text-base font-extrabold text-[rgb(var(--color-text))]">Haberden video</span>
            <span className="text-[13px] leading-relaxed text-[rgb(var(--color-muted))]">Haberi seç, türü seç. AI anlatımı yazar, haberin fotoğraf ve videosunu dizer.</span>
            <span className="text-[11px] font-bold text-red-600">En çok kullanılan</span>
          </button>
          <button type="button" onClick={() => props.onStart('text')} className={cn(startCard, 'border-[rgb(var(--color-border))]')}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"><FileText className="h-5 w-5" /></span>
            <span className="text-base font-extrabold text-[rgb(var(--color-text))]">Metinden video</span>
            <span className="text-[13px] leading-relaxed text-[rgb(var(--color-muted))]">Bir konu ya da hazır metin yaz; belgesel, bilgi, sağlık… 1–10 dk.</span>
          </button>
          <button type="button" onClick={() => props.onStart('upload')} className={cn(startCard, 'border-[rgb(var(--color-border))]')}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><Upload className="h-5 w-5" /></span>
            <span className="text-base font-extrabold text-[rgb(var(--color-text))]">Kendi videonu yükle</span>
            <span className="text-[13px] leading-relaxed text-[rgb(var(--color-muted))]">Bilgisayardan videoyu yükle; manşet, seslendirme ya da sade filigran şablonu seç.</span>
          </button>
          <button type="button" onClick={() => props.onStart('digest')} className={cn(startCard, 'border-[rgb(var(--color-border))]')}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><ListVideo className="h-5 w-5" /></span>
            <span className="text-base font-extrabold text-[rgb(var(--color-text))]">Günün bülteni</span>
            <span className="text-[13px] leading-relaxed text-[rgb(var(--color-muted))]">2–7 haberi seç, tek videoda öne çıkanlar.</span>
          </button>
          <button type="button" onClick={() => props.onStart('cut')} className={cn(startCard, 'border-[rgb(var(--color-border))]')}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Scissors className="h-5 w-5" /></span>
            <span className="text-base font-extrabold text-[rgb(var(--color-text))]">Video kes ve böl</span>
            <span className="text-[13px] leading-relaxed text-[rgb(var(--color-muted))]">Uzun videoyu kısalt, böl, ortasından parça çıkar; 9:16, 1:1, 16:9 ve dosya boyutu.</span>
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[rgb(var(--color-text))]">Son projeler</h2>
          <div className="flex gap-2">
            {(
              [
                ['all', 'Tümü'],
                ['draft', 'Taslak'],
                ['ready', 'Hazır'],
              ] as const
            ).map(([id, l]) => (
              <button key={id} type="button" onClick={() => setFilter(id)} className={cn('rounded-full border px-3.5 py-1.5 text-[13px] font-semibold', filter === id ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900' : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))]')}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {props.projects === null ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-[rgb(var(--color-surface))]" />)}
          </div>
        ) : list.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[rgb(var(--color-border))] p-6 text-center text-sm text-[rgb(var(--color-muted))]">Proje yok. Yukarıdan başlayın.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {list.map((p) => {
              const st = statusOf(p)
              const cover = p.render.coverUrl ?? p.assets.find((a) => a.previewUrl)?.previewUrl ?? null
              return (
                <button key={p.id} type="button" onClick={() => props.onOpen(p.id)} className="flex flex-col overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-left transition hover:border-red-500 hover:shadow-md">
                  <span className="relative block h-40 bg-zinc-800">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Film className="absolute inset-0 m-auto h-6 w-6 text-zinc-500" />
                    )}
                    <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white">
                      {STYLE_THEME[p.style]?.label ?? p.style} · {p.format === 'horizontal' ? 'Yatay' : 'Dikey'} · {p.targetMin ?? 1} dk
                    </span>
                  </span>
                  <span className="flex flex-col gap-2 p-3">
                    <span className="line-clamp-2 text-sm font-bold text-[rgb(var(--color-text))]">{p.title}</span>
                    <span className="flex items-center justify-between">
                      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', BADGE[st.k])}>{st.label}</span>
                      <span className="text-xs text-[rgb(var(--color-muted))]">{when(p.updatedAt)}</span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function StartView(props: { src: 'news' | 'text'; setSrc: (s: 'news' | 'text') => void; presetNews: string | null; onBack: () => void; onGo: (s: EditorStart) => void; onUpload: () => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<NewsHit[] | null>(null)
  const [newsId, setNewsId] = useState<string | null>(props.presetNews)
  const [style, setStyle] = useState<StoryStyle>(props.src === 'news' ? 'haber' : 'animasyon')
  const [format, setFormat] = useState<StoryFormat>('vertical')
  const [len, setLen] = useState<TargetMin>(1)
  const [topic, setTopic] = useState('')
  const [script, setScript] = useState('')
  const [busy, setBusy] = useState(false)

  const search = useCallback(async (text: string) => {
    const r = await reelsCall<{ items: NewsHit[] }>('GET', `/api/admin/social/reels/news?q=${encodeURIComponent(text)}`)
    setHits(r.ok ? r.data.items.slice(0, 30) : [])
  }, [])
  useEffect(() => {
    void search('')
  }, [search])
  const picked = hits?.find((h) => h.newsId === newsId) ?? null

  const go = async () => {
    if (props.src === 'news') {
      if (!newsId) return toast.error('Bir haber seçin')
      props.onGo({ kind: 'news', newsId, style, format, targetMin: len })
      return
    }
    if (!topic.trim() && !script.trim()) return toast.error('Konu veya metin yazın')
    setBusy(true)
    const d = STYLE_THEME[style].defaults
    const r = await reelsCall<{ project: StoryProject }>('POST', API, {
      topic: topic.trim(),
      script: script.trim(),
      style,
      format,
      targetMin: len,
      seriesLabel: 'NaHaber',
      rights: { kind: 'owned', sourceName: null, note: null },
      ...(d ? { voice: { name: d.voice, rate: d.rate }, music: d.music, sfx: d.sfx } : {}),
    })
    setBusy(false)
    if (!r.ok) return toast.error(r.error)
    props.onGo({ kind: 'project', id: r.data.project.id, autoPlan: true })
  }

  const seg = (on: boolean) => cn('rounded-lg px-3.5 py-2 text-[13px] font-semibold', on ? 'bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] shadow' : 'text-[rgb(var(--color-muted))]')
  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={props.onBack} className="flex items-center gap-1.5 text-sm font-semibold text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
          <ArrowLeft className="h-4 w-4" /> Video Merkezi
        </button>
        <h1 className="text-xl font-extrabold text-[rgb(var(--color-text))]">Yeni video</h1>
        <ol className="ml-auto flex items-center gap-2 text-[13px] font-semibold">
          <li className="flex items-center gap-2 text-[rgb(var(--color-text))]"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs text-white">1</span>Başlat</li>
          <li className="text-zinc-300">—</li>
          <li className="flex items-center gap-2 text-[rgb(var(--color-muted))]"><span className="flex h-6 w-6 items-center justify-center rounded-full border text-xs">2</span>Düzenle</li>
          <li className="text-zinc-300">—</li>
          <li className="flex items-center gap-2 text-[rgb(var(--color-muted))]"><span className="flex h-6 w-6 items-center justify-center rounded-full border text-xs">3</span>Paylaş</li>
        </ol>
      </header>

      <div className="flex flex-wrap gap-6">
        <section className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5">
          <h2 className="text-lg font-extrabold text-[rgb(var(--color-text))]">1. Kaynak</h2>
          <div role="tablist" className="inline-flex gap-1 self-start rounded-xl bg-[rgb(var(--color-surface))] p-1">
            <button type="button" role="tab" aria-selected={props.src === 'news'} onClick={() => props.setSrc('news')} className={seg(props.src === 'news')}>Haber</button>
            <button type="button" role="tab" aria-selected={props.src === 'text'} onClick={() => props.setSrc('text')} className={seg(props.src === 'text')}>Metin</button>
            <button type="button" role="tab" aria-selected={false} onClick={props.onUpload} className={seg(false)}>Kendi videom</button>
          </div>
          {props.src === 'news' ? (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void search(q)
                }}
                className="flex h-11 items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3"
              >
                <Search className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Haber başlığında ara — Enter" aria-label="Haber ara" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
              </form>
              {props.presetNews && !picked ? <p className="text-xs text-[rgb(var(--color-muted))]">Haberler listesinden seçilen haber: {props.presetNews}</p> : null}
              <div className="flex max-h-[560px] flex-col gap-2 overflow-y-auto pr-1">
                {hits === null ? (
                  [0, 1, 2, 3].map((i) => <div key={i} className="h-[74px] animate-pulse rounded-xl bg-[rgb(var(--color-surface))]" />)
                ) : hits.length === 0 ? (
                  <p className="text-sm text-[rgb(var(--color-muted))]">Haber bulunamadı.</p>
                ) : (
                  hits.map((n) => (
                    <button key={n.newsId} type="button" onClick={() => setNewsId(n.newsId)} aria-pressed={newsId === n.newsId} className={cn('flex items-center gap-3 rounded-xl border bg-[rgb(var(--color-card))] p-2.5 text-left', newsId === n.newsId ? 'border-2 border-red-600' : 'border-[rgb(var(--color-border))] hover:border-zinc-400')}>
                      {n.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={n.imageUrl} alt="" className="h-14 w-[72px] shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="h-14 w-[72px] shrink-0 rounded-lg bg-[rgb(var(--color-surface))]" />
                      )}
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-sm font-bold text-[rgb(var(--color-text))]">{n.title}</span>
                        <span className="text-xs text-[rgb(var(--color-muted))]">{[n.category, n.city, n.hasVideo ? 'videolu' : null].filter(Boolean).join(' · ')}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2.5">
              <label className="text-[13px] font-semibold text-[rgb(var(--color-text))]" htmlFor="vc-topic">Konu</label>
              <textarea id="vc-topic" value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} maxLength={1200} placeholder="ör. Deprem anında ne yapmalı?" className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 text-sm" />
              <label className="text-[13px] font-semibold text-[rgb(var(--color-text))]" htmlFor="vc-script">Hazır metin <span className="font-normal text-[rgb(var(--color-muted))]">(isteğe bağlı — yazarsan AI değiştirmez)</span></label>
              <textarea id="vc-script" value={script} onChange={(e) => setScript(e.target.value)} rows={9} className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 text-sm" />
            </div>
          )}
        </section>

        <section className="flex min-w-0 flex-[1_1_520px] flex-col gap-3.5">
          <h2 className="text-lg font-extrabold text-[rgb(var(--color-text))]">2. Video türü</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {STORY_STYLES.filter((s) => STYLE_THEME[s].genre).map((s) => {
              const t = STYLE_THEME[s]
              const on = style === s
              return (
                <button key={s} type="button" onClick={() => setStyle(s)} aria-pressed={on} className={cn('flex flex-col gap-2 rounded-2xl border bg-[rgb(var(--color-card))] p-2.5 text-left', on ? 'border-2 border-red-600' : 'border-[rgb(var(--color-border))] hover:border-zinc-400')}>
                  <span className="flex h-20 items-end rounded-xl p-2" style={{ background: t.cardBg ? t.cardBg[1] : '#111827' }}>
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white" style={{ background: t.colors?.[0] ?? '#E30613' }}>{t.label}</span>
                  </span>
                  <span className="text-sm font-bold text-[rgb(var(--color-text))]">{t.label}</span>
                  <span className="line-clamp-2 text-xs text-[rgb(var(--color-muted))]">{t.hint}</span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-end gap-6">
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-[rgb(var(--color-text))]">Biçim</span>
              <div className="inline-flex gap-1 rounded-xl bg-[rgb(var(--color-surface))] p-1">
                <button type="button" onClick={() => setFormat('vertical')} className={seg(format === 'vertical')}>Dikey 9:16</button>
                <button type="button" onClick={() => setFormat('horizontal')} className={seg(format === 'horizontal')}>Yatay 16:9</button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-[rgb(var(--color-text))]">Süre</span>
              <div className="inline-flex gap-1 rounded-xl bg-[rgb(var(--color-surface))] p-1">
                {TARGET_MINUTES.map((t) => (
                  <button key={t} type="button" onClick={() => setLen(t)} className={seg(len === t)}>{t} dk</button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-4">
            <div className="text-[13px] leading-relaxed text-[rgb(var(--color-muted))]">
              <b className="text-[rgb(var(--color-text))]">
                {STYLE_THEME[style].label} · {format === 'vertical' ? 'Dikey 9:16' : 'Yatay 16:9'} · {len} dk
              </b>
              <br />
              Ses, müzik ve efektler türe göre hazır; sonra değiştirebilirsin. Her video nahaber.com kapanışıyla biter.
            </div>
            <button type="button" onClick={() => void go()} disabled={busy || (props.src === 'news' && !newsId)} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-[15px] font-extrabold text-white hover:bg-red-500 disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              AI ile hazırla <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

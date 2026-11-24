'use client'

/**
 * VIDEO-KES — «Video kes ve böl» (Video Merkezi). Uzun bir videodan parçalar:
 *   kısalt (başlangıç / bitiş), böl (oynatma çizgisinden ikiye), ortadan çıkar (aralık sil),
 *   biçim (9:16, 1:1, 4:5, 16:9, orijinal; bulanık arka plan ya da kırp + kadraj),
 *   kalite (tam / 720p) ve dosya boyutu sınırı, ses kapatma. Her parça ayrı üretilir ve paylaşılır;
 *   hepsi nahaber.com kapanışıyla biter. Sunucu: /api/admin/social/media-projects (medya projesi).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Copy, Download, Film, Loader2, Pause, Play, Plus, Save, Scissors, SkipBack, SkipForward, Trash2, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { reelsCall, runReelJob } from '@/components/admin/social/reelsApi'
import { NewProject, SharePanel } from '@/components/admin/social/MediaProjectStudio'
import {
  CLIP_MAX_MS,
  CLIP_MIN_MS,
  CUT_MIN_MS,
  DEFAULT_CLIP_OPTIONS,
  MAX_CLIPS,
  MAX_CUTS,
  RANGE_MAX_MS,
  clipSeconds,
  type ClipFrame,
  type ClipOptions,
  type MediaClip,
  type MediaProject,
} from '@/lib/media/mediaProject'

const API = '/api/admin/social/media-projects'
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('')
const t = (ms: number) => {
  const s = Math.max(0, ms) / 1000
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
}
const COLORS = ['#E5262D', '#2563EB', '#16A34A', '#D97706', '#7C3AED', '#0891B2', '#DB2777', '#65A30D', '#EA580C', '#4F46E5', '#0D9488', '#9333EA']
const FRAME_LABEL: Record<ClipFrame, string> = { vertical: '9:16 Reels', square: '1:1 Kare', portrait45: '4:5 Gönderi', landscape: '16:9 YouTube', original: 'Orijinal' }
const fld = 'w-full rounded-lg border border-[#2F3136] bg-[#0E0F11] px-2.5 py-1.5 text-[13px] text-zinc-100 focus:border-red-500 focus:outline-none'
const lbl = 'mb-1.5 block text-[11px] font-semibold text-zinc-400'
const ghost = 'inline-flex items-center gap-1.5 rounded-lg border border-[#3F3F46] bg-[#1C1D21] px-2.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-[#26272B] disabled:cursor-not-allowed disabled:opacity-40'
const seg = (on: boolean) => cn('rounded-md px-2.5 py-1.5 text-xs font-semibold', on ? 'bg-[#2A2B30] text-white' : 'text-zinc-400 hover:text-zinc-200')

type Draft = MediaProject

/** Rough output size for the estimate shown beside the size cap (H.264 at our settings). */
function estimateMb(c: MediaClip): number {
  const s = clipSeconds(c) + (c.options.outro === false ? 0 : 2.6)
  if (c.options.maxMb) return Math.min(c.options.maxMb, s * 0.9)
  const mbps = c.options.quality === '720' ? 2.2 : c.options.frame === 'original' ? 5 : 4.2
  return (s * mbps) / 8
}

function problemOf(c: MediaClip): string | null {
  const kept = clipSeconds(c) * 1000
  if (c.endMs - c.startMs > RANGE_MAX_MS) return 'Aralık en fazla 30 dakika olabilir'
  if (kept < CLIP_MIN_MS) return 'Parça en az 3 saniye olmalı'
  if (kept > CLIP_MAX_MS) return `Parça (çıkarılanlardan sonra) en fazla 3 dakika olabilir — şu an ${t(kept)}`
  return null
}

async function patchProject(id: string, body: Record<string, unknown>): Promise<{ project?: MediaProject; error?: string }> {
  const token = (await (await import('@/lib/firebase/auth')).auth.currentUser?.getIdToken()) ?? ''
  const res = await fetch(`${API}/${id}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).catch(() => null)
  const json = res ? ((await res.json().catch(() => null)) as { project?: MediaProject; error?: string } | null) : null
  if (!res?.ok || !json?.project) return { error: json?.error ?? 'Kaydedilemedi' }
  return { project: json.project }
}

// ── list / new ───────────────────────────────────────────────────────────────

export function VideoCutHome({ onBack, initialNewsId = null }: { onBack: () => void; initialNewsId?: string | null }) {
  const [projects, setProjects] = useState<MediaProject[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [newsBusy, setNewsBusy] = useState(false)
  // HABER-VIDEO: «Videoyu düzenle» in the news editor → the news video's cutting project
  const startedNews = useRef<string | null>(null)
  useEffect(() => {
    if (!initialNewsId || startedNews.current === initialNewsId) return
    startedNews.current = initialNewsId
    setNewsBusy(true)
    void reelsCall<{ project: MediaProject }>('POST', API, { fromNewsId: initialNewsId }).then((r) => {
      setNewsBusy(false)
      if (r.ok) setOpenId(r.data.project.id)
      else toast.error(r.error, { duration: 8000 })
    })
  }, [initialNewsId])
  const load = useCallback(async () => {
    const r = await reelsCall<{ projects: MediaProject[] }>('GET', API)
    setProjects(r.ok ? r.data.projects : [])
    if (!r.ok) toast.error(r.error)
  }, [])
  useEffect(() => {
    if (!openId) void load()
  }, [openId, load])

  if (openId) return <VideoCutEditor projectId={openId} onExit={() => setOpenId(null)} />
  if (newsBusy)
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-sm text-[rgb(var(--color-muted))]">
        <Loader2 className="h-5 w-5 animate-spin" /> Haberin videosu açılıyor…
      </div>
    )
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
          <ArrowLeft className="h-4 w-4" /> Video Merkezi
        </button>
        <h1 className="text-xl font-extrabold text-[rgb(var(--color-text))]">Video kes ve böl</h1>
        <span className="text-xs text-[rgb(var(--color-muted))]">Uzun videoyu kısalt, böl, ortasından parça çıkar; biçimini ve boyutunu ayarla.</span>
        <button type="button" onClick={() => setCreating(true)} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-red-500">
          <Plus className="h-4 w-4" /> Yeni video
        </button>
      </header>
      {creating ? (
        <div className="max-w-xl rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
          <NewProject
            onCreated={(p) => {
              setCreating(false)
              setOpenId(p.id)
            }}
            onCancel={() => setCreating(false)}
          />
          <p className="mt-3 text-[11px] text-[rgb(var(--color-muted))]">Video en fazla 200 MB olabilir. Üretilen her parça en fazla 3 dakika (çıkarılan aralıklar hariç); aralık 30 dakikaya kadar uzanabilir.</p>
        </div>
      ) : null}
      {projects === null ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">{[0, 1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-2xl bg-[rgb(var(--color-surface))]" />)}</div>
      ) : projects.length === 0 && !creating ? (
        <p className="rounded-xl border border-dashed border-[rgb(var(--color-border))] p-6 text-center text-sm text-[rgb(var(--color-muted))]">Henüz video yok. «Yeni video» ile bilgisayardan yükleyin ya da kütüphaneden seçin.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {projects.map((p) => (
            <button key={p.id} type="button" onClick={() => setOpenId(p.id)} className="flex flex-col overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-left hover:border-red-500">
              <span className="relative block h-36 bg-zinc-800">
                {p.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.posterUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Film className="absolute inset-0 m-auto h-6 w-6 text-zinc-500" />
                )}
                <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white">{p.durationMs ? t(p.durationMs) : '—'} · {p.clips.length} parça</span>
              </span>
              <span className="flex flex-col gap-1 p-3">
                <span className="line-clamp-2 text-sm font-bold text-[rgb(var(--color-text))]">{p.title}</span>
                <span className="text-xs text-[rgb(var(--color-muted))]">{p.clips.filter((c) => c.status === 'ready').length} / {p.clips.length} parça hazır</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── editor ───────────────────────────────────────────────────────────────────

export function VideoCutEditor({ projectId, onExit }: { projectId: string; onExit: () => void }) {
  const [saved, setSaved] = useState<MediaProject | null>(null)
  const [d, setD] = useState<Draft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [now, setNow] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [dur, setDur] = useState<number | null>(null)
  const [markIn, setMarkIn] = useState<number | null>(null)
  const [right, setRight] = useState<'part' | 'share'>('part')
  const [showOut, setShowOut] = useState(false)
  const vRef = useRef<HTMLVideoElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)

  const open = useCallback((p: MediaProject, keepSel?: string | null) => {
    setSaved(p)
    setD(p)
    setDirty(false)
    setSel((s) => (keepSel !== undefined ? keepSel : s && p.clips.some((c) => c.id === s) ? s : (p.clips[0]?.id ?? null)))
  }, [])
  useEffect(() => {
    void reelsCall<{ project: MediaProject }>('GET', `${API}/${projectId}`).then((r) => {
      if (r.ok) open(r.data.project)
      else toast.error(r.error)
    })
  }, [projectId, open])

  const durationMs = d?.durationMs ?? (dur ? Math.round(dur * 1000) : null)
  const clip = d?.clips.find((c) => c.id === sel) ?? null
  const clipIdx = d ? d.clips.findIndex((c) => c.id === sel) : -1
  const nowMs = Math.round(now * 1000)

  const setClips = (fn: (cs: MediaClip[]) => MediaClip[]) => {
    setD((x) => (x ? { ...x, clips: fn(x.clips) } : x))
    setDirty(true)
  }
  const patchClip = (id: string, fn: (c: MediaClip) => MediaClip) =>
    setClips((cs) => cs.map((c) => (c.id === id ? { ...fn(c), status: 'draft', outputUrl: null, renderKey: null } : c)))
  const setOpt = (patch: Partial<ClipOptions>) => clip && patchClip(clip.id, (c) => ({ ...c, options: { ...c.options, ...patch } }))

  // ── player ──
  const seek = (ms: number) => {
    const v = vRef.current
    if (!v) return
    v.currentTime = Math.max(0, ms / 1000)
    setNow(v.currentTime)
  }
  const togglePlay = () => {
    const v = vRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }
  // preview the selected part: removed ranges are skipped while playing
  useEffect(() => {
    if (!clip || !playing) return
    const inside = clip.cuts?.find((x) => nowMs >= x.startMs && nowMs < x.endMs)
    if (inside) seek(inside.endMs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMs, playing])

  // ── edits ──
  const addPart = () => {
    if (!d || !durationMs) return
    if (d.clips.length >= MAX_CLIPS) return toast.error(`En fazla ${MAX_CLIPS} parça`)
    const start = Math.min(nowMs, Math.max(0, durationMs - CLIP_MIN_MS))
    const c: MediaClip = { id: newId(), name: `Parça ${d.clips.length + 1}`, startMs: start, endMs: Math.min(durationMs, start + 30_000), title: d.title, options: { ...DEFAULT_CLIP_OPTIONS }, status: 'draft', renderKey: null, outputUrl: null, coverUrl: null, seconds: null, error: null, renderedAt: null }
    setClips((cs) => [...cs, c])
    setSel(c.id)
  }
  const setStart = () => clip && (nowMs < clip.endMs - CLIP_MIN_MS ? patchClip(clip.id, (c) => ({ ...c, startMs: nowMs, cuts: (c.cuts ?? []).filter((x) => x.startMs >= nowMs) })) : toast.error('Başlangıç bitişten en az 3 sn önce olmalı'))
  const setEnd = () => clip && (nowMs > clip.startMs + CLIP_MIN_MS ? patchClip(clip.id, (c) => ({ ...c, endMs: nowMs, cuts: (c.cuts ?? []).filter((x) => x.endMs <= nowMs) })) : toast.error('Bitiş başlangıçtan en az 3 sn sonra olmalı'))
  const split = () => {
    if (!clip || !d) return
    if (d.clips.length >= MAX_CLIPS) return toast.error(`En fazla ${MAX_CLIPS} parça`)
    if (nowMs <= clip.startMs + CLIP_MIN_MS || nowMs >= clip.endMs - CLIP_MIN_MS) return toast.error('Oynatma çizgisini parçanın içine (iki uçtan en az 3 sn) getirin')
    const b: MediaClip = { ...clip, id: newId(), name: `${clip.name} (2)`, startMs: nowMs, cuts: (clip.cuts ?? []).filter((x) => x.startMs >= nowMs), status: 'draft', renderKey: null, outputUrl: null, coverUrl: null, seconds: null, error: null, renderedAt: null }
    setClips((cs) => {
      const i = cs.findIndex((c) => c.id === clip.id)
      const a: MediaClip = { ...clip, name: clip.name.endsWith('(1)') ? clip.name : `${clip.name} (1)`, endMs: nowMs, cuts: (clip.cuts ?? []).filter((x) => x.endMs <= nowMs), status: 'draft', renderKey: null, outputUrl: null }
      const n = [...cs]
      n.splice(i, 1, a, b)
      return n
    })
    toast.success('Parça ikiye bölündü')
  }
  const markCut = () => {
    if (!clip) return
    if (markIn === null) {
      if (nowMs < clip.startMs || nowMs > clip.endMs) return toast.error('Oynatma çizgisi parçanın içinde olmalı')
      setMarkIn(nowMs)
      toast('Çıkarılacak aralığın başı işaretlendi — videoyu ilerletip «Çıkarma sonu»na basın', { icon: '✂️' })
      return
    }
    const a = Math.min(markIn, nowMs)
    const b = Math.max(markIn, nowMs)
    setMarkIn(null)
    if (b - a < CUT_MIN_MS) return toast.error('Çıkarılacak aralık en az 0,3 sn olmalı')
    if ((clip.cuts?.length ?? 0) >= MAX_CUTS) return toast.error(`Bir parçadan en fazla ${MAX_CUTS} aralık çıkarılabilir`)
    patchClip(clip.id, (c) => ({ ...c, cuts: [...(c.cuts ?? []), { startMs: Math.max(a, c.startMs), endMs: Math.min(b, c.endMs) }].sort((x, y) => x.startMs - y.startMs) }))
    toast.success(`${t(b - a)} çıkarıldı; kalan kısımlar birleşecek`)
  }
  const removeCut = (i: number) => clip && patchClip(clip.id, (c) => ({ ...c, cuts: (c.cuts ?? []).filter((_, k) => k !== i) }))
  const duplicate = () => {
    if (!clip || !d || d.clips.length >= MAX_CLIPS) return
    const c: MediaClip = { ...clip, id: newId(), name: `${clip.name} (kopya)`, status: 'draft', renderKey: null, outputUrl: null, coverUrl: null, seconds: null, error: null, renderedAt: null }
    setClips((cs) => [...cs, c])
    setSel(c.id)
  }
  const removePart = () => {
    if (!clip || !confirm(`«${clip.name}» silinsin mi?`)) return
    setClips((cs) => cs.filter((c) => c.id !== clip.id))
    setSel(null)
  }

  // ── save / render ──
  const save = async (): Promise<MediaProject | null> => {
    if (!d) return null
    const bad = d.clips.map((c) => [c, problemOf(c)] as const).find(([, p]) => p)
    if (bad) {
      setSel(bad[0].id)
      toast.error(`${bad[0].name}: ${bad[1]}`)
      return null
    }
    setBusy('save')
    const r = await patchProject(d.id, { title: d.title, caption: d.caption, clips: d.clips.map((c) => ({ id: c.id, name: c.name, startMs: c.startMs, endMs: c.endMs, cuts: c.cuts ?? [], title: c.title, options: c.options })) })
    setBusy(null)
    if (!r.project) {
      toast.error(r.error ?? 'Kaydedilemedi')
      return null
    }
    open(r.project, sel)
    return r.project
  }
  const render = async (ids: string[]) => {
    const p = dirty ? await save() : saved
    if (!p) return
    for (const id of ids) {
      const c = p.clips.find((x) => x.id === id)
      if (!c) continue
      setBusy(`render:${id}`)
      const r = await runReelJob(`${API}/${p.id}/render`, { clipId: id })
      if (!r.ok || r.job.status === 'failed') toast.error(`${c.name}: ${r.ok ? (r.job.error ?? 'üretilemedi') : r.error}`)
    }
    setBusy(null)
    const fresh = await reelsCall<{ project: MediaProject }>('GET', `${API}/${p.id}`)
    if (fresh.ok) {
      open(fresh.data.project, sel)
      if (ids.length === 1) setShowOut(true)
      toast.success(ids.length > 1 ? 'Parçalar üretildi' : 'Parça hazır')
    }
  }
  const exit = () => {
    if (dirty && !confirm('Kaydedilmemiş değişiklikler var. Çıkılsın mı?')) return
    onExit()
  }

  // ── HABER-VIDEO: show the edit on the news page / put the original back ──
  const newsCall = async (body: Record<string, unknown>, okText: string) => {
    if (!d) return
    setBusy('news')
    const r = await reelsCall<{ project: MediaProject }>('POST', `${API}/${d.id}/news`, body)
    setBusy(null)
    if (!r.ok) return toast.error(r.error)
    open(r.data.project, sel)
    toast.success(okText, { duration: 9000 })
  }
  const applyNews = () =>
    clip &&
    confirm(`«${clip.name}» (${t(clipSeconds(clip) * 1000)}) haberin videosunun yerine geçecek. Orijinal video yedekte kalır, «Orijinale dön» ile geri alınabilir. Devam edilsin mi?`) &&
    void newsCall({ action: 'apply', clipId: clip.id }, 'Haberin videosu güncellendi. Haber düzenleme sekmesi açıksa sayfayı yenileyin; yoksa kaydederken eski video geri yazılır.')
  const restoreNews = () =>
    confirm('Haber sayfası orijinal videoya dönsün mü?') && void newsCall({ action: 'restore' }, 'Haber orijinal videoya döndü. Haber düzenleme sekmesi açıksa sayfayı yenileyin.')

  // ── timeline geometry ──
  const total = durationMs ?? 1
  const pct = (ms: number) => `${(Math.min(total, Math.max(0, ms)) / total) * 100}%`
  const onBar = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = barRef.current?.getBoundingClientRect()
    if (!r) return
    seek(((e.clientX - r.left) / r.width) * total)
  }
  const ticks = useMemo(() => {
    const step = total > 20 * 60_000 ? 120_000 : total > 8 * 60_000 ? 60_000 : total > 2 * 60_000 ? 30_000 : 10_000
    return Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step)
  }, [total])

  if (!d) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#111214] text-zinc-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Video açılıyor…
      </div>
    )
  }
  const prob = clip ? problemOf(clip) : null
  const kept = clip ? clipSeconds(clip) : 0
  const layout = clip?.options.frame === 'vertical' && clip.options.fit !== 'crop'

  return (
    <div className="fixed inset-0 z-[70] flex flex-col gap-1.5 bg-[#111214] px-1.5 pb-1.5 text-zinc-200" role="dialog" aria-label="Video kes ve böl">
      {/* top bar */}
      <header className="flex h-[52px] shrink-0 flex-wrap items-center gap-3 px-2">
        <button type="button" onClick={exit} className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Video kes ve böl
        </button>
        <input value={d.title} onChange={(e) => (setD({ ...d, title: e.target.value }), setDirty(true))} aria-label="Proje adı" className="min-w-[200px] max-w-[420px] flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-bold text-white hover:border-[#2F3136] focus:border-red-500 focus:outline-none" />
        <span className="text-xs text-zinc-500">{dirty ? 'Kaydedilmedi' : 'Kaydedildi'} · {durationMs ? t(durationMs) : ''} · {d.clips.length} parça</span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={!dirty || !!busy} className={ghost}>
            <Save className="h-3.5 w-3.5" /> Kaydet
          </button>
          <button type="button" onClick={() => void render(d.clips.filter((c) => c.status !== 'ready').map((c) => c.id))} disabled={!!busy || !d.clips.some((c) => c.status !== 'ready')} className={ghost}>
            Tümünü üret
          </button>
          <button type="button" onClick={() => clip && void render([clip.id])} disabled={!clip || !!busy || !!prob} title={prob ?? undefined} className="inline-flex h-[34px] items-center gap-1.5 rounded-lg bg-red-600 px-4 text-[13px] font-extrabold text-white hover:bg-red-500 disabled:opacity-40">
            {busy?.startsWith('render') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {clip?.status === 'ready' && !dirty ? 'Parça hazır' : 'Bu parçayı üret'}
          </button>
          <button type="button" onClick={() => setRight('share')} disabled={!clip || clip.status !== 'ready' || dirty} className="inline-flex h-[34px] items-center rounded-lg bg-blue-600 px-4 text-[13px] font-extrabold text-white hover:bg-blue-500 disabled:opacity-40">
            Paylaş
          </button>
        </div>
      </header>
      {d.sourceKind === 'news' && d.linkedNewsId ? (
        <div className="mx-2 -mt-1 flex flex-wrap items-center gap-3 rounded-lg border border-blue-900 bg-[#0F1A2E] px-3 py-2 text-xs text-blue-200">
          <span>
            Bu, <a className="font-bold underline" href={`/admin/news/${encodeURIComponent(d.linkedNewsId)}`} target="_blank" rel="noreferrer">haberin</a> kendi videosu.{' '}
            {d.newsApplied ? (
              <>
                Haberde şu an <b>«{d.clips.find((c) => c.id === d.newsApplied?.clipId)?.name ?? 'düzenlenmiş parça'}»</b> gösteriliyor ({new Date(d.newsApplied.at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}).
              </>
            ) : (
              'Haberde şu an orijinal video gösteriliyor.'
            )}
          </span>
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={applyNews} disabled={!clip || clip.status !== 'ready' || dirty || !!busy} title={!clip || clip.status !== 'ready' ? 'Önce bu parçayı üretin' : undefined} className="rounded-md bg-blue-600 px-3 py-1 font-bold text-white disabled:opacity-40">
              {busy === 'news' ? 'Uygulanıyor…' : 'Seçili parçayı habere uygula'}
            </button>
            {d.newsApplied ? (
              <button type="button" onClick={restoreNews} disabled={!!busy} className="rounded-md border border-blue-700 px-3 py-1 font-bold disabled:opacity-40">
                Orijinale dön
              </button>
            ) : null}
          </span>
        </div>
      ) : null}
      {busy?.startsWith('render') ? (
        <div className="mx-2 -mt-1 flex items-center gap-3 rounded-lg bg-[#1A1B1E] px-3 py-2 text-xs text-zinc-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" /> «{d.clips.find((c) => `render:${c.id}` === busy)?.name}» üretiliyor (uzun parçalarda 1–5 dk)…
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)] gap-1.5">
        {/* player */}
        <section className="flex min-h-0 flex-col rounded-xl bg-[#1A1B1E]">
          <div className="flex h-10 items-center justify-between border-b border-[#26272B] px-3 text-xs text-zinc-400">
            <span className="font-semibold text-zinc-200">{showOut && clip?.outputUrl ? `Üretilen: ${clip.name}` : 'Kaynak video'}</span>
            {clip?.outputUrl ? (
              <div className="inline-flex rounded-md bg-[#0E0F11] p-0.5">
                <button type="button" onClick={() => setShowOut(false)} className={seg(!showOut)}>Kaynak</button>
                <button type="button" onClick={() => setShowOut(true)} className={seg(showOut)}>Üretilen</button>
              </div>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center bg-[#0B0C0E] p-2">
            {showOut && clip?.outputUrl ? (
              <video key={clip.outputUrl} src={clip.outputUrl} controls className="max-h-full max-w-full rounded-lg" />
            ) : d.sourceUrl ? (
              <video
                ref={vRef}
                src={d.sourceUrl}
                preload="metadata"
                playsInline
                onClick={togglePlay}
                onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                className="max-h-full max-w-full rounded-lg"
              />
            ) : (
              <p className="text-sm text-zinc-500">Kaynak video önizlenemiyor.</p>
            )}
          </div>
          {!showOut ? (
            <div className="flex h-11 items-center justify-center gap-2 border-t border-[#26272B] text-xs">
              <button type="button" aria-label="1 sn geri" onClick={() => seek(nowMs - 1000)} className="rounded p-1.5 hover:bg-white/10"><SkipBack className="h-4 w-4" /></button>
              <button type="button" aria-label="Bir kare geri" onClick={() => seek(nowMs - 100)} className="rounded px-1.5 py-1 font-bold hover:bg-white/10">−0,1</button>
              <button type="button" aria-label={playing ? 'Durdur' : 'Oynat'} onClick={togglePlay} className="rounded-full bg-[#2A2B30] p-2 text-white">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
              <button type="button" aria-label="Bir kare ileri" onClick={() => seek(nowMs + 100)} className="rounded px-1.5 py-1 font-bold hover:bg-white/10">+0,1</button>
              <button type="button" aria-label="1 sn ileri" onClick={() => seek(nowMs + 1000)} className="rounded p-1.5 hover:bg-white/10"><SkipForward className="h-4 w-4" /></button>
              <span className="ml-2 font-mono tabular-nums text-zinc-300">{t(nowMs)} / {durationMs ? t(durationMs) : '—'}</span>
            </div>
          ) : null}
        </section>

        {/* right: part settings / share */}
        <section className="flex min-h-0 flex-col rounded-xl bg-[#1A1B1E]">
          <div className="flex h-10 items-center gap-1 border-b border-[#26272B] px-2">
            <button type="button" onClick={() => setRight('part')} className={seg(right === 'part')}>Parça ayarları</button>
            <button type="button" onClick={() => setRight('share')} disabled={!clip || clip.status !== 'ready' || dirty} className={cn(seg(right === 'share'), 'disabled:opacity-40')}>Paylaş</button>
          </div>
          <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3.5">
            {!clip ? (
              <p className="text-sm text-zinc-500">Alttan bir parça seçin ya da «+ Parça» ile ekleyin.</p>
            ) : right === 'share' && saved ? (
              <div className="rounded-xl bg-[rgb(var(--color-card))] p-1 text-[rgb(var(--color-text))]">
                <SharePanel project={saved} clip={saved.clips.find((c) => c.id === clip.id) ?? clip} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className={lbl}>Parça adı</span>
                    <input value={clip.name} maxLength={80} onChange={(e) => patchClip(clip.id, (c) => ({ ...c, name: e.target.value }))} className={fld} />
                  </label>
                  <div>
                    <span className={lbl}>Süre</span>
                    <p className={cn('rounded-lg px-2.5 py-1.5 text-[13px] font-bold', prob ? 'bg-red-500/10 text-red-300' : 'bg-[#0E0F11] text-white')}>
                      {t(kept * 1000)} {clip.options.outro !== false ? <span className="font-normal text-zinc-500">+ 2,6 sn kapanış</span> : null}
                    </p>
                  </div>
                </div>
                {prob ? <p className="rounded-lg bg-red-500/10 p-2 text-[12px] text-red-300">{prob}</p> : null}
                <div className="rounded-lg bg-[#0E0F11] p-2.5 text-[12px] text-zinc-300">
                  <div className="flex justify-between"><span>Başlangıç</span><button type="button" onClick={() => seek(clip.startMs)} className="font-mono text-white hover:underline">{t(clip.startMs)}</button></div>
                  <div className="flex justify-between"><span>Bitiş</span><button type="button" onClick={() => seek(clip.endMs)} className="font-mono text-white hover:underline">{t(clip.endMs)}</button></div>
                  {(clip.cuts ?? []).map((x, i) => (
                    <div key={i} className="mt-1 flex items-center justify-between text-red-300">
                      <span>✂ Çıkarılan {t(x.startMs)} – {t(x.endMs)}</span>
                      <button type="button" aria-label="Çıkarmayı geri al" onClick={() => removeCut(i)} className="rounded p-0.5 hover:bg-white/10"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>

                <div>
                  <span className={lbl}>Biçim</span>
                  <div className="flex flex-wrap gap-1 rounded-lg bg-[#0E0F11] p-1">
                    {(['vertical', 'square', 'portrait45', 'landscape', 'original'] as ClipFrame[]).map((f) => (
                      <button key={f} type="button" onClick={() => setOpt({ frame: f, ...(f === 'original' ? { fit: undefined, showTitle: false, showLogo: false, showSource: false } : {}) })} className={seg(clip.options.frame === f)}>
                        {FRAME_LABEL[f]}
                      </button>
                    ))}
                  </div>
                </div>
                {clip.options.frame !== 'original' ? (
                  <div>
                    <span className={lbl}>Sığdırma</span>
                    <div className="inline-flex gap-1 rounded-lg bg-[#0E0F11] p-1">
                      <button type="button" onClick={() => setOpt({ fit: undefined, cropX: undefined, cropY: undefined })} className={seg(clip.options.fit !== 'crop')}>Bulanık arka plan (tamamı görünür)</button>
                      <button type="button" onClick={() => setOpt({ fit: 'crop', showTitle: false, showLogo: false, showSource: false })} className={seg(clip.options.fit === 'crop')}>Kırp (doldur)</button>
                    </div>
                  </div>
                ) : null}
                {clip.options.fit === 'crop' && clip.options.frame !== 'original' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className={lbl}>Kadraj ← → ({Math.round((clip.options.cropX ?? 0.5) * 100)})</span>
                      <input type="range" min={0} max={1} step={0.05} value={clip.options.cropX ?? 0.5} onChange={(e) => setOpt({ cropX: Number(e.target.value) })} className="w-full accent-red-500" />
                    </label>
                    <label className="block">
                      <span className={lbl}>Kadraj ↑ ↓ ({Math.round((clip.options.cropY ?? 0.5) * 100)})</span>
                      <input type="range" min={0} max={1} step={0.05} value={clip.options.cropY ?? 0.5} onChange={(e) => setOpt({ cropY: Number(e.target.value) })} className="w-full accent-red-500" />
                    </label>
                  </div>
                ) : null}
                {layout ? (
                  <div className="space-y-2">
                    <span className={lbl}>NaHaber düzeni</span>
                    <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={clip.options.showTitle} onChange={(e) => setOpt({ showTitle: e.target.checked })} className="accent-red-500" /> Başlık bandı</label>
                    {clip.options.showTitle ? <input value={clip.title} maxLength={140} onChange={(e) => patchClip(clip.id, (c) => ({ ...c, title: e.target.value }))} className={fld} placeholder="Videonun üstündeki başlık" /> : null}
                    <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={clip.options.showLogo} onChange={(e) => setOpt({ showLogo: e.target.checked })} className="accent-red-500" /> NaHaber logosu</label>
                    <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={clip.options.showSource} onChange={(e) => setOpt({ showSource: e.target.checked })} className="accent-red-500" /> Kaynak etiketi (bizim değilse)</label>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className={lbl}>Kalite</span>
                    <div className="inline-flex gap-1 rounded-lg bg-[#0E0F11] p-1">
                      <button type="button" onClick={() => setOpt({ quality: undefined })} className={seg(clip.options.quality !== '720')}>Tam (1080p)</button>
                      <button type="button" onClick={() => setOpt({ quality: '720' })} className={seg(clip.options.quality === '720')}>720p</button>
                    </div>
                  </div>
                  <label className="block">
                    <span className={lbl}>Dosya boyutu sınırı</span>
                    <select value={clip.options.maxMb ?? ''} onChange={(e) => setOpt({ maxMb: e.target.value ? Number(e.target.value) : null })} className={fld}>
                      <option value="">Sınır yok</option>
                      {[10, 25, 50, 100, 200].map((m) => (
                        <option key={m} value={m}>en fazla {m} MB</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="text-[11px] text-zinc-500">Tahmini dosya: ~{estimateMb(clip).toFixed(0)} MB</p>
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={clip.options.mute} onChange={(e) => setOpt({ mute: e.target.checked })} className="accent-red-500" /> Sesi kapat
                </label>
                {d.sourceKind === 'news' ? (
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={clip.options.outro !== false} onChange={(e) => setOpt({ outro: e.target.checked ? undefined : false })} className="accent-red-500" /> nahaber.com kapanış kartı
                    <span className="text-[11px] text-zinc-500">(haber sayfası için kapalı önerilir; sosyal medya sürümünde açın)</span>
                  </label>
                ) : null}
                <div className="flex gap-2 border-t border-[#26272B] pt-3">
                  <button type="button" onClick={duplicate} className={ghost}><Copy className="h-3.5 w-3.5" /> Kopyala</button>
                  <button type="button" onClick={removePart} className={ghost}><Trash2 className="h-3.5 w-3.5" /> Parçayı sil</button>
                  {clip.outputUrl && !dirty ? (
                    <a href={clip.outputUrl} target="_blank" rel="noreferrer" className={ghost}><Download className="h-3.5 w-3.5" /> MP4</a>
                  ) : null}
                </div>
                {clip.status === 'failed' && clip.error ? <p className="rounded-lg bg-red-500/10 p-2 text-[12px] text-red-300">Son üretim başarısız: {clip.error}</p> : null}
              </>
            )}
          </div>
        </section>
      </div>

      {/* timeline */}
      <section className="flex h-[210px] shrink-0 flex-col overflow-hidden rounded-xl bg-[#1A1B1E]">
        <div className="flex h-11 flex-wrap items-center gap-1.5 border-b border-[#26272B] px-2.5">
          <button type="button" onClick={addPart} className={ghost}><Plus className="h-3.5 w-3.5" /> Parça</button>
          <span className="mx-1 h-5 w-px bg-[#2F3136]" />
          <button type="button" onClick={setStart} disabled={!clip} className={ghost} title="Seçili parçanın başı = oynatma çizgisi">[ Başlangıç</button>
          <button type="button" onClick={setEnd} disabled={!clip} className={ghost} title="Seçili parçanın sonu = oynatma çizgisi">Bitiş ]</button>
          <button type="button" onClick={split} disabled={!clip} className={ghost} title="Seçili parçayı oynatma çizgisinden ikiye böl"><Scissors className="h-3.5 w-3.5" /> Böl</button>
          <button type="button" onClick={markCut} disabled={!clip} className={cn(ghost, markIn !== null && 'border-red-500 text-red-300')} title="Ortadan bir aralık çıkar: başına gel ve bas, sonra sonuna gel ve tekrar bas">
            <Wand2 className="h-3.5 w-3.5" /> {markIn === null ? 'Ortadan çıkar' : `Çıkarma sonu (baş ${t(markIn)})`}
          </button>
          {markIn !== null ? <button type="button" onClick={() => setMarkIn(null)} className="text-xs text-zinc-400 underline">vazgeç</button> : null}
          <span className="ml-auto text-[11px] text-zinc-500">Çubuğa tıklayarak git · seçili parça kırmızı çerçeveli · çıkarılan aralıklar taralı</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-3 py-2">
          <div className="relative h-4 text-[10px] text-zinc-500">
            {ticks.map((ms) => (
              <span key={ms} className="absolute -translate-x-1/2" style={{ left: pct(ms) }}>{t(ms).replace(/\.\d$/, '')}</span>
            ))}
          </div>
          <div ref={barRef} onClick={onBar} className="relative h-[86px] cursor-pointer rounded-lg bg-[#0E0F11]" role="slider" aria-label="Zaman çizelgesi" aria-valuemin={0} aria-valuemax={total} aria-valuenow={nowMs}>
            {d.clips.map((c, i) => {
              const row = i % 3
              const on = c.id === sel
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSel(c.id)
                    setRight('part')
                    seek(c.startMs)
                  }}
                  className={cn('absolute overflow-hidden rounded-md text-left text-[10px] font-bold text-white', on && 'z-10 ring-2 ring-red-500')}
                  style={{ left: pct(c.startMs), width: `calc(${pct(c.endMs)} - ${pct(c.startMs)})`, top: 4 + row * 27, height: 24, background: `${COLORS[i % COLORS.length]}CC` }}
                  title={`${c.name} · ${t(c.startMs)}–${t(c.endMs)}`}
                >
                  <span className="relative z-10 px-1.5 leading-6 [text-shadow:0_1px_2px_#000]">{c.name} · {t(clipSeconds(c) * 1000)}{c.status === 'ready' ? ' ✓' : ''}</span>
                  {(c.cuts ?? []).map((x, k) => (
                    <span
                      key={k}
                      className="absolute inset-y-0 bg-[repeating-linear-gradient(45deg,rgba(0,0,0,.75)_0,rgba(0,0,0,.75)_3px,rgba(255,255,255,.15)_3px,rgba(255,255,255,.15)_6px)]"
                      style={{ left: `${((x.startMs - c.startMs) / (c.endMs - c.startMs)) * 100}%`, width: `${((x.endMs - x.startMs) / (c.endMs - c.startMs)) * 100}%` }}
                    />
                  ))}
                </button>
              )
            })}
            {markIn !== null ? <span className="absolute inset-y-0 z-20 w-0.5 bg-amber-400" style={{ left: pct(markIn) }} /> : null}
            <span className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-white" style={{ left: pct(nowMs) }} />
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {d.clips.map((c, i) => (
              <button key={c.id} type="button" onClick={() => (setSel(c.id), setRight('part'), seek(c.startMs))} className={cn('flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]', c.id === sel ? 'border-red-500 bg-[#2A1416]' : 'border-[#2A2C31] bg-[#1C1D21]')}>
                <span className="h-2 w-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="font-semibold">{c.name}</span>
                <span className="text-zinc-500">{t(clipSeconds(c) * 1000)} · {FRAME_LABEL[c.options.frame]}</span>
                <span className={c.status === 'ready' ? 'text-emerald-400' : c.status === 'failed' ? 'text-red-400' : 'text-zinc-500'}>{c.status === 'ready' ? 'hazır' : c.status === 'failed' ? 'hata' : 'taslak'}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}


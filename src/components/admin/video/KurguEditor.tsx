'use client'

/**
 * KURGU — CapCut düzeninde tek video editörü (Video Merkezi).
 *   Üst: araç sekmeleri (Medya · Ses · Metin · Geçişler · Filtreler · Ayar · AI)
 *   Sol: sekmenin alt menüsü + içerik · Orta: Oynatıcı (Oran menüsü) · Sağ: Ayrıntılar / seçili öğe
 *   Alt: araç çubuğu (geri al, yinele, böl, kırp, sil…) + izler (Metin · Video · Ses)
 * Tarayıcı yaklaşık önizleme yapar; «Dışa aktar» sunucuda tek MP4 üretir (kapanış dahil).
 * Paylaşım yalnız kullanıcı bir hesap için «Paylaş»a basınca; habere uygulama yalnız «Habere uygula» ile.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  AudioLines,
  Check,
  ChevronDown,
  Copy,
  Crop as CropIcon,
  Download,
  FlipHorizontal,
  Film,
  ImageIcon,
  Loader2,
  Mic,
  Music,
  Newspaper,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCw,
  Scissors,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Upload,
  Wand2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import { cn } from '@/lib/utils'
import { auth } from '@/lib/firebase/auth'
import { storage } from '@/lib/firebase/storage'
import { reelsCall, runReelJob } from '@/components/admin/social/reelsApi'
import { ReelsVideoPicker } from '@/components/admin/social/ReelsVideoPicker'
import {
  ASPECTS,
  ASPECT_LABEL,
  CLOSING_MS,
  FILTERS,
  FILTER_LABEL,
  IMAGE_DEFAULT_MS,
  MAX_TOTAL_MS,
  MIN_CLIP_MS,
  MUSIC_LABEL,
  MUSIC_PRESETS,
  TEXT_STYLES,
  TEXT_STYLE_LABEL,
  TRANSITIONS,
  TRANSITION_LABEL,
  clipMs,
  defaultClip,
  newItemId,
  renderKeyFor,
  renderProblem,
  timeline,
  type Aspect,
  type AudioItem,
  type Crop,
  type EditAsset,
  type EditProject,
  type FilterPreset,
  type MusicPreset,
  type TextItem,
  type TextStyle,
  type VideoClip,
} from '@/lib/edit/editProject'

export const KURGU_API = '/api/admin/video/projects'

type Draft = Pick<EditProject, 'title' | 'caption' | 'aspect' | 'clips' | 'texts' | 'audio' | 'closing'>
type Sel = { kind: 'clip' | 'text' | 'audio'; id: string } | null
type Tool = 'media' | 'audio' | 'text' | 'transition' | 'filter' | 'adjust' | 'ai'
type NewsHit = { newsId: string; title: string; imageUrl: string | null; hasVideo: boolean }

const TOOLS: Array<[Tool, string, typeof Film]> = [
  ['media', 'Medya', Film],
  ['audio', 'Ses', Music],
  ['text', 'Metin', Type],
  ['transition', 'Geçişler', Sparkles],
  ['filter', 'Filtreler', Wand2],
  ['adjust', 'Ayar', SlidersHorizontal],
  ['ai', 'AI', Sparkles],
]
const VOICES: Array<[string, string]> = [
  ['tr-TR-Chirp3-HD-Charon', 'Erkek · sunucu (HD)'],
  ['tr-TR-Chirp3-HD-Kore', 'Kadın · sunucu (HD)'],
  ['tr-TR-Chirp3-HD-Orus', 'Erkek · sakin (HD)'],
  ['tr-TR-Chirp3-HD-Aoede', 'Kadın · sıcak (HD)'],
  ['tr-TR-Wavenet-B', 'Erkek · standart'],
  ['tr-TR-Wavenet-C', 'Kadın · standart'],
]
const RATIO: Record<Exclude<Aspect, 'original'>, number> = { '9:16': 9 / 16, '16:9': 16 / 9, '1:1': 1, '4:5': 4 / 5, '4:3': 4 / 3 }
const CSS_FILTER: Record<FilterPreset, string> = {
  none: '',
  canli: 'saturate(1.35) contrast(1.08)',
  sicak: 'sepia(0.25) saturate(1.2)',
  soguk: 'hue-rotate(-12deg) saturate(0.9) brightness(1.03)',
  siyahbeyaz: 'grayscale(1)',
  sinema: 'contrast(1.15) saturate(0.85) brightness(0.95)',
  solgun: 'saturate(0.6) brightness(1.06) contrast(0.9)',
}

const fmt = (ms: number) => {
  const s = Math.max(0, ms) / 1000
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}
const draftOf = (p: EditProject): Draft => ({ title: p.title, caption: p.caption, aspect: p.aspect, clips: p.clips, texts: p.texts, audio: p.audio, closing: p.closing })
const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b)

async function patch(id: string, body: Record<string, unknown>): Promise<{ project?: EditProject; error?: string }> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  const res = await fetch(`${KURGU_API}/${id}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).catch(() => null)
  const json = res ? ((await res.json().catch(() => null)) as { project?: EditProject; error?: string } | null) : null
  if (!res?.ok || !json?.project) return { error: json?.error ?? 'Kaydedilemedi' }
  return { project: json.project }
}

// ── small UI bits (dark) ─────────────────────────────────────────────────────

const panel = 'rounded-lg bg-[#1B1C20]'
const lbl = 'text-[11px] font-semibold text-zinc-400'
const inputCls = 'w-full rounded-md border border-[#2B2D33] bg-[#141518] px-2 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-cyan-400'
const chip = (on: boolean) => cn('rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition', on ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300' : 'border-[#2B2D33] bg-[#141518] text-zinc-300 hover:border-zinc-500')

function Slider(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; show?: (v: number) => string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between">
        <span className={lbl}>{props.label}</span>
        <span className="text-[11px] tabular-nums text-zinc-300">{props.show ? props.show(props.value) : props.value}</span>
      </span>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} className="w-full accent-cyan-400" />
    </label>
  )
}
function Section(props: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 border-b border-[#24262B] px-3 py-3 last:border-0">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-bold text-zinc-200">{props.title}</p>
        {props.right}
      </div>
      {props.children}
    </div>
  )
}
function ToolBtn(props: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={props.title} aria-label={props.title} onClick={props.onClick} disabled={props.disabled} className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 hover:bg-[#2A2C31] hover:text-white disabled:opacity-30">
      {props.children}
    </button>
  )
}

// ── editor ───────────────────────────────────────────────────────────────────

export function KurguEditor({ projectId, onExit, initialMedia }: { projectId: string; onExit: () => void; initialMedia?: 'device' | 'library' }) {
  const [p, setP] = useState<EditProject | null>(null)
  const [d, setDraft] = useState<Draft | null>(null)
  const [past, setPast] = useState<Draft[]>([])
  const [future, setFuture] = useState<Draft[]>([])
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [sel, setSel] = useState<Sel>(null)
  const [tool, setTool] = useState<Tool>('media')
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [zoom, setZoom] = useState(60) // px per second
  const [cropFor, setCropFor] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const savedRef = useRef<Draft | null>(null)
  const dRef = useRef<Draft | null>(null)
  dRef.current = d

  const exitRef = useRef(onExit)
  exitRef.current = onExit
  useEffect(() => {
    let off = false
    void reelsCall<{ project: EditProject }>('GET', `${KURGU_API}/${projectId}`).then((r) => {
      if (off) return
      if (!r.ok) {
        toast.error(r.error)
        exitRef.current()
        return
      }
      setP(r.data.project)
      setDraft(draftOf(r.data.project))
      dRef.current = draftOf(r.data.project)
      savedRef.current = draftOf(r.data.project)
    })
    return () => {
      off = true
    }
  }, [projectId])

  /** Change the draft (pushes undo history). */
  const change = useCallback((fn: (x: Draft) => Draft) => {
    const cur = dRef.current
    if (!cur) return
    const next = fn(cur)
    if (next === cur) return
    setPast((h) => [...h.slice(-79), cur])
    setFuture([])
    dRef.current = next
    setDraft(next)
  }, [])
  /** Live update during a drag gesture (history pushed once at the start via `pushHistory`). */
  const live = useCallback((next: Draft) => {
    dRef.current = next
    setDraft(next)
  }, [])
  const pushHistory = useCallback((prev: Draft) => {
    setPast((h) => [...h.slice(-79), prev])
    setFuture([])
  }, [])
  const undo = () => {
    if (!d || !past.length) return
    setFuture((f) => [d, ...f])
    dRef.current = past[past.length - 1]!
    setDraft(past[past.length - 1]!)
    setPast((h) => h.slice(0, -1))
  }
  const redo = () => {
    if (!d || !future.length) return
    setPast((h) => [...h, d])
    dRef.current = future[0]!
    setDraft(future[0]!)
    setFuture((f) => f.slice(1))
  }

  // autosave (debounced)
  useEffect(() => {
    if (!d || !p || !savedRef.current || sameDraft(d, savedRef.current)) return
    const timer = setTimeout(async () => {
      setSaving('saving')
      const r = await patch(p.id, d as unknown as Record<string, unknown>)
      if (r.project) {
        savedRef.current = d
        setP(r.project)
        setSaving('saved')
        setSaveErr(null)
      } else {
        setSaving('error')
        setSaveErr(r.error ?? 'Kaydedilemedi')
      }
    }, 1200)
    return () => clearTimeout(timer)
  }, [d, p])

  const flush = async (): Promise<EditProject | null> => {
    if (!p || !d) return null
    if (savedRef.current && sameDraft(d, savedRef.current)) return p
    setSaving('saving')
    const r = await patch(p.id, d as unknown as Record<string, unknown>)
    if (!r.project) {
      setSaving('error')
      setSaveErr(r.error ?? 'Kaydedilemedi')
      toast.error(r.error ?? 'Kaydedilemedi')
      return null
    }
    savedRef.current = d
    setP(r.project)
    setSaving('saved')
    return r.project
  }

  const assets = useMemo(() => new Map((p?.assets ?? []).map((a) => [a.id, a])), [p?.assets])
  const tl = useMemo(() => timeline(d?.clips ?? []), [d?.clips])
  const total = tl.total

  // keyboard: space play, delete, ctrl+z / ctrl+shift+z, s split
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!p || !d) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (e.code === 'Space') {
        e.preventDefault()
        setPlaying((x) => !x)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault()
        removeSel()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (e.key.toLowerCase() === 's' && !e.metaKey && !e.ctrlKey) split()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!p || !d)
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#111214] text-zinc-300">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Proje açılıyor…
      </div>
    )

  // ── edits ──
  const clipAt = (ms: number) => {
    for (let i = d.clips.length - 1; i >= 0; i--) if (ms >= tl.starts[i]! && ms < tl.ends[i]!) return i
    return -1
  }
  const updClip = (id: string, patchC: Partial<VideoClip>) => change((x) => ({ ...x, clips: x.clips.map((c) => (c.id === id ? { ...c, ...patchC } : c)) }))
  const updText = (id: string, patchT: Partial<TextItem>) => change((x) => ({ ...x, texts: x.texts.map((c) => (c.id === id ? { ...c, ...patchT } : c)) }))
  const updAudio = (id: string, patchA: Partial<AudioItem>) => change((x) => ({ ...x, audio: x.audio.map((c) => (c.id === id ? { ...c, ...patchA } : c)) }))
  const addClip = (a: EditAsset) => {
    if (a.kind === 'audio') return
    const c = defaultClip(a)
    if (total + clipMs(c) > MAX_TOTAL_MS) {
      const room = MAX_TOTAL_MS - total
      if (room < MIN_CLIP_MS * 3) return void toast.error('Video en fazla 3 dakika olabilir')
      c.outMs = a.kind === 'image' ? Math.min(IMAGE_DEFAULT_MS, room) : Math.min(c.outMs, room)
      toast('3 dakika sınırı için klip kısaltıldı')
    }
    change((x) => ({ ...x, clips: [...x.clips, c] }))
    setSel({ kind: 'clip', id: c.id })
  }
  const split = () => {
    const i = sel?.kind === 'clip' ? d.clips.findIndex((c) => c.id === sel.id) : clipAt(t)
    const c = d.clips[i]
    if (!c) return
    const local = t - tl.starts[i]!
    const cut = Math.round(c.inMs + local * c.speed)
    if (local < MIN_CLIP_MS || cut > c.outMs - MIN_CLIP_MS * c.speed) return void toast('Bölmek için oynatma çizgisini klibin ortasına getirin')
    const a = { ...c, outMs: cut, animOut: 'none' as const }
    const b = { ...c, id: newItemId(), inMs: cut, transition: 'none' as const, animIn: 'none' as const }
    change((x) => ({ ...x, clips: [...x.clips.slice(0, i), a, b, ...x.clips.slice(i + 1)] }))
    setSel({ kind: 'clip', id: b.id })
  }
  const trimTo = (side: 'left' | 'right') => {
    const i = sel?.kind === 'clip' ? d.clips.findIndex((c) => c.id === sel.id) : clipAt(t)
    const c = d.clips[i]
    if (!c) return
    const local = Math.min(Math.max(t - tl.starts[i]!, 0), clipMs(c))
    const at = Math.round(c.inMs + local * c.speed)
    if (side === 'left' && c.outMs - at >= MIN_CLIP_MS) updClip(c.id, { inMs: at })
    else if (side === 'right' && at - c.inMs >= MIN_CLIP_MS) updClip(c.id, { outMs: at })
    else toast('Oynatma çizgisini klibin içine getirin')
  }
  const removeSel = () => {
    if (!sel) return
    change((x) => ({ ...x, clips: x.clips.filter((c) => c.id !== sel.id), texts: x.texts.filter((c) => c.id !== sel.id), audio: x.audio.filter((c) => c.id !== sel.id) }))
    setSel(null)
  }
  const duplicate = () => {
    if (!sel) return
    if (sel.kind === 'clip') {
      const i = d.clips.findIndex((c) => c.id === sel.id)
      const c = d.clips[i]
      if (!c) return
      if (total + clipMs(c) > MAX_TOTAL_MS) return void toast.error('Video en fazla 3 dakika olabilir')
      const n = { ...c, id: newItemId() }
      change((x) => ({ ...x, clips: [...x.clips.slice(0, i + 1), n, ...x.clips.slice(i + 1)] }))
      setSel({ kind: 'clip', id: n.id })
    } else if (sel.kind === 'text') {
      const c = d.texts.find((x) => x.id === sel.id)
      if (!c) return
      const n = { ...c, id: newItemId(), startMs: c.endMs, endMs: c.endMs + (c.endMs - c.startMs) }
      change((x) => ({ ...x, texts: [...x.texts, n] }))
      setSel({ kind: 'text', id: n.id })
    }
  }
  const selClip = sel?.kind === 'clip' ? d.clips.find((c) => c.id === sel.id) ?? null : null
  const selText = sel?.kind === 'text' ? d.texts.find((c) => c.id === sel.id) ?? null : null
  const selAudio = sel?.kind === 'audio' ? d.audio.find((c) => c.id === sel.id) ?? null : null
  const targetClip = selClip ?? d.clips[clipAt(t)] ?? null

  const addText = (style: TextStyle, text = 'Metninizi yazın') => {
    const pos: Record<TextStyle, { y: number; size: number }> = { baslik: { y: 0.2, size: 92 }, altyazi: { y: 0.8, size: 60 }, altbant: { y: 0.86, size: 56 }, etiket: { y: 0.1, size: 44 }, sade: { y: 0.5, size: 64 } }
    const start = Math.min(t, Math.max(0, total - 1000))
    const item: TextItem = { id: newItemId(), text, startMs: Math.round(start), endMs: Math.round(start + 3000), style, x: 0.5, y: pos[style].y, size: pos[style].size, color: '#FFFFFF' }
    change((x) => ({ ...x, texts: [...x.texts, item] }))
    setSel({ kind: 'text', id: item.id })
  }
  const addMusic = (m: MusicPreset) => {
    const item: AudioItem = { id: newItemId(), kind: 'music', assetId: null, music: m, text: null, startMs: 0, endMs: null, volume: 0.25, fade: true }
    change((x) => ({ ...x, audio: [...x.audio.filter((a) => a.kind !== 'music'), item] }))
    setSel({ kind: 'audio', id: item.id })
    toast.success(`Müzik: ${MUSIC_LABEL[m]} (önizlemede çalmaz, dışa aktarmada eklenir)`)
  }

  /** Server-side change (assets, voice) — saves the timeline first, then takes the new project. */
  const serverAction = async (path: string, body: Record<string, unknown>): Promise<EditProject | null> => {
    const fresh = await flush()
    if (!fresh) return null
    const r = await reelsCall<{ project: EditProject; added?: EditAsset[] }>('POST', `${KURGU_API}/${fresh.id}/${path}`, body)
    if (!r.ok) {
      toast.error(r.error)
      return null
    }
    setP(r.data.project)
    // keep the local timeline (just saved); take new server-made audio items (voice)
    if (dRef.current) live({ ...dRef.current, audio: r.data.project.audio })
    savedRef.current = { ...(savedRef.current ?? draftOf(r.data.project)), audio: r.data.project.audio }
    return r.data.project
  }

  const fresh = p.render.status === 'ready' && p.render.key === renderKeyFor({ ...p, ...d }) && !!p.render.outputUrl

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#0E0F11] text-zinc-200" role="dialog" aria-label="Video düzenleyici">
      {/* header */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#202227] px-3">
        <button type="button" onClick={async () => (await flush(), onExit())} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-semibold text-zinc-300 hover:bg-[#1F2125]">
          <ArrowLeft className="h-4 w-4" /> Video Merkezi
        </button>
        <span className="h-5 w-px bg-[#2A2C31]" />
        <input value={d.title} onChange={(e) => change((x) => ({ ...x, title: e.target.value.slice(0, 140) }))} aria-label="Proje adı" className="w-72 max-w-[40vw] rounded-md bg-transparent px-2 py-1 text-[14px] font-bold text-white outline-none hover:bg-[#1A1B1F] focus:bg-[#1A1B1F]" />
        <span className={cn('text-[11px]', saving === 'error' ? 'text-red-400' : 'text-zinc-500')} title={saveErr ?? ''}>
          {saving === 'saving' ? 'Kaydediliyor…' : saving === 'error' ? `Kaydedilemedi: ${saveErr}` : savedRef.current && sameDraft(d, savedRef.current) ? 'Kaydedildi' : 'Değişiklik var'}
        </span>
        {p.newsVideo ? <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">Haberin videosu</span> : null}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setExportOpen(true)} className="flex items-center gap-1.5 rounded-md bg-cyan-500 px-3.5 py-1.5 text-[13px] font-bold text-black hover:bg-cyan-400">
            <Download className="h-4 w-4" /> Dışa aktar
          </button>
        </div>
      </header>

      {/* top area */}
      <div className="flex min-h-0 flex-1 gap-1 p-1">
        {/* left: tools */}
        <section className={cn(panel, 'flex w-[360px] shrink-0 flex-col overflow-hidden')}>
          <nav className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-[#24262B] px-1.5 pt-1.5" aria-label="Araçlar">
            {TOOLS.map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setTool(id)} className={cn('flex min-w-[46px] flex-col items-center gap-1 rounded-t-md px-1.5 pb-1.5 pt-1 text-[11px] font-semibold', tool === id ? 'text-cyan-300' : 'text-zinc-400 hover:text-zinc-200')}>
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tool === 'media' ? <MediaTool p={p} onAdd={addClip} serverAction={serverAction} initial={initialMedia} /> : null}
            {tool === 'audio' ? <AudioTool d={d} onMusic={addMusic} t={t} serverAction={serverAction} onPick={(id) => setSel({ kind: 'audio', id })} /> : null}
            {tool === 'text' ? <TextTool onAdd={addText} /> : null}
            {tool === 'transition' ? <TransitionTool clips={d.clips} target={targetClip} onApply={(tr, all) => change((x) => ({ ...x, clips: x.clips.map((c, i) => (i > 0 && (all || c.id === targetClip?.id) ? { ...c, transition: tr } : c)) }))} /> : null}
            {tool === 'filter' ? <FilterTool target={targetClip} asset={targetClip ? assets.get(targetClip.assetId) ?? null : null} onApply={(f, all) => change((x) => ({ ...x, clips: x.clips.map((c) => (all || c.id === targetClip?.id ? { ...c, filter: f } : c)) }))} /> : null}
            {tool === 'adjust' ? targetClip ? <AdjustPanel c={targetClip} upd={(v) => updClip(targetClip.id, v)} /> : <p className="p-4 text-[12px] text-zinc-500">Ayar için zaman çizelgesinde bir klip seçin.</p> : null}
            {tool === 'ai' ? <AiTool /> : null}
          </div>
        </section>

        {/* center: player */}
        <section className={cn(panel, 'flex min-w-0 flex-1 flex-col overflow-hidden')}>
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#24262B] px-3">
            <span className="text-[12px] font-bold text-zinc-300">Oynatıcı</span>
            <AspectMenu value={d.aspect} onChange={(a) => change((x) => ({ ...x, aspect: a }))} />
          </div>
          <Player d={d} assets={assets} tl={tl} t={t} setT={setT} playing={playing} setPlaying={setPlaying} sel={sel} onSelectText={(id) => setSel({ kind: 'text', id })} onMoveText={(id, x, y) => updText(id, { x, y })} />
          <div className="flex h-10 shrink-0 items-center gap-3 border-t border-[#24262B] px-3">
            <span className="w-32 text-[12px] tabular-nums text-cyan-300">
              {fmt(t)} <span className="text-zinc-500">/ {fmt(total)}</span>
            </span>
            <button type="button" onClick={() => setPlaying((x) => !x)} disabled={!d.clips.length} aria-label={playing ? 'Duraklat' : 'Oynat'} className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-white text-black disabled:opacity-30">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>
            <span className="w-32 text-right text-[11px] text-zinc-500">{d.closing ? `+ kapanış ${(CLOSING_MS / 1000).toFixed(1)} sn` : 'kapanış yok'}</span>
          </div>
        </section>

        {/* right: inspector */}
        <section className={cn(panel, 'flex w-[320px] shrink-0 flex-col overflow-hidden')}>
          {selClip ? (
            <ClipInspector c={selClip} asset={assets.get(selClip.assetId) ?? null} upd={(v) => updClip(selClip.id, v)} onCrop={() => setCropFor(selClip.id)} isFirst={d.clips[0]?.id === selClip.id} />
          ) : selText ? (
            <TextInspector x={selText} upd={(v) => updText(selText.id, v)} total={total} />
          ) : selAudio ? (
            <AudioInspector a={selAudio} upd={(v) => updAudio(selAudio.id, v)} total={total} />
          ) : (
            <ProjectInspector p={p} d={d} total={total} change={change} />
          )}
        </section>
      </div>

      {/* toolbar + timeline */}
      <section className="flex h-[260px] shrink-0 flex-col border-t border-[#202227] bg-[#141518]">
        <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-[#202227] px-2">
          <ToolBtn title="Geri al (Ctrl+Z)" onClick={undo} disabled={!past.length}>
            <Undo2 className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Yinele (Ctrl+Shift+Z)" onClick={redo} disabled={!future.length}>
            <Redo2 className="h-4 w-4" />
          </ToolBtn>
          <span className="mx-1 h-5 w-px bg-[#2A2C31]" />
          <ToolBtn title="Böl (S)" onClick={split} disabled={!d.clips.length}>
            <Scissors className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Soldan kırp (oynatma çizgisine kadar)" onClick={() => trimTo('left')} disabled={!d.clips.length}>
            <span className="text-[13px] font-black">[</span>
          </ToolBtn>
          <ToolBtn title="Sağdan kırp (oynatma çizgisinden sonrası)" onClick={() => trimTo('right')} disabled={!d.clips.length}>
            <span className="text-[13px] font-black">]</span>
          </ToolBtn>
          <ToolBtn title="Sil (Delete)" onClick={removeSel} disabled={!sel}>
            <Trash2 className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Çoğalt" onClick={duplicate} disabled={!sel || sel.kind === 'audio'}>
            <Copy className="h-4 w-4" />
          </ToolBtn>
          <span className="mx-1 h-5 w-px bg-[#2A2C31]" />
          <ToolBtn title="Kırp (çerçeve)" onClick={() => targetClip && setCropFor(targetClip.id)} disabled={!targetClip}>
            <CropIcon className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="90° döndür" onClick={() => targetClip && updClip(targetClip.id, { rotate: ((targetClip.rotate + 90 + 180) % 360) - 180 })} disabled={!targetClip}>
            <RotateCw className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Ayna" onClick={() => targetClip && updClip(targetClip.id, { flipH: !targetClip.flipH })} disabled={!targetClip}>
            <FlipHorizontal className="h-4 w-4" />
          </ToolBtn>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-2 text-[11px] text-zinc-500">Sürükle: sırala · kenardan çek: kısalt</span>
            <ToolBtn title="Uzaklaştır" onClick={() => setZoom((z) => Math.max(10, Math.round(z / 1.5)))}>
              <ZoomOut className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn title="Yakınlaştır" onClick={() => setZoom((z) => Math.min(400, Math.round(z * 1.5)))}>
              <ZoomIn className="h-4 w-4" />
            </ToolBtn>
          </div>
        </div>
        <Timeline d={d} assets={assets} tl={tl} t={t} setT={(v) => (setPlaying(false), setT(v))} zoom={zoom} sel={sel} setSel={setSel} change={change} live={live} pushHistory={pushHistory} />
      </section>

      {cropFor ? (
        <CropDialog
          clip={d.clips.find((c) => c.id === cropFor) ?? null}
          asset={(() => {
            const c = d.clips.find((x) => x.id === cropFor)
            return c ? assets.get(c.assetId) ?? null : null
          })()}
          onClose={() => setCropFor(null)}
          onApply={(crop, rotate) => {
            updClip(cropFor, { crop, rotate })
            setCropFor(null)
          }}
        />
      ) : null}
      {exportOpen ? <ExportDialog p={p} d={d} fresh={fresh} flush={flush} setP={setP} onClose={() => setExportOpen(false)} /> : null}
    </div>
  )
}

// ── player ───────────────────────────────────────────────────────────────────

type TL = ReturnType<typeof timeline>

function Player(props: { d: Draft; assets: Map<string, EditAsset>; tl: TL; t: number; setT: (n: number) => void; playing: boolean; setPlaying: (b: boolean) => void; sel: Sel; onSelectText: (id: string) => void; onMoveText: (id: string, x: number, y: number) => void }) {
  const { d, assets, tl, t } = props
  const boxRef = useRef<HTMLDivElement>(null)
  const vidRef = useRef<HTMLVideoElement>(null)
  const voiceRefs = useRef(new Map<string, HTMLAudioElement>())
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const idx = (() => {
    for (let i = d.clips.length - 1; i >= 0; i--) if (t >= tl.starts[i]! && t < tl.ends[i]!) return i
    return d.clips.length && t >= tl.total ? d.clips.length - 1 : d.clips.length ? 0 : -1
  })()
  const clip = idx >= 0 ? d.clips[idx]! : null
  const asset = clip ? assets.get(clip.assetId) ?? null : null
  const firstVideo = d.clips.map((c) => assets.get(c.assetId)).find((a) => a?.kind === 'video') ?? null

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ratio = d.aspect === 'original' ? (natural && firstVideo ? natural.w / natural.h : 9 / 16) : RATIO[d.aspect]
  const pad = 24
  const fw = Math.max(40, Math.min(box.w - pad, (box.h - pad) * ratio))
  const fh = fw / ratio

  // seek / play the active video
  const local = clip ? Math.max(0, t - tl.starts[idx]!) : 0
  const srcSec = clip ? (clip.inMs + local * clip.speed) / 1000 : 0
  useEffect(() => {
    const v = vidRef.current
    if (!v || !clip || asset?.kind !== 'video') return
    v.playbackRate = clip.speed
    v.volume = Math.min(1, clip.mute ? 0 : clip.volume)
    v.muted = clip.mute || clip.volume === 0
    if (!props.playing) {
      if (Math.abs(v.currentTime - srcSec) > 0.05) v.currentTime = srcSec
      v.pause()
    } else {
      if (Math.abs(v.currentTime - srcSec) > 0.35) v.currentTime = srcSec
      void v.play().catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id, asset?.url, props.playing, props.playing ? 0 : srcSec, clip?.speed, clip?.volume, clip?.mute])

  // clock
  const tRef = useRef(t)
  tRef.current = t
  useEffect(() => {
    if (!props.playing) return
    if (tRef.current >= tl.total - 30) props.setT(0)
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      const cur = tRef.current
      let next = cur + dt
      const v = vidRef.current
      const i = (() => {
        for (let k = d.clips.length - 1; k >= 0; k--) if (cur >= tl.starts[k]! && cur < tl.ends[k]!) return k
        return -1
      })()
      const c = i >= 0 ? d.clips[i]! : null
      if (c && v && assets.get(c.assetId)?.kind === 'video' && !v.paused && v.readyState >= 2) {
        const fromVideo = tl.starts[i]! + ((v.currentTime * 1000 - c.inMs) / c.speed)
        if (Math.abs(fromVideo - next) < 400) next = Math.max(cur, fromVideo)
      }
      if (next >= tl.total) {
        props.setT(tl.total)
        props.setPlaying(false)
        return
      }
      props.setT(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.playing, tl.total, d.clips])

  // voice-over preview
  useEffect(() => {
    d.audio.forEach((a) => {
      if (a.kind !== 'voice' || !a.assetId) return
      const url = assets.get(a.assetId)?.url
      if (!url) return
      let el = voiceRefs.current.get(a.id)
      if (!el) {
        el = new Audio(url)
        el.preload = 'auto'
        voiceRefs.current.set(a.id, el)
      }
      const end = a.endMs ?? Number.POSITIVE_INFINITY
      const inside = t >= a.startMs && t < end
      el.volume = Math.min(1, a.volume)
      if (props.playing && inside) {
        const want = (t - a.startMs) / 1000
        if (el.paused) {
          el.currentTime = want
          void el.play().catch(() => undefined)
        } else if (Math.abs(el.currentTime - want) > 0.4) el.currentTime = want
      } else if (!el.paused) el.pause()
    })
    voiceRefs.current.forEach((el, id) => {
      if (!d.audio.some((a) => a.id === id)) {
        el.pause()
        voiceRefs.current.delete(id)
      }
    })
  }, [t, props.playing, d.audio, assets])
  useEffect(() => {
    const m = voiceRefs.current
    return () => m.forEach((el) => el.pause())
  }, [])

  // clip look (approximate)
  const anim = (() => {
    if (!clip) return { opacity: 1, scale: 1 }
    const len = clipMs(clip)
    const a = Math.min(500, len / 3)
    let opacity = 1
    let scale = 1
    if (clip.animIn === 'fade' && local < a) opacity = local / a
    if (clip.animOut === 'fade' && len - local < a) opacity = Math.min(opacity, (len - local) / a)
    if (clip.animIn === 'zoom') scale *= 1 + 0.12 * (1 - Math.min(1, local / len))
    if (clip.animOut === 'zoom') scale *= 1 + 0.12 * Math.min(1, local / len)
    return { opacity, scale }
  })()
  const cssFilter = clip ? [CSS_FILTER[clip.filter], `brightness(${1 + clip.brightness})`, `contrast(${clip.contrast})`, `saturate(${clip.saturation})`].filter(Boolean).join(' ') : ''
  const crop = clip?.crop
  const objectViewBox = crop ? `inset(${(crop.y * 100).toFixed(2)}% ${((1 - crop.x - crop.w) * 100).toFixed(2)}% ${((1 - crop.y - crop.h) * 100).toFixed(2)}% ${(crop.x * 100).toFixed(2)}%)` : undefined
  const fitCls = clip?.fit === 'cover' ? 'object-cover' : 'object-contain'
  const transform = clip ? `translate(${clip.posX * 50}%, ${clip.posY * 50}%) scale(${clip.scale * anim.scale}) rotate(${clip.rotate}deg) scaleX(${clip.flipH ? -1 : 1})` : undefined
  const mediaStyle = { transform, filter: cssFilter, opacity: anim.opacity, objectViewBox } as CSSProperties
  const visibleTexts = d.texts.filter((x) => t >= x.startMs && t < x.endMs)
  const short = Math.min(fw, fh)

  const dragText = (e: RPointerEvent, id: string) => {
    e.stopPropagation()
    props.onSelectText(id)
    const frame = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect()
    const move = (ev: PointerEvent) => props.onMoveText(id, Math.round(Math.min(1, Math.max(0, (ev.clientX - frame.left) / frame.width)) * 1000) / 1000, Math.round(Math.min(1, Math.max(0, (ev.clientY - frame.top) / frame.height)) * 1000) / 1000)
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up))
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div ref={boxRef} className="relative flex min-h-0 flex-1 items-center justify-center bg-[#0B0C0E]">
      {!d.clips.length ? (
        <div className="flex flex-col items-center gap-2 text-center text-zinc-500">
          <Film className="h-8 w-8" />
          <p className="text-[13px]">Soldaki Medya’dan video ya da görsel ekleyin.</p>
        </div>
      ) : (
        <div className="relative overflow-hidden bg-black shadow-2xl" style={{ width: fw, height: fh }}>
          {clip && asset && clip.fit === 'blur' ? (
            asset.kind === 'video' && !asset.posterUrl ? null : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.kind === 'video' ? asset.posterUrl! : asset.url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-xl" />
            )
          ) : null}
          {clip && asset ? (
            asset.kind === 'video' ? (
              <video
                key={asset.url}
                ref={vidRef}
                src={asset.url}
                playsInline
                preload="auto"
                onLoadedMetadata={(e) => {
                  if (asset.id === firstVideo?.id) setNatural({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })
                  e.currentTarget.currentTime = srcSec
                }}
                className={cn('absolute inset-0 h-full w-full', fitCls)}
                style={mediaStyle}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.url} alt="" className={cn('absolute inset-0 h-full w-full', fitCls)} style={mediaStyle} />
            )
          ) : null}
          {visibleTexts.map((x) => (
            <div
              key={x.id}
              onPointerDown={(e) => dragText(e, x.id)}
              className={cn('absolute max-w-[90%] -translate-x-1/2 -translate-y-1/2 cursor-move select-none whitespace-pre-wrap text-center leading-tight', props.sel?.id === x.id && 'outline outline-2 outline-cyan-400')}
              style={{ left: `${x.x * 100}%`, top: `${x.y * 100}%`, fontSize: (x.size * short) / 1080, ...textLook(x) }}
            >
              {x.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function textLook(x: Pick<TextItem, 'style' | 'color'>): CSSProperties {
  switch (x.style) {
    case 'baslik':
      return { color: x.color, fontWeight: 900, textShadow: '0 3px 12px rgba(0,0,0,.8)' }
    case 'altbant':
      return { color: x.color, fontWeight: 800, background: '#D90F1C', padding: '0.25em 0.6em', borderRadius: 6 }
    case 'etiket':
      return { color: '#111', fontWeight: 800, background: '#FFD400', padding: '0.2em 0.55em', borderRadius: 6 }
    case 'sade':
      return { color: x.color, fontWeight: 600, textShadow: '0 2px 6px rgba(0,0,0,.6)' }
    default:
      return { color: x.color, fontWeight: 700, background: 'rgba(0,0,0,.62)', padding: '0.2em 0.5em', borderRadius: 8 }
  }
}

function AspectMenu({ value, onChange }: { value: Aspect; onChange: (a: Aspect) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((x) => !x)} className="flex items-center gap-1 rounded-md border border-[#2B2D33] px-2 py-1 text-[12px] font-semibold text-zinc-200 hover:border-zinc-500" aria-haspopup="listbox" aria-expanded={open}>
        Oran: {value === 'original' ? 'Orijinal' : value} <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <ul role="listbox" className="absolute right-0 top-8 z-20 w-52 overflow-hidden rounded-lg border border-[#2B2D33] bg-[#1F2125] py-1 shadow-xl">
          {ASPECTS.map((a) => (
            <li key={a}>
              <button type="button" role="option" aria-selected={a === value} onClick={() => (onChange(a), setOpen(false))} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] hover:bg-[#2A2C31]">
                {ASPECT_LABEL[a]}
                {a === value ? <Check className="h-3.5 w-3.5 text-cyan-300" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

// ── timeline ─────────────────────────────────────────────────────────────────

function Timeline(props: { d: Draft; assets: Map<string, EditAsset>; tl: TL; t: number; setT: (n: number) => void; zoom: number; sel: Sel; setSel: (s: Sel) => void; change: (fn: (x: Draft) => Draft) => void; live: (d: Draft) => void; pushHistory: (d: Draft) => void }) {
  const { d, tl, zoom } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const px = (ms: number) => (ms / 1000) * zoom
  const width = Math.max(px(Math.max(props.tl.total, 10_000) + 5000), 600)
  const HEAD = 64
  const seek = (clientX: number) => {
    const el = scrollRef.current
    if (!el) return
    const x = clientX - el.getBoundingClientRect().left + el.scrollLeft - HEAD
    props.setT(Math.max(0, Math.min(tl.total, (x / zoom) * 1000)))
  }
  /** Generic drag on a block: returns the ms delta to the callback. */
  const drag = (e: RPointerEvent, onMove: (dMs: number) => void) => {
    e.stopPropagation()
    e.preventDefault()
    const x0 = e.clientX
    let first = true
    const move = (ev: PointerEvent) => {
      const dMs = ((ev.clientX - x0) / zoom) * 1000
      if (first && Math.abs(ev.clientX - x0) < 3) return
      first = false
      onMove(dMs)
    }
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up))
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  // trimming / moving updates the draft live; to keep one undo step per gesture we snapshot at start
  const gesture = (e: RPointerEvent, apply: (dMs: number) => (x: Draft) => Draft) => {
    const base = props.d
    let pushed = false
    drag(e, (dMs) => {
      if (!pushed) {
        pushed = true
        props.pushHistory(base)
      }
      props.live(apply(dMs)(base))
    })
  }

  const ticks: number[] = []
  const step = zoom >= 120 ? 1 : zoom >= 40 ? 2 : zoom >= 20 ? 5 : 10
  for (let s = 0; s * 1000 <= Math.max(tl.total, 10_000) + 5000; s += step) ticks.push(s)

  const row = 'relative h-[46px]'
  return (
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
      <div className="relative" style={{ width: width + HEAD }}>
        {/* ruler */}
        <div className="sticky top-0 z-10 flex h-6 cursor-pointer bg-[#141518]" onPointerDown={(e) => seek(e.clientX)}>
          <div style={{ width: HEAD }} className="shrink-0" />
          <div className="relative flex-1">
            {ticks.map((s) => (
              <span key={s} className="absolute top-1 text-[10px] tabular-nums text-zinc-500" style={{ left: px(s * 1000) }}>
                <span className="absolute -left-px top-3 h-2 w-px bg-zinc-600" />
                {fmt(s * 1000).replace(/\.\d$/, '')}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 py-1.5" onPointerDown={(e) => (seek(e.clientX), props.setSel(null))}>
          {/* text track */}
          <div className="flex">
            <TrackHead icon={<Type className="h-3.5 w-3.5" />} label="Metin" width={HEAD} />
            <div className={row} style={{ width }}>
              {d.texts.map((x) => (
                <Block
                  key={x.id}
                  left={px(x.startMs)}
                  w={px(x.endMs - x.startMs)}
                  on={props.sel?.id === x.id}
                  cls="bg-[#6B3FA0] border-[#8B5CD6]"
                  onSelect={() => props.setSel({ kind: 'text', id: x.id })}
                  onMove={(e) => gesture(e, (dMs) => (dr) => ({ ...dr, texts: dr.texts.map((c) => (c.id === x.id ? { ...c, startMs: Math.max(0, Math.round(x.startMs + dMs)), endMs: Math.max(0, Math.round(x.startMs + dMs)) + (x.endMs - x.startMs) } : c)) }))}
                  onLeft={(e) => gesture(e, (dMs) => (dr) => ({ ...dr, texts: dr.texts.map((c) => (c.id === x.id ? { ...c, startMs: Math.max(0, Math.min(x.endMs - 300, Math.round(x.startMs + dMs))) } : c)) }))}
                  onRight={(e) => gesture(e, (dMs) => (dr) => ({ ...dr, texts: dr.texts.map((c) => (c.id === x.id ? { ...c, endMs: Math.max(x.startMs + 300, Math.round(x.endMs + dMs)) } : c)) }))}
                >
                  <span className="truncate text-[11px] font-semibold">{x.text}</span>
                </Block>
              ))}
            </div>
          </div>

          {/* main video track */}
          <div className="flex">
            <TrackHead icon={<Film className="h-3.5 w-3.5" />} label="Video" width={HEAD} />
            <div className={cn(row, 'h-[58px]')} style={{ width }}>
              {d.clips.map((c, i) => {
                const a = props.assets.get(c.assetId)
                const left = px(tl.starts[i]!)
                const w = px(clipMs(c))
                return (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => (e.dataTransfer.setData('text/kurgu-clip', String(i)), (e.dataTransfer.effectAllowed = 'move'))}
                    onDragOver={(e) => (e.preventDefault(), setDragOver(i))}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOver(null)
                      const from = Number(e.dataTransfer.getData('text/kurgu-clip'))
                      if (!Number.isInteger(from) || from === i) return
                      props.change((x) => {
                        const arr = [...x.clips]
                        const [m] = arr.splice(from, 1)
                        arr.splice(i, 0, m!)
                        return { ...x, clips: arr }
                      })
                    }}
                    onPointerDown={(e) => (e.stopPropagation(), props.setSel({ kind: 'clip', id: c.id }))}
                    className={cn('group absolute top-0 flex h-full cursor-grab overflow-hidden rounded-md border-2 bg-[#20323A]', props.sel?.id === c.id ? 'border-white' : 'border-[#2E5260]', dragOver === i && 'ring-2 ring-cyan-400')}
                    style={{ left, width: Math.max(8, w) }}
                    title={`${a?.name ?? ''} · ${fmt(clipMs(c))}`}
                  >
                    {a?.posterUrl || a?.kind === 'image' ? (
                      <span className="absolute inset-0 opacity-70" style={{ backgroundImage: `url(${a.posterUrl ?? a.url})`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' }} />
                    ) : null}
                    <span className="relative z-[1] m-1 self-start truncate rounded bg-black/60 px-1 text-[10px] font-semibold text-white">
                      {c.speed !== 1 ? `${c.speed}× · ` : ''}
                      {fmt(clipMs(c))}
                    </span>
                    {i > 0 && c.transition !== 'none' ? <span className="absolute left-0 top-1/2 z-[2] -translate-y-1/2 rounded-r bg-cyan-400 px-0.5 text-[9px] font-black text-black">⇄</span> : null}
                    {/* trim handles */}
                    <span
                      onPointerDown={(e) => gesture(e, (dMs) => (dr) => ({ ...dr, clips: dr.clips.map((k) => (k.id === c.id ? { ...k, inMs: Math.round(Math.max(0, Math.min(c.outMs - MIN_CLIP_MS, c.inMs + dMs * c.speed))) } : k)) }))}
                      className="absolute inset-y-0 left-0 z-[3] w-2 cursor-ew-resize bg-white/0 group-hover:bg-white/70"
                      aria-label="Başını kısalt"
                    />
                    <span
                      onPointerDown={(e) =>
                        gesture(e, (dMs) => (dr) => ({
                          ...dr,
                          clips: dr.clips.map((k) => {
                            if (k.id !== c.id) return k
                            const max = a?.kind === 'video' ? (a.durationMs ?? c.outMs + 60_000) : 60_000
                            return { ...k, outMs: Math.round(Math.min(max, Math.max(c.inMs + MIN_CLIP_MS, c.outMs + dMs * c.speed))) }
                          }),
                        }))
                      }
                      className="absolute inset-y-0 right-0 z-[3] w-2 cursor-ew-resize bg-white/0 group-hover:bg-white/70"
                      aria-label="Sonunu kısalt"
                    />
                  </div>
                )
              })}
              {d.closing && d.clips.length ? (
                <div className="absolute top-0 flex h-full items-center justify-center rounded-md border-2 border-dashed border-red-500/60 bg-red-950/40 text-[10px] font-bold text-red-300" style={{ left: px(tl.total), width: px(CLOSING_MS) }} title="nahaber.com kapanışı (dışa aktarmada eklenir)">
                  nahaber.com
                </div>
              ) : null}
            </div>
          </div>

          {/* audio track */}
          <div className="flex">
            <TrackHead icon={<AudioLines className="h-3.5 w-3.5" />} label="Ses" width={HEAD} />
            <div className={row} style={{ width }}>
              {d.audio.map((x) => {
                const end = x.endMs ?? Math.max(tl.total, x.startMs + 1000)
                return (
                  <Block
                    key={x.id}
                    left={px(x.startMs)}
                    w={px(end - x.startMs)}
                    on={props.sel?.id === x.id}
                    cls={x.kind === 'music' ? 'bg-[#1F5C46] border-[#2E8A68]' : 'bg-[#2D4C8C] border-[#4471C9]'}
                    onSelect={() => props.setSel({ kind: 'audio', id: x.id })}
                    onMove={(e) => gesture(e, (dMs) => (dr) => ({ ...dr, audio: dr.audio.map((c) => (c.id === x.id ? { ...c, startMs: Math.max(0, Math.round(x.startMs + dMs)), endMs: x.endMs === null ? null : Math.max(0, Math.round(x.startMs + dMs)) + (x.endMs - x.startMs) } : c)) }))}
                    onRight={x.kind === 'music' ? (e) => gesture(e, (dMs) => (dr) => ({ ...dr, audio: dr.audio.map((c) => (c.id === x.id ? { ...c, endMs: Math.max(x.startMs + 300, Math.round(end + dMs)) } : c)) })) : undefined}
                  >
                    <span className="flex items-center gap-1 truncate text-[11px] font-semibold">
                      {x.kind === 'music' ? <Music className="h-3 w-3 shrink-0" /> : <Mic className="h-3 w-3 shrink-0" />}
                      {x.kind === 'music' ? `Müzik · ${x.music ? MUSIC_LABEL[x.music] : 'dosya'}` : x.text}
                    </span>
                  </Block>
                )
              })}
            </div>
          </div>
        </div>

        {/* playhead */}
        <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-white" style={{ left: HEAD + px(props.t) }}>
          <span className="absolute -left-[5px] top-0 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-white" />
        </div>
      </div>
    </div>
  )
}

function TrackHead({ icon, label, width }: { icon: ReactNode; label: string; width: number }) {
  return (
    <div className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 bg-[#141518] pl-2 text-[11px] font-semibold text-zinc-400" style={{ width }}>
      {icon}
      {label}
    </div>
  )
}

function Block(props: { left: number; w: number; on: boolean; cls: string; onSelect: () => void; onMove: (e: RPointerEvent) => void; onLeft?: (e: RPointerEvent) => void; onRight?: (e: RPointerEvent) => void; children: ReactNode }) {
  return (
    <div
      onPointerDown={(e) => (props.onSelect(), props.onMove(e))}
      className={cn('group absolute top-1 flex h-[38px] cursor-grab items-center overflow-hidden rounded-md border-2 px-2 text-white', props.cls, props.on && '!border-white')}
      style={{ left: props.left, width: Math.max(10, props.w) }}
    >
      {props.onLeft ? <span onPointerDown={(e) => (props.onSelect(), props.onLeft!(e))} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize group-hover:bg-white/60" /> : null}
      {props.children}
      {props.onRight ? <span onPointerDown={(e) => (props.onSelect(), props.onRight!(e))} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize group-hover:bg-white/60" /> : null}
    </div>
  )
}

// ── left tools ───────────────────────────────────────────────────────────────

function SubNav<T extends string>({ items, value, onChange }: { items: Array<[T, string]>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-[#24262B] p-2">
      {items.map(([id, l]) => (
        <button key={id} type="button" onClick={() => onChange(id)} className={cn('rounded-md px-2.5 py-1 text-[12px] font-semibold', value === id ? 'bg-[#2A2C31] text-white' : 'text-zinc-400 hover:text-zinc-200')}>
          {l}
        </button>
      ))}
    </div>
  )
}

function MediaTool({ p, onAdd, serverAction, initial }: { p: EditProject; onAdd: (a: EditAsset) => void; serverAction: (path: string, body: Record<string, unknown>) => Promise<EditProject | null>; initial?: 'device' | 'library' }) {
  const [sub, setSub] = useState<'project' | 'device' | 'library' | 'news'>(initial ?? (p.assets.length ? 'project' : 'device'))
  const [uploads, setUploads] = useState<Record<string, number>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const visual = p.assets.filter((a) => a.kind !== 'audio')

  const upload = async (files: FileList | null) => {
    const uid = auth.currentUser?.uid
    if (!files || !uid) return
    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')
      if (!isVideo && !isImage) {
        toast.error(`${file.name}: yalnız video ya da görsel`)
        continue
      }
      if (file.size > (isVideo ? 200 : 50) * 1024 * 1024) {
        toast.error(`${file.name}: ${isVideo ? '200' : '50'} MB sınırını aşıyor`)
        continue
      }
      const name = `${Date.now()}_${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`.slice(0, 120)
      const path = `${isVideo ? 'news-videos' : 'news-images'}/${uid}/edit/${p.id}/${name}`
      try {
        const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type })
        await new Promise<void>((resolve, reject) => task.on('state_changed', (s) => setUploads((u) => ({ ...u, [file.name]: Math.round((s.bytesTransferred / s.totalBytes) * 100) })), reject, () => resolve()))
        const url = await getDownloadURL(task.snapshot.ref)
        const before = new Set(p.assets.map((a) => a.id))
        const next = await serverAction('assets', { action: 'add', kind: 'upload', type: isVideo ? 'video' : 'image', url, name: file.name })
        const added = next?.assets.find((a) => !before.has(a.id))
        if (added) onAdd(added)
      } catch (e) {
        toast.error(`${file.name}: yüklenemedi (${e instanceof Error ? e.message.slice(0, 80) : 'hata'})`)
      } finally {
        setUploads((u) => {
          const n = { ...u }
          delete n[file.name]
          return n
        })
      }
    }
  }

  return (
    <div>
      <SubNav
        items={[
          ['project', 'Projede'],
          ['device', 'Cihazdan'],
          ['library', 'Video kütüphanesi'],
          ['news', 'Haberden'],
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === 'project' ? (
        visual.length ? (
          <div className="grid grid-cols-2 gap-2 p-2">
            {visual.map((a) => (
              <button key={a.id} type="button" onClick={() => onAdd(a)} title="Zaman çizelgesine ekle" className="group relative aspect-video overflow-hidden rounded-md border border-[#2B2D33] bg-[#111] text-left hover:border-cyan-400">
                {a.posterUrl || a.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.posterUrl ?? a.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <video src={`${a.url}#t=0.5`} muted preload="metadata" className="h-full w-full object-cover" />
                )}
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] font-bold text-white">{a.kind === 'video' ? (a.durationMs ? fmt(a.durationMs) : 'Video') : 'Görsel'}</span>
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/90 px-1.5 pb-1 pt-3 text-[10px] text-zinc-200">{a.name}</span>
                <span className="absolute right-1 top-1 hidden rounded-full bg-cyan-400 p-0.5 text-black group-hover:block">
                  <Plus className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="p-4 text-[12px] text-zinc-500">Projede medya yok. «Cihazdan», «Video kütüphanesi» ya da «Haberden» ile ekleyin.</p>
        )
      ) : null}
      {sub === 'device' ? (
        <div className="flex flex-col gap-2 p-3">
          <input ref={fileRef} type="file" accept="video/*,image/*" multiple hidden onChange={(e) => (void upload(e.target.files), (e.target.value = ''))} />
          <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[#33363D] px-4 py-8 text-center hover:border-cyan-400">
            <Upload className="h-6 w-6 text-cyan-300" />
            <span className="text-[13px] font-bold text-zinc-100">Bilgisayardan / telefondan yükle</span>
            <span className="text-[11px] text-zinc-500">Video ≤ 200 MB · görsel ≤ 50 MB · birden çok seçilebilir</span>
          </button>
          {Object.entries(uploads).map(([n, pct]) => (
            <div key={n} className="text-[11px] text-zinc-400">
              {n} · %{pct}
              <div className="mt-1 h-1 overflow-hidden rounded bg-[#2A2C31]">
                <div className="h-full bg-cyan-400" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {sub === 'library' ? (
        <div className="p-2 [&_*]:text-zinc-200">
          <ReelsVideoPicker
            value={null}
            onChange={async (v) => {
              if (!v) return
              const before = new Set(p.assets.map((a) => a.id))
              const next = await serverAction('assets', { action: 'add', kind: 'library', videoItemId: v.id })
              const added = next?.assets.find((a) => !before.has(a.id))
              if (added) onAdd(added)
            }}
          />
        </div>
      ) : null}
      {sub === 'news' ? <NewsMedia onPick={async (newsId) => {
        const before = new Set(p.assets.map((a) => a.id))
        const next = await serverAction('assets', { action: 'add', kind: 'news', newsId })
        const n = next ? next.assets.filter((a) => !before.has(a.id)).length : 0
        if (n) toast.success(`${n} medya eklendi — «Projede» sekmesinden zaman çizelgesine ekleyin`)
      }} /> : null}
    </div>
  )
}

function NewsMedia({ onPick }: { onPick: (newsId: string) => Promise<void> }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<NewsHit[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const search = useCallback(async (text: string) => {
    const r = await reelsCall<{ items: NewsHit[] }>('GET', `/api/admin/social/reels/news?q=${encodeURIComponent(text)}`)
    setItems(r.ok ? r.data.items : [])
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => void search(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q, search])
  return (
    <div className="flex flex-col gap-2 p-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Haber ara" aria-label="Haber ara" className={inputCls} />
      {items === null ? <p className="text-[12px] text-zinc-500">Yükleniyor…</p> : null}
      {items?.map((n) => (
        <button key={n.newsId} type="button" disabled={!!busy} onClick={async () => (setBusy(n.newsId), await onPick(n.newsId), setBusy(null))} className="flex items-center gap-2 rounded-md border border-[#2B2D33] p-1.5 text-left hover:border-cyan-400 disabled:opacity-50">
          {n.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={n.imageUrl} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />
          ) : (
            <Newspaper className="h-10 w-16 shrink-0 p-2 text-zinc-600" />
          )}
          <span className="line-clamp-2 flex-1 text-[12px] text-zinc-200">{n.title}</span>
          {busy === n.newsId ? <Loader2 className="h-4 w-4 animate-spin" /> : n.hasVideo ? <Film className="h-4 w-4 text-cyan-300" /> : <ImageIcon className="h-4 w-4 text-zinc-500" />}
        </button>
      ))}
    </div>
  )
}

function AudioTool({ d, onMusic, t, serverAction, onPick }: { d: Draft; onMusic: (m: MusicPreset) => void; t: number; serverAction: (path: string, body: Record<string, unknown>) => Promise<EditProject | null>; onPick: (id: string) => void }) {
  const [sub, setSub] = useState<'music' | 'voice'>('music')
  const [text, setText] = useState('')
  const [voice, setVoice] = useState(VOICES[0]![0])
  const [rate, setRate] = useState(1)
  const [busy, setBusy] = useState(false)
  const current = d.audio.find((a) => a.kind === 'music')
  return (
    <div>
      <SubNav
        items={[
          ['music', 'Müzik'],
          ['voice', 'Seslendirme'],
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === 'music' ? (
        <div className="flex flex-col gap-1.5 p-2">
          <p className="px-1 text-[11px] text-zinc-500">Telifsiz NaHaber müzikleri. Videonun sesi altında kısık çalar; önizlemede duyulmaz.</p>
          {MUSIC_PRESETS.map((m) => (
            <button key={m} type="button" onClick={() => onMusic(m)} className={cn('flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[13px] font-semibold', current?.music === m ? 'border-cyan-400 bg-cyan-400/10 text-cyan-200' : 'border-[#2B2D33] hover:border-zinc-500')}>
              <Music className="h-4 w-4 text-emerald-300" /> {MUSIC_LABEL[m]}
              {current?.music === m ? <Check className="ml-auto h-4 w-4" /> : <Plus className="ml-auto h-4 w-4 text-zinc-500" />}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 p-3">
          <label className="flex flex-col gap-1">
            <span className={lbl}>Okunacak metin (oynatma çizgisinden başlar · {fmt(t)})</span>
            <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 1500))} rows={6} className={inputCls} placeholder="Örn. Antalya’da sabah saatlerinde başlayan yağış…" />
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {VOICES.map(([id, l]) => (
              <button key={id} type="button" onClick={() => setVoice(id)} className={chip(voice === id)}>
                {l}
              </button>
            ))}
          </div>
          <Slider label="Konuşma hızı" value={rate} min={0.8} max={1.3} step={0.05} onChange={setRate} show={(v) => `${v.toFixed(2).replace('.', ',')}×`} />
          <button
            type="button"
            disabled={busy || text.trim().length < 3}
            onClick={async () => {
              setBusy(true)
              const before = new Set(d.audio.map((a) => a.id))
              const next = await serverAction('voice', { text: text.trim(), voice, rate, startMs: Math.round(t) })
              setBusy(false)
              const added = next?.audio.find((a) => !before.has(a.id))
              if (added) {
                setText('')
                onPick(added.id)
                toast.success('Seslendirme ses izine eklendi')
              }
            }}
            className="flex items-center justify-center gap-2 rounded-md bg-cyan-500 py-2 text-[13px] font-bold text-black disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />} Seslendir ve ekle
          </button>
        </div>
      )}
    </div>
  )
}

function TextTool({ onAdd }: { onAdd: (s: TextStyle) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 p-2">
      {TEXT_STYLES.map((s) => (
        <button key={s} type="button" onClick={() => onAdd(s)} className="flex aspect-video flex-col items-center justify-center gap-1 rounded-md border border-[#2B2D33] bg-[#121316] p-2 hover:border-cyan-400">
          <span className="max-w-full truncate text-[13px]" style={{ ...textLook({ style: s, color: '#FFFFFF' }), fontSize: 13 }}>
            {s === 'altbant' ? 'SON DAKİKA' : s === 'etiket' ? 'CANLI' : 'Başlık'}
          </span>
          <span className="text-[11px] text-zinc-400">{TEXT_STYLE_LABEL[s]}</span>
        </button>
      ))}
      <p className="col-span-2 px-1 text-[11px] text-zinc-500">Metin oynatma çizgisinde eklenir. Oynatıcıda sürükleyerek yerini, zaman çizelgesinde süresini değiştirin.</p>
    </div>
  )
}

function TransitionTool({ clips, target, onApply }: { clips: VideoClip[]; target: VideoClip | null; onApply: (t: (typeof TRANSITIONS)[number], all: boolean) => void }) {
  const isFirst = !target || clips[0]?.id === target.id
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="px-1 text-[11px] text-zinc-500">{isFirst ? 'Geçiş, bir klibe ÖNCEKİ klipten geçerken uygulanır. İkinci ya da sonraki bir klibi seçin.' : 'Seçili klibe girişteki geçiş:'}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {TRANSITIONS.map((tr) => (
          <button key={tr} type="button" disabled={isFirst} onClick={() => onApply(tr, false)} className={cn(chip(target?.transition === tr), 'disabled:opacity-40')}>
            {TRANSITION_LABEL[tr]}
          </button>
        ))}
      </div>
      <button type="button" disabled={clips.length < 2 || !target} onClick={() => target && onApply(target.transition, true)} className="mt-1 rounded-md border border-[#2B2D33] py-1.5 text-[12px] font-semibold hover:border-zinc-500 disabled:opacity-40">
        Bu geçişi tüm kliplere uygula
      </button>
    </div>
  )
}

function FilterTool({ target, asset, onApply }: { target: VideoClip | null; asset: EditAsset | null; onApply: (f: FilterPreset, all: boolean) => void }) {
  const thumb = asset?.posterUrl ?? (asset?.kind === 'image' ? asset.url : null)
  return (
    <div className="flex flex-col gap-2 p-2">
      {!target ? <p className="px-1 text-[11px] text-zinc-500">Bir klip seçin.</p> : null}
      <div className="grid grid-cols-3 gap-1.5">
        {FILTERS.map((f) => (
          <button key={f} type="button" disabled={!target} onClick={() => onApply(f, false)} className={cn('flex flex-col overflow-hidden rounded-md border text-[11px] font-semibold disabled:opacity-40', target?.filter === f ? 'border-cyan-400 text-cyan-200' : 'border-[#2B2D33]')}>
            <span className="block aspect-square bg-zinc-700" style={{ backgroundImage: thumb ? `url(${thumb})` : undefined, backgroundSize: 'cover', filter: CSS_FILTER[f] }} />
            <span className="py-1">{FILTER_LABEL[f]}</span>
          </button>
        ))}
      </div>
      <button type="button" disabled={!target} onClick={() => target && onApply(target.filter, true)} className="rounded-md border border-[#2B2D33] py-1.5 text-[12px] font-semibold hover:border-zinc-500 disabled:opacity-40">
        Bu filtreyi tüm kliplere uygula
      </button>
    </div>
  )
}

function AiTool() {
  const go = (start: string) => (window.location.href = `/admin/video?start=${start}`)
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="px-1 text-[11px] text-zinc-500">AI ile hazır video üret (anlatım, seslendirme, görseller). Üretilen video Video Merkezi projelerinde açılır.</p>
      {(
        [
          ['news', 'Haberden video', 'Haberi seç; AI anlatımı yazar, fotoğraf ve videoları dizer.'],
          ['text', 'Metinden video', 'Konu ya da hazır metin; 1–10 dk.'],
          ['digest', 'Günün bülteni', '2–7 haber tek videoda.'],
        ] as const
      ).map(([id, t, s]) => (
        <button key={id} type="button" onClick={() => go(id)} className="flex flex-col gap-0.5 rounded-md border border-[#2B2D33] p-2.5 text-left hover:border-cyan-400">
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-zinc-100">
            <Sparkles className="h-4 w-4 text-violet-300" /> {t}
          </span>
          <span className="text-[11px] text-zinc-400">{s}</span>
        </button>
      ))}
    </div>
  )
}

// ── right inspectors ─────────────────────────────────────────────────────────

function Tabs<T extends string>({ items, value, onChange }: { items: Array<[T, string]>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-[#24262B] px-2">
      {items.map(([id, l]) => (
        <button key={id} type="button" onClick={() => onChange(id)} className={cn('border-b-2 px-2 py-2 text-[12px] font-semibold', value === id ? 'border-cyan-400 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200')}>
          {l}
        </button>
      ))}
    </div>
  )
}

function ClipInspector({ c, asset, upd, onCrop, isFirst }: { c: VideoClip; asset: EditAsset | null; upd: (v: Partial<VideoClip>) => void; onCrop: () => void; isFirst: boolean }) {
  const [tab, setTab] = useState<'video' | 'audio' | 'speed' | 'anim' | 'adjust'>('video')
  const isVideo = asset?.kind === 'video'
  const tabs: Array<['video' | 'audio' | 'speed' | 'anim' | 'adjust', string]> = isVideo
    ? [
        ['video', 'Video'],
        ['audio', 'Ses'],
        ['speed', 'Hız'],
        ['anim', 'Animasyon'],
        ['adjust', 'Ayarla'],
      ]
    : [
        ['video', 'Görsel'],
        ['anim', 'Animasyon'],
        ['adjust', 'Ayarla'],
      ]
  return (
    <>
      <Tabs items={tabs} value={tab} onChange={setTab} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="truncate px-3 pt-2 text-[11px] text-zinc-500">{asset?.name}</p>
        {tab === 'video' ? (
          <>
            <Section title="Temel" right={<button type="button" onClick={() => upd({ scale: 1, posX: 0, posY: 0, rotate: 0, flipH: false })} className="text-[11px] text-zinc-400 hover:text-white">Sıfırla</button>}>
              <Slider label="Ölçek" value={c.scale} min={0.3} max={4} step={0.01} onChange={(v) => upd({ scale: v })} show={(v) => `%${Math.round(v * 100)}`} />
              <div className="grid grid-cols-2 gap-2">
                <Slider label="Konum X" value={c.posX} min={-1} max={1} step={0.01} onChange={(v) => upd({ posX: v })} show={(v) => v.toFixed(2)} />
                <Slider label="Konum Y" value={c.posY} min={-1} max={1} step={0.01} onChange={(v) => upd({ posY: v })} show={(v) => v.toFixed(2)} />
              </div>
              <Slider label="Döndür" value={c.rotate} min={-180} max={180} step={1} onChange={(v) => upd({ rotate: v })} show={(v) => `${v}°`} />
              <div className="flex gap-1.5">
                <button type="button" onClick={() => upd({ flipH: !c.flipH })} className={chip(c.flipH)}>
                  <FlipHorizontal className="mr-1 inline h-3.5 w-3.5" /> Ayna
                </button>
                <button type="button" onClick={onCrop} className={chip(!!c.crop)}>
                  <CropIcon className="mr-1 inline h-3.5 w-3.5" /> Kırp{c.crop ? ' ✓' : ''}
                </button>
              </div>
            </Section>
            <Section title="Çerçeveye yerleşim">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['blur', 'Bulanık arka plan'],
                    ['cover', 'Doldur (kırpar)'],
                    ['contain', 'Sığdır (siyah)'],
                  ] as const
                ).map(([f, l]) => (
                  <button key={f} type="button" onClick={() => upd({ fit: f })} className={chip(c.fit === f)}>
                    {l}
                  </button>
                ))}
              </div>
            </Section>
            {!isVideo ? (
              <Section title="Süre">
                <Slider label="Ekranda kalma" value={c.outMs} min={500} max={15000} step={100} onChange={(v) => upd({ inMs: 0, outMs: v })} show={(v) => `${(v / 1000).toFixed(1).replace('.', ',')} sn`} />
              </Section>
            ) : (
              <Section title="Kullanılan bölüm">
                <p className="text-[12px] tabular-nums text-zinc-300">
                  {fmt(c.inMs)} → {fmt(c.outMs)} <span className="text-zinc-500">({fmt(c.outMs - c.inMs)} kaynak)</span>
                </p>
                <p className="text-[11px] text-zinc-500">Zaman çizelgesinde klibin kenarından çekerek ya da «Böl» ile değiştirin.</p>
              </Section>
            )}
            {!isFirst ? (
              <Section title="Girişteki geçiş">
                <select value={c.transition} onChange={(e) => upd({ transition: e.target.value as VideoClip['transition'] })} className={inputCls}>
                  {TRANSITIONS.map((tr) => (
                    <option key={tr} value={tr}>
                      {TRANSITION_LABEL[tr]}
                    </option>
                  ))}
                </select>
              </Section>
            ) : null}
          </>
        ) : null}
        {tab === 'audio' ? (
          <Section title="Videonun sesi">
            <Slider label="Ses düzeyi" value={c.mute ? 0 : c.volume} min={0} max={2} step={0.05} onChange={(v) => upd({ volume: v, mute: v === 0 })} show={(v) => `%${Math.round(v * 100)}`} />
            <button type="button" onClick={() => upd({ mute: !c.mute })} className={chip(c.mute)}>
              {c.mute ? 'Sessiz (aç)' : 'Sesi kapat'}
            </button>
          </Section>
        ) : null}
        {tab === 'speed' ? (
          <Section title="Hız">
            <div className="flex flex-wrap gap-1.5">
              {[0.5, 0.75, 1, 1.25, 1.5, 2, 3].map((s) => (
                <button key={s} type="button" onClick={() => upd({ speed: s })} className={chip(c.speed === s)}>
                  {String(s).replace('.', ',')}×
                </button>
              ))}
            </div>
            <Slider label="Özel" value={c.speed} min={0.25} max={4} step={0.05} onChange={(v) => upd({ speed: Math.round(v * 100) / 100 })} show={(v) => `${v.toFixed(2).replace('.', ',')}×`} />
            <p className="text-[11px] text-zinc-500">Zaman çizelgesindeki süre: {fmt(clipMs(c))}</p>
          </Section>
        ) : null}
        {tab === 'anim' ? (
          <>
            {(['animIn', 'animOut'] as const).map((k) => (
              <Section key={k} title={k === 'animIn' ? 'Giriş' : 'Çıkış'}>
                <div className="flex gap-1.5">
                  {(
                    [
                      ['none', 'Yok'],
                      ['fade', 'Belirme'],
                      ['zoom', 'Yakınlaşma'],
                    ] as const
                  ).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => upd({ [k]: v } as Partial<VideoClip>)} className={chip(c[k] === v)}>
                      {l}
                    </button>
                  ))}
                </div>
              </Section>
            ))}
          </>
        ) : null}
        {tab === 'adjust' ? <AdjustPanel c={c} upd={upd} /> : null}
      </div>
    </>
  )
}

function AdjustPanel({ c, upd }: { c: VideoClip; upd: (v: Partial<VideoClip>) => void }) {
  return (
    <>
      <Section title="Filtre">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f} type="button" onClick={() => upd({ filter: f })} className={chip(c.filter === f)}>
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Ayarla" right={<button type="button" onClick={() => upd({ brightness: 0, contrast: 1, saturation: 1 })} className="text-[11px] text-zinc-400 hover:text-white">Sıfırla</button>}>
        <Slider label="Parlaklık" value={c.brightness} min={-0.5} max={0.5} step={0.01} onChange={(v) => upd({ brightness: v })} show={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`} />
        <Slider label="Kontrast" value={c.contrast} min={0.3} max={2} step={0.01} onChange={(v) => upd({ contrast: v })} show={(v) => `%${Math.round(v * 100)}`} />
        <Slider label="Doygunluk" value={c.saturation} min={0} max={3} step={0.01} onChange={(v) => upd({ saturation: v })} show={(v) => `%${Math.round(v * 100)}`} />
      </Section>
    </>
  )
}

function TextInspector({ x, upd, total }: { x: TextItem; upd: (v: Partial<TextItem>) => void; total: number }) {
  return (
    <>
      <Tabs items={[['text', 'Metin']]} value="text" onChange={() => undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Yazı">
          <textarea value={x.text} onChange={(e) => upd({ text: e.target.value.slice(0, 300) })} rows={3} className={inputCls} />
        </Section>
        <Section title="Stil">
          <div className="flex flex-wrap gap-1.5">
            {TEXT_STYLES.map((s) => (
              <button key={s} type="button" onClick={() => upd({ style: s })} className={chip(x.style === s)}>
                {TEXT_STYLE_LABEL[s]}
              </button>
            ))}
          </div>
          <Slider label="Boyut" value={x.size} min={20} max={200} step={1} onChange={(v) => upd({ size: v })} />
          <div className="flex items-center gap-2">
            <span className={lbl}>Renk</span>
            {['#FFFFFF', '#FFD400', '#D90F1C', '#111111', '#22D3EE'].map((col) => (
              <button key={col} type="button" aria-label={col} onClick={() => upd({ color: col })} className={cn('h-6 w-6 rounded-full border-2', x.color === col ? 'border-cyan-400' : 'border-[#33363D]')} style={{ background: col }} />
            ))}
            <input type="color" value={x.color} onChange={(e) => upd({ color: e.target.value.toUpperCase() })} aria-label="Özel renk" className="h-6 w-8 bg-transparent" />
          </div>
        </Section>
        <Section title="Konum">
          <div className="grid grid-cols-2 gap-2">
            <Slider label="Yatay" value={x.x} min={0} max={1} step={0.01} onChange={(v) => upd({ x: v })} show={(v) => `%${Math.round(v * 100)}`} />
            <Slider label="Dikey" value={x.y} min={0} max={1} step={0.01} onChange={(v) => upd({ y: v })} show={(v) => `%${Math.round(v * 100)}`} />
          </div>
        </Section>
        <Section title="Zaman">
          <Slider label="Başlangıç" value={x.startMs} min={0} max={Math.max(total, x.endMs)} step={100} onChange={(v) => upd({ startMs: Math.min(v, x.endMs - 300) })} show={fmt} />
          <Slider label="Bitiş" value={x.endMs} min={0} max={Math.max(total, x.endMs) + 5000} step={100} onChange={(v) => upd({ endMs: Math.max(v, x.startMs + 300) })} show={fmt} />
        </Section>
      </div>
    </>
  )
}

function AudioInspector({ a, upd, total }: { a: AudioItem; upd: (v: Partial<AudioItem>) => void; total: number }) {
  return (
    <>
      <Tabs items={[['audio', a.kind === 'music' ? 'Müzik' : 'Seslendirme']]} value="audio" onChange={() => undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {a.kind === 'music' ? (
          <Section title="Müzik">
            <select value={a.music ?? 'modern'} onChange={(e) => upd({ music: e.target.value as MusicPreset })} className={inputCls}>
              {MUSIC_PRESETS.map((m) => (
                <option key={m} value={m}>
                  {MUSIC_LABEL[m]}
                </option>
              ))}
            </select>
          </Section>
        ) : (
          <Section title="Okunan metin">
            <p className="text-[12px] leading-relaxed text-zinc-300">{a.text}</p>
            <p className="text-[11px] text-zinc-500">Metni değiştirmek için silip Ses → Seslendirme’den yeniden üretin.</p>
          </Section>
        )}
        <Section title="Ses">
          <Slider label="Ses düzeyi" value={a.volume} min={0} max={2} step={0.05} onChange={(v) => upd({ volume: v })} show={(v) => `%${Math.round(v * 100)}`} />
          <button type="button" onClick={() => upd({ fade: !a.fade })} className={chip(a.fade)}>
            Yumuşak giriş / çıkış
          </button>
        </Section>
        <Section title="Zaman">
          <Slider label="Başlangıç" value={a.startMs} min={0} max={Math.max(total, 1000)} step={100} onChange={(v) => upd({ startMs: v, ...(a.endMs !== null && a.kind === 'voice' ? { endMs: v + (a.endMs - a.startMs) } : {}) })} show={fmt} />
        </Section>
      </div>
    </>
  )
}

function ProjectInspector({ p, d, total, change }: { p: EditProject; d: Draft; total: number; change: (fn: (x: Draft) => Draft) => void }) {
  return (
    <>
      <Tabs items={[['info', 'Ayrıntılar']]} value="info" onChange={() => undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Proje">
          <dl className="grid grid-cols-[90px_1fr] gap-y-1.5 text-[12px]">
            <dt className="text-zinc-500">Oran</dt>
            <dd>{ASPECT_LABEL[d.aspect]}</dd>
            <dt className="text-zinc-500">Süre</dt>
            <dd className="tabular-nums">
              {fmt(total)}
              {d.closing ? ` + kapanış` : ''}
            </dd>
            <dt className="text-zinc-500">Klip</dt>
            <dd>{d.clips.length}</dd>
            <dt className="text-zinc-500">Kare hızı</dt>
            <dd>30 fps · 1080p</dd>
          </dl>
        </Section>
        <Section title="Paylaşım metni">
          <textarea value={d.caption} onChange={(e) => change((x) => ({ ...x, caption: e.target.value.slice(0, 2000) }))} rows={5} className={inputCls} placeholder="Boş bırakılırsa proje adı kullanılır. Bağlı haber varsa linki eklenir." />
        </Section>
        <Section title="nahaber.com kapanışı">
          {p.newsVideo ? (
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={d.closing} onChange={(e) => change((x) => ({ ...x, closing: e.target.checked }))} className="accent-cyan-400" />
              Sona kapanış ekle (habere uygulanacak videoda genelde kapalı)
            </label>
          ) : (
            <p className="text-[12px] text-zinc-400">Her videonun sonunda otomatik eklenir.</p>
          )}
        </Section>
        <Section title="İpuçları">
          <ul className="list-disc space-y-1 pl-4 text-[11px] text-zinc-400">
            <li>Boşluk: oynat / duraklat · S: böl · Delete: sil · Ctrl+Z: geri al</li>
            <li>Klipleri sürükleyerek sıralayın, kenarından çekerek kısaltın.</li>
            <li>Önizleme yaklaşıktır; müzik, geçiş ve kapanış dışa aktarmada eklenir.</li>
          </ul>
        </Section>
      </div>
    </>
  )
}

// ── crop dialog ──────────────────────────────────────────────────────────────

function CropDialog({ clip, asset, onClose, onApply }: { clip: VideoClip | null; asset: EditAsset | null; onClose: () => void; onApply: (crop: Crop | null, rotate: number) => void }) {
  const [crop, setCrop] = useState<Crop>(clip?.crop ?? { x: 0, y: 0, w: 1, h: 1 })
  const [rotate, setRotate] = useState(clip?.rotate ?? 0)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [preset, setPreset] = useState<'free' | '9:16' | '1:1' | '16:9' | '4:5'>('free')
  const imgRef = useRef<HTMLDivElement>(null)
  if (!clip || !asset) return null
  const srcRatio = nat ? nat.w / nat.h : 16 / 9
  const box = { w: srcRatio >= 1 ? 640 : 380 * srcRatio, h: srcRatio >= 1 ? 640 / srcRatio : 380 }
  const clamp = (c: Crop): Crop => {
    const w = Math.min(1, Math.max(0.05, c.w))
    const h = Math.min(1, Math.max(0.05, c.h))
    return { x: Math.min(1 - w, Math.max(0, c.x)), y: Math.min(1 - h, Math.max(0, c.y)), w, h }
  }
  const applyPreset = (pr: typeof preset) => {
    setPreset(pr)
    if (pr === 'free') return
    const r = RATIO[pr] / srcRatio // width/height in normalised units
    const w = r >= 1 ? 1 : r
    const h = r >= 1 ? 1 / r : 1
    setCrop(clamp({ x: (1 - w) / 2, y: (1 - h) / 2, w, h }))
  }
  const dragCrop = (e: RPointerEvent, mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') => {
    e.preventDefault()
    e.stopPropagation()
    const rect = imgRef.current!.getBoundingClientRect()
    const x0 = e.clientX
    const y0 = e.clientY
    const c0 = crop
    const lock = preset !== 'free' ? c0.w / c0.h : null
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / rect.width
      const dy = (ev.clientY - y0) / rect.height
      if (mode === 'move') return setCrop(clamp({ ...c0, x: c0.x + dx, y: c0.y + dy }))
      let { x, y, w, h } = c0
      if (mode.includes('w')) (x = c0.x + dx), (w = c0.w - dx)
      if (mode.includes('e')) w = c0.w + dx
      if (mode.includes('n')) (y = c0.y + dy), (h = c0.h - dy)
      if (mode.includes('s')) h = c0.h + dy
      if (lock) {
        h = w / lock
        if (mode.includes('n')) y = c0.y + c0.h - h
      }
      if (x < 0) (w += x), (x = 0)
      if (y < 0) (h += y), (y = 0)
      setCrop(clamp({ x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) }))
    }
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up))
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const handle = 'absolute h-3.5 w-3.5 rounded-sm border-2 border-white bg-cyan-400'
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-label="Kırp">
      <div className="flex max-h-full w-[760px] max-w-full flex-col gap-3 rounded-xl bg-[#1B1C20] p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-bold text-white">Kırp</p>
          <button type="button" onClick={onClose} className="text-[12px] text-zinc-400 hover:text-white">
            Kapat
          </button>
        </div>
        <div className="flex justify-center bg-[#0B0C0E] p-3">
          <div ref={imgRef} className="relative select-none" style={{ width: box.w, height: box.h, transform: `rotate(${rotate}deg)` }}>
            {asset.kind === 'video' ? (
              <video src={`${asset.url}#t=${(clip.inMs / 1000).toFixed(2)}`} muted playsInline preload="auto" onLoadedMetadata={(e) => setNat({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })} className="h-full w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.url} alt="" onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} className="h-full w-full" />
            )}
            <div className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }} onPointerDown={(e) => dragCrop(e, 'move')}>
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} className="border border-white/25" />
                ))}
              </div>
              <span className={cn(handle, '-left-2 -top-2 cursor-nwse-resize')} onPointerDown={(e) => dragCrop(e, 'nw')} />
              <span className={cn(handle, '-right-2 -top-2 cursor-nesw-resize')} onPointerDown={(e) => dragCrop(e, 'ne')} />
              <span className={cn(handle, '-bottom-2 -left-2 cursor-nesw-resize')} onPointerDown={(e) => dragCrop(e, 'sw')} />
              <span className={cn(handle, '-bottom-2 -right-2 cursor-nwse-resize')} onPointerDown={(e) => dragCrop(e, 'se')} />
            </div>
          </div>
        </div>
        <Slider label="Döndürme" value={rotate} min={-180} max={180} step={1} onChange={setRotate} show={(v) => `${v}°`} />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={lbl}>Kırp:</span>
          {(
            [
              ['free', 'Serbest'],
              ['9:16', '9:16'],
              ['1:1', '1:1'],
              ['4:5', '4:5'],
              ['16:9', '16:9'],
            ] as const
          ).map(([id, l]) => (
            <button key={id} type="button" onClick={() => applyPreset(id)} className={chip(preset === id)}>
              {l}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => (setCrop({ x: 0, y: 0, w: 1, h: 1 }), setRotate(0), setPreset('free'))} className="rounded-md border border-[#33363D] px-3 py-1.5 text-[12px] font-semibold hover:border-zinc-500">
              Sıfırla
            </button>
            <button type="button" onClick={() => onApply(crop.x === 0 && crop.y === 0 && crop.w >= 0.999 && crop.h >= 0.999 ? null : crop, rotate)} className="rounded-md bg-cyan-500 px-4 py-1.5 text-[12px] font-bold text-black">
              Onayla
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── export / share / news ────────────────────────────────────────────────────

type ShareAccount = { accountId: string; platform: 'facebook' | 'instagram' | 'threads' | 'youtube'; displayName: string; username: string | null; selectable: boolean; reason: string | null }
type ShareRow = { accountId: string; label: string; state: 'sending' | 'ok' | 'failed' | 'uncertain'; text: string }
const PNAME = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', youtube: 'YouTube' } as const

function ExportDialog({ p, d, fresh, flush, setP, onClose }: { p: EditProject; d: Draft; fresh: boolean; flush: () => Promise<EditProject | null>; setP: (p: EditProject) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [newsBusy, setNewsBusy] = useState(false)
  const problem = renderProblem(d)
  const render = async () => {
    const saved = await flush()
    if (!saved) return
    setBusy(true)
    setElapsed(0)
    const r = await runReelJob(`${KURGU_API}/${saved.id}/render`, {}, setElapsed)
    const after = await reelsCall<{ project: EditProject }>('GET', `${KURGU_API}/${saved.id}`)
    if (after.ok) setP(after.data.project)
    setBusy(false)
    if (!r.ok) toast.error(r.error)
    else toast.success('Video hazır')
  }
  const news = async (action: 'apply' | 'restore') => {
    setNewsBusy(true)
    const r = await reelsCall<{ project: EditProject }>('POST', `${KURGU_API}/${p.id}/news`, { action })
    setNewsBusy(false)
    if (!r.ok) return void toast.error(r.error)
    setP(r.data.project)
    toast.success(action === 'apply' ? 'Haber sayfası artık bu videoyu gösteriyor' : 'Haberin orijinal videosu geri getirildi')
  }
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/50" role="dialog" aria-label="Dışa aktar">
      <div className="flex h-full w-[440px] max-w-full flex-col overflow-y-auto bg-[#1B1C20] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#24262B] px-4 py-3">
          <p className="text-[15px] font-bold text-white">Dışa aktar</p>
          <button type="button" onClick={onClose} className="text-[12px] text-zinc-400 hover:text-white">
            Kapat
          </button>
        </div>
        <Section title="Video">
          <p className="text-[12px] text-zinc-400">
            {ASPECT_LABEL[d.aspect]} · 1080p · 30 fps · MP4 {d.closing ? '· nahaber.com kapanışı' : ''}
          </p>
          {problem ? <p className="text-[12px] text-amber-300">{problem}</p> : null}
          {fresh && p.render.outputUrl ? (
            <>
              <video src={p.render.outputUrl} controls playsInline className="max-h-[320px] w-full rounded-md bg-black" />
              <div className="flex gap-2">
                <a href={p.render.outputUrl} download target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[#33363D] py-2 text-[12px] font-semibold hover:border-zinc-500">
                  <Download className="h-4 w-4" /> İndir ({p.render.seconds ? `${Math.round(p.render.seconds)} sn` : ''})
                </a>
              </div>
            </>
          ) : (
            <button type="button" disabled={busy || !!problem} onClick={render} className="flex items-center justify-center gap-2 rounded-md bg-cyan-500 py-2.5 text-[13px] font-bold text-black disabled:opacity-40">
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Üretiliyor… {Math.round(elapsed / 1000)} sn
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" /> {p.render.status === 'ready' ? 'Değişikliklerle yeniden üret' : 'Videoyu üret'}
                </>
              )}
            </button>
          )}
          {p.render.status === 'failed' && !busy ? <p className="text-[12px] text-red-400">Son deneme başarısız: {p.render.error}</p> : null}
        </Section>
        {p.newsVideo && p.linkedNewsId ? (
          <Section title="Haberdeki video">
            <p className="text-[12px] text-zinc-400">{p.newsApplied ? 'Haber sayfası bu projenin videosunu gösteriyor. Orijinal saklı.' : 'Haber şu an kendi orijinal videosunu gösteriyor.'}</p>
            <div className="flex gap-2">
              <button type="button" disabled={!fresh || newsBusy} onClick={() => news('apply')} className="flex-1 rounded-md bg-amber-500 py-2 text-[12px] font-bold text-black disabled:opacity-40">
                {newsBusy ? '…' : 'Habere uygula'}
              </button>
              <button type="button" disabled={!p.newsApplied || newsBusy} onClick={() => news('restore')} className="flex-1 rounded-md border border-[#33363D] py-2 text-[12px] font-semibold disabled:opacity-40">
                Orijinale dön
              </button>
            </div>
          </Section>
        ) : null}
        {fresh ? <SharePanelK projectId={p.id} renderKey={p.render.key ?? ''} /> : <Section title="Paylaş"><p className="text-[12px] text-zinc-500">Önce videoyu üretin.</p></Section>}
      </div>
    </div>
  )
}

function SharePanelK({ projectId, renderKey }: { projectId: string; renderKey: string }) {
  const [format, setFormat] = useState<'reel' | 'video_story'>('reel')
  const [accounts, setAccounts] = useState<ShareAccount[] | null>(null)
  const [sel, setSel] = useState<string[]>([])
  const [rows, setRows] = useState<ShareRow[]>([])
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    let off = false
    setAccounts(null)
    setSel([])
    setConfirm(false)
    void reelsCall<{ accounts: ShareAccount[] }>('GET', `${KURGU_API}/${projectId}/share?format=${format}`).then((r) => {
      if (!off) setAccounts(r.ok ? r.data.accounts : [])
    })
    return () => {
      off = true
    }
  }, [projectId, renderKey, format])
  const label = (a: ShareAccount) => `${PNAME[a.platform]} · ${a.displayName}${a.username ? ` (@${a.username})` : ''}`
  const send = async () => {
    setBusy(true)
    setConfirm(false)
    const chosen = (accounts ?? []).filter((a) => sel.includes(a.accountId))
    setRows(chosen.map((a) => ({ accountId: a.accountId, label: label(a), state: 'sending', text: 'gönderiliyor…' })))
    for (const a of chosen) {
      const r = await runReelJob(`${KURGU_API}/${projectId}/share`, { accountId: a.accountId, format })
      const res = r.ok ? ((r.job.result as { result?: { success?: boolean; code?: string; error?: string; ledgerStatus?: string; platformId?: string } } | null)?.result ?? null) : null
      const state: ShareRow['state'] = !r.ok ? 'failed' : res?.success ? 'ok' : res?.ledgerStatus === 'uncertain' ? 'uncertain' : 'failed'
      const text = !r.ok ? r.error : res?.success ? `yayımlandı${res.platformId ? ` · ${res.platformId}` : ''}` : res?.code === 'already_published' ? 'zaten paylaşılmış — tekrar gönderilmedi' : res?.ledgerStatus === 'uncertain' ? 'sonuç belirsiz — platformda kontrol edin; otomatik tekrar yok' : (r.job.error ?? res?.error ?? 'başarısız')
      setRows((cur) => cur.map((x) => (x.accountId === a.accountId ? { ...x, state, text } : x)))
    }
    setBusy(false)
  }
  return (
    <Section title="Paylaş" right={<Share2 className="h-4 w-4 text-zinc-500" />}>
      <div className="flex gap-1.5">
        {(['reel', 'video_story'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFormat(f)} className={chip(format === f)}>
            {f === 'reel' ? 'Reels / video gönderi' : 'Video hikâye'}
          </button>
        ))}
      </div>
      {accounts === null ? <p className="text-[12px] text-zinc-500">Hesaplar yükleniyor…</p> : null}
      {accounts && !accounts.length ? <p className="text-[12px] text-zinc-500">Bu biçim için bağlı hesap yok.</p> : null}
      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {(accounts ?? []).map((a) => (
          <li key={a.accountId}>
            <label className={cn('flex items-start gap-2 rounded-md border border-[#2B2D33] px-2 py-1.5 text-[12px]', !a.selectable && 'opacity-50')}>
              <input type="checkbox" disabled={!a.selectable || busy} checked={sel.includes(a.accountId)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, a.accountId] : s.filter((x) => x !== a.accountId)))} className="mt-0.5 accent-cyan-400" />
              <span>
                {label(a)}
                {a.reason ? <span className="block text-[11px] text-amber-300">{a.reason}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {confirm ? (
        <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[12px] text-amber-200">
          {sel.length} hesapta yayımlanacak. Emin misiniz?
          <div className="flex gap-2">
            <button type="button" onClick={send} className="rounded-md bg-amber-500 px-3 py-1 font-bold text-black">
              Evet, paylaş
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="rounded-md border border-[#33363D] px-3 py-1">
              Vazgeç
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!sel.length || busy} onClick={() => setConfirm(true)} className="flex items-center justify-center gap-2 rounded-md bg-white py-2 text-[12px] font-bold text-black disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Seçili hesaplarda paylaş
        </button>
      )}
      {rows.map((r) => (
        <p key={r.accountId} className={cn('text-[11px]', r.state === 'ok' ? 'text-emerald-300' : r.state === 'failed' ? 'text-red-400' : r.state === 'uncertain' ? 'text-amber-300' : 'text-zinc-400')}>
          {r.label}: {r.text}
        </p>
      ))}
    </Section>
  )
}

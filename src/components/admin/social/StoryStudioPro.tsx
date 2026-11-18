'use client'

/**
 * STORY-2 — «Konu → Video» profesyonel oluşturma stüdyosu.
 *
 *   ┌ üst çubuk: proje · başlık · biçim (dikey / yatay) · süre (1 / 3 / 5 / 10 dk) · stil · planla · üret ┐
 *   │ sol: Medya kutusu (sürükle-bırak yükleme, kütüphane videosu) · Çekim listesi · Proje ayarları     │
 *   │ orta: gerçek kare önizleme (altyazı, etiket, filigran yerleşimi) · üretilen video · paylaşım      │
 *   │ sağ: sahne denetçisi (metin, vurgu, etiket, görüntü, video başlangıcı, çekim notu)                │
 *   └ alt: zaman çizelgesi — süreyle orantılı bloklar, sürükleyerek sıralama, medyayı bloğa bırakma     ┘
 *
 * 1 dakikalık videolar AI çizimi kullanabilir (ücretli, bütçeli). 3 / 5 / 10 dakikalık videolar
 * yalnızca editörün kendi fotoğraf / videolarını kullanır; görüntüsü olmayan sahne ücretsiz
 * «metin kartı» olur ve çekim listesinde ne eklenmesi gerektiği yazar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  Clapperboard,
  Film,
  ImagePlus,
  Images,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Smartphone,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Wand2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import { auth } from '@/lib/firebase/auth'
import { storage } from '@/lib/firebase/storage'
import { cn } from '@/lib/utils'
import { reelsCall, runReelJob } from './reelsApi'
import { ReelsVideoPicker } from './ReelsVideoPicker'
import { RightsForm } from './MediaProjectStudio'
import type { MediaRights, MediaShareFormat, MediaSharePlatform } from '@/lib/media/mediaProject'
import {
  allowsAiImages,
  estimateSeconds,
  FRAMES,
  MAX_SCENES,
  MAX_SECONDS,
  missingImages,
  renderKeyFor,
  renderProblem,
  shotList,
  STORY_STYLES,
  STYLE_THEME,
  TARGET_MINUTES,
  type SceneVisual,
  type StoryAsset,
  type StoryFormat,
  type StoryProject,
  type StoryScene,
  type StoryStyle,
  type TargetMin,
} from '@/lib/story/storyProject'

const API = '/api/admin/social/story-projects'
type Usage = { month: string; usd: number; images: number; budget: number; price: number } | null
type ShareAccount = { accountId: string; platform: MediaSharePlatform; displayName: string; username: string | null; selectable: boolean; reason: string | null }
type ShareRow = { accountId: string; label: string; state: 'sending' | 'ok' | 'failed' | 'uncertain'; text: string }
type Draft = { title: string; topic: string; script: string; caption: string; style: StoryStyle; seriesLabel: string; rights: MediaRights; format: StoryFormat; targetMin: TargetMin }
type LeftTab = 'media' | 'shots' | 'settings'

const emptyRights: MediaRights = { kind: 'owned', sourceName: null, note: null }
const emptyDraft: Draft = { title: '', topic: '', script: '', caption: '', style: 'paper', seriesLabel: 'NaHaber', rights: emptyRights, format: 'vertical', targetMin: 1 }
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('')
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const sceneLen = (s: Pick<StoryScene, 'text'>) => Math.max(1.6, [...s.text].length / 14.5 + 0.4)

const panel = 'rounded-2xl border border-white/10 bg-[#16181d] text-zinc-100'
const field = 'w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-red-500 focus:outline-none'
const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40'
const chip = (on: boolean) => cn('rounded-md px-2.5 py-1 text-xs font-bold transition', on ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100')

/** How many visuals to prepare for a length (assets may be reused across scenes). */
const VISUAL_GUIDE: Record<TargetMin, { scenes: string; visuals: string; videos: string }> = {
  1: { scenes: '6–12', visuals: '4–8', videos: '1–3 kısa video (5–10 sn)' },
  3: { scenes: '18–30', visuals: '12–20', videos: '4–8 video (8–20 sn)' },
  5: { scenes: '30–50', visuals: '20–30', videos: '6–12 video (10–30 sn)' },
  10: { scenes: '60–100', visuals: '40–60', videos: '12–25 video (10–40 sn)' },
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-400">{children}</span>
}

export function StoryStudioPro() {
  const [list, setList] = useState<StoryProject[] | null>(null)
  const [ai, setAi] = useState<{ text: boolean; images: boolean } | null>(null)
  const [usage, setUsage] = useState<Usage>(null)
  const [p, setP] = useState<StoryProject | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [metaDirty, setMetaDirty] = useState(false)
  const [scenes, setScenes] = useState<StoryScene[]>([])
  const [dirty, setDirty] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ text: string; pct: number | null } | null>(null)
  const [uploads, setUploads] = useState<Record<string, number>>({})
  const [left, setLeft] = useState<LeftTab>('settings')
  const [dropHot, setDropHot] = useState(false)
  const [drag, setDrag] = useState<{ kind: 'scene'; id: string } | { kind: 'asset'; id: string } | null>(null)
  const [zoom, setZoom] = useState(1)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadList = useCallback(async () => {
    const r = await reelsCall<{ projects: StoryProject[]; ai: { text: boolean; images: boolean }; usage: Usage }>('GET', API)
    if (!r.ok) {
      toast.error(r.error)
      setList([])
      return
    }
    setList(r.data.projects)
    setAi(r.data.ai)
    setUsage(r.data.usage)
  }, [])
  useEffect(() => {
    void loadList()
  }, [loadList])

  const open = useCallback((proj: StoryProject | null) => {
    setP(proj)
    setDraft(proj ? { title: proj.title, topic: proj.topic, script: proj.script, caption: proj.caption, style: proj.style, seriesLabel: proj.seriesLabel, rights: proj.rights, format: proj.format ?? 'vertical', targetMin: proj.targetMin ?? 1 } : emptyDraft)
    setScenes(proj?.scenes ?? [])
    setSel(proj?.scenes[0]?.id ?? null)
    setDirty(false)
    setMetaDirty(false)
    setLeft(proj ? (proj.scenes.length ? 'media' : 'media') : 'settings')
  }, [])

  const apply = useCallback((proj: StoryProject | null | undefined, keepScenes = false) => {
    if (!proj) return
    setP(proj)
    if (!keepScenes) {
      setScenes(proj.scenes)
      setDirty(false)
      setSel((s) => (s && proj.scenes.some((x) => x.id === s) ? s : (proj.scenes[0]?.id ?? null)))
    }
    setList((l) => (l ? [proj, ...l.filter((x) => x.id !== proj.id)] : [proj]))
  }, [])

  const reload = useCallback(
    async (id: string, keepScenes = false) => {
      const r = await reelsCall<{ project: StoryProject }>('GET', `${API}/${id}`)
      if (r.ok) apply(r.data.project, keepScenes)
    },
    [apply],
  )

  const setD = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setMetaDirty(true)
  }

  // ── save ───────────────────────────────────────────────────────────────────
  const saveMeta = async (): Promise<StoryProject | null> => {
    setBusy('meta')
    const r = p ? await reelsCall<{ project: StoryProject }>('POST', `${API}/${p.id}`, draft) : await reelsCall<{ project: StoryProject }>('POST', API, draft)
    setBusy(null)
    if (!r.ok) {
      toast.error(r.error)
      return null
    }
    apply(r.data.project, dirty)
    setDraft((d) => ({ ...d, title: r.data.project.title, seriesLabel: r.data.project.seriesLabel }))
    setMetaDirty(false)
    if (!p) {
      toast.success('Proje oluşturuldu — şimdi görüntülerinizi ekleyin, sonra «AI ile planla»')
      setLeft('media')
    }
    return r.data.project
  }

  const saveScenes = async (): Promise<boolean> => {
    if (!p) return false
    setBusy('scenes')
    const r = await reelsCall<{ project: StoryProject }>('POST', `${API}/${p.id}`, { scenes })
    setBusy(null)
    if (!r.ok) {
      toast.error(r.error)
      return false
    }
    apply(r.data.project)
    return true
  }

  const saveAll = async (): Promise<boolean> => {
    if (metaDirty || !p) {
      if (!(await saveMeta())) return false
    }
    if (dirty) return saveScenes()
    return true
  }

  // ── media ──────────────────────────────────────────────────────────────────
  const watchDescribe = async (id: string, job: { jobId: string } | null | undefined) => {
    if (!job?.jobId) return
    for (let i = 0; i < 40; i++) {
      await new Promise((res) => setTimeout(res, i < 5 ? 3000 : 8000))
      const r = await reelsCall<{ job: { status: string } }>('GET', `${API}/${id}/assets?job=${encodeURIComponent(job.jobId)}`)
      if (!r.ok || r.data.job.status !== 'running') break
    }
    await reload(id, true)
  }

  const uploadImages = async (files: FileList | File[] | null) => {
    if (!files || !('length' in files) || !files.length) return
    let proj = p
    if (!proj) {
      proj = await saveMeta()
      if (!proj) return
    }
    const uid = auth.currentUser?.uid
    if (!uid) return toast.error('Oturum bulunamadı; sayfayı yenileyin')
    const arr = Array.from(files)
    const vids = arr.filter((f) => f.type.startsWith('video/'))
    if (vids.length) toast(`Videoları önce Video Kütüphanesi'ne yükleyin, sonra «Kütüphaneden video» ile ekleyin (${vids.length} video atlandı)`, { icon: '🎬', duration: 6000 })
    const imgs = arr.filter((f) => f.type.startsWith('image/'))
    // two at a time: quick, without saturating the editor's connection
    let next = 0
    const worker = async () => {
      while (next < imgs.length) {
        const file = imgs[next++]
        if (file.size > 50 * 1024 * 1024) {
          toast.error(`${file.name}: 50 MB sınırını aşıyor`)
          continue
        }
        const name = `${Date.now()}_${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`.slice(0, 120)
        const path = `news-images/${uid}/story/${proj!.id}/${name}`
        try {
          const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type })
          await new Promise<void>((resolve, reject) =>
            task.on('state_changed', (s) => setUploads((u) => ({ ...u, [file.name]: Math.round((s.bytesTransferred / s.totalBytes) * 100) })), reject, () => resolve()),
          )
          const previewUrl = await getDownloadURL(task.snapshot.ref)
          const r = await reelsCall<{ project: StoryProject; job: { jobId: string } }>('POST', `${API}/${proj!.id}/assets`, { action: 'add', kind: 'image', storagePath: path, previewUrl, name: file.name })
          if (!r.ok) toast.error(`${file.name}: ${r.error}`)
          else {
            apply(r.data.project, true)
            void watchDescribe(proj!.id, r.data.job)
          }
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
    await Promise.all([worker(), worker()])
  }

  const addVideo = async (v: { id: string; title: string } | null) => {
    if (!p || !v) return
    const r = await reelsCall<{ project: StoryProject; job: { jobId: string } }>('POST', `${API}/${p.id}/assets`, { action: 'add', kind: 'video', videoItemId: v.id })
    if (!r.ok) return toast.error(r.error)
    apply(r.data.project, true)
    toast.success('Video eklendi; AI izliyor…')
    void watchDescribe(p.id, r.data.job)
  }

  const removeAsset = async (assetId: string) => {
    if (!p || !confirm(`Bu görüntü projeden çıkarılsın mı? Kullanan sahneler ${allowsAiImages(draft) ? 'AI çizimine' : 'metin kartına'} döner.`)) return
    const r = await reelsCall<{ project: StoryProject }>('POST', `${API}/${p.id}/assets`, { action: 'remove', assetId })
    if (!r.ok) return toast.error(r.error)
    apply(r.data.project)
  }

  const redescribe = async (assetId: string) => {
    if (!p) return
    const r = await reelsCall<{ job: { jobId: string } }>('POST', `${API}/${p.id}/assets`, { action: 'describe', assetId })
    if (!r.ok) return toast.error(r.error)
    void watchDescribe(p.id, r.data.job)
  }

  // ── scenes ─────────────────────────────────────────────────────────────────
  const plan = async () => {
    if (!p) return
    if (scenes.length && !confirm('AI sahneleri yeniden planlayacak; mevcut sahne listesi değişir. Devam edilsin mi?')) return
    if (!(await saveAll())) return
    setBusy('plan')
    setProgress({ text: 'AI editör sahneleri hazırlıyor…', pct: null })
    const r = await runReelJob(`${API}/${p.id}/plan`, {}, (ms) => setProgress({ text: `AI editör çalışıyor… ${Math.round(ms / 1000)} sn${draft.targetMin > 1 ? ' (uzun anlatım 1–3 dk sürebilir)' : ''}`, pct: null }))
    setBusy(null)
    setProgress(null)
    if (!r.ok) return toast.error(r.error)
    const res = r.job.result as { project?: StoryProject; note?: string | null }
    apply(res.project ?? null)
    // long videos: the AI-written script is now visible / editable in «Proje»
    if (res.project) setDraft((d) => ({ ...d, script: res.project!.script, title: res.project!.title, caption: res.project!.caption }))
    if (res.note) toast(res.note, { icon: 'ℹ️' })
    else toast.success(draft.targetMin > 1 ? 'Sahneler hazır — «Çekim listesi»nde hangi görüntülerin eksik olduğunu görün' : 'Sahneler hazır — kontrol edin, istediğinizi değiştirin')
    if (draft.targetMin > 1) setLeft('shots')
  }

  const patchScene = (id: string, fn: (s: StoryScene) => StoryScene) => {
    setScenes((xs) => xs.map((s) => (s.id === id ? fn(s) : s)))
    setDirty(true)
  }
  const assignAsset = (sceneId: string, assetId: string) => patchScene(sceneId, (x) => ({ ...x, visual: { kind: 'asset', assetId, offsetMs: 0 } }))
  const setVisualKind = (s: StoryScene, value: string) => {
    if (value === 'ai') patchScene(s.id, (x) => ({ ...x, keepAudio: false, visual: x.visual.kind === 'ai' ? x.visual : { kind: 'ai', prompt: x.text, imagePath: null, imageUrl: null, imageKey: null, error: null } }))
    else if (value === 'card') patchScene(s.id, (x) => ({ ...x, keepAudio: false, visual: { kind: 'card' } }))
    else assignAsset(s.id, value)
  }
  const moveScene = (fromId: string, toId: string) => {
    if (fromId === toId) return
    setScenes((xs) => {
      const a = xs.findIndex((x) => x.id === fromId)
      const b = xs.findIndex((x) => x.id === toId)
      if (a < 0 || b < 0) return xs
      const n = [...xs]
      const [m] = n.splice(a, 1)
      n.splice(b, 0, m)
      return n
    })
    setDirty(true)
  }
  const nudge = (id: string, d: -1 | 1) => {
    setScenes((xs) => {
      const i = xs.findIndex((x) => x.id === id)
      const j = i + d
      if (i < 0 || j < 0 || j >= xs.length) return xs
      const n = [...xs]
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
    setDirty(true)
  }
  const addScene = () => {
    const after = scenes.findIndex((x) => x.id === sel)
    const s: StoryScene = {
      id: newId(),
      text: 'Yeni sahne metni.',
      highlights: [],
      label: null,
      keepAudio: false,
      reason: null,
      need: allowsAiImages(draft) ? null : 'Bu cümleyi anlatan bir fotoğraf ya da kısa video ekleyin',
      visual: allowsAiImages(draft) ? { kind: 'ai', prompt: '', imagePath: null, imageUrl: null, imageKey: null, error: null } : { kind: 'card' },
    }
    setScenes((xs) => {
      const n = [...xs]
      n.splice(after < 0 ? n.length : after + 1, 0, s)
      return n
    })
    setSel(s.id)
    setDirty(true)
  }
  const deleteScene = (id: string) => {
    const i = scenes.findIndex((x) => x.id === id)
    setScenes((xs) => xs.filter((x) => x.id !== id))
    setSel(scenes[i + 1]?.id ?? scenes[i - 1]?.id ?? null)
    setDirty(true)
  }

  // ── production ─────────────────────────────────────────────────────────────
  const live: StoryProject | null = p ? { ...p, scenes, format: draft.format, targetMin: draft.targetMin, style: draft.style } : null
  const missing = live ? missingImages(live) : []
  const problem = live ? renderProblem(live) : null
  const fresh = !!(p && !dirty && !metaDirty && p.render.status === 'ready' && p.render.key === renderKeyFor({ ...p, scenes }))

  const makeImages = async (sceneId?: string) => {
    if (!p) return
    if (!(await saveAll())) return
    const n = sceneId ? 1 : missing.length
    if (usage && !confirm(`${n} çizim üretilecek (tahmini ${(n * usage.price).toFixed(2)} $; bu ay ${usage.usd.toFixed(2)} / ${usage.budget} $). Devam?`)) return
    setBusy('images')
    setProgress({ text: 'Çizimler üretiliyor…', pct: null })
    const r = await runReelJob(`${API}/${p.id}/images`, sceneId ? { sceneId } : {}, (ms) => setProgress({ text: `Çizimler üretiliyor… ${Math.round(ms / 1000)} sn`, pct: null }))
    setBusy(null)
    setProgress(null)
    await loadList()
    if (!r.ok) {
      await reload(p.id)
      return toast.error(r.error)
    }
    const res = r.job.result as { made?: number; failed?: number; errors?: string[]; project?: StoryProject; note?: string } | null
    if (res?.project) apply(res.project)
    else await reload(p.id)
    if (res?.failed) toast.error(`${res.made ?? 0} çizim üretildi, ${res.failed} başarısız: ${res.errors?.[0] ?? ''}`)
    else toast.success(res?.note ?? `${res?.made ?? 0} çizim üretildi`)
  }

  /**
   * 1 min: one job. Longer: prepare (narration) → parts, two at a time (each its own server
   * function) → finish (join). The server keeps the progress, so pressing again resumes.
   */
  const render = async () => {
    if (!p) return
    if (!(await saveAll())) return
    const url = `${API}/${p.id}/render`
    setBusy('render')
    const t0 = Date.now()
    const el = () => fmt((Date.now() - t0) / 1000)
    try {
      if (draft.targetMin === 1) {
        setProgress({ text: 'Video hazırlanıyor (seslendirme, sahneler, altyazı)…', pct: null })
        const r = await runReelJob(url, {}, () => setProgress({ text: `Video hazırlanıyor… ${el()} (genelde 2–5 dk)`, pct: null }))
        if (!r.ok) throw new Error(r.error)
        const res = r.job.result as { project?: StoryProject; stored?: boolean } | null
        if (res?.project) apply(res.project)
        else await reload(p.id)
        toast.success(res?.stored === false ? 'Video üretildi ama bu sırada proje değişti; yeniden üretin' : 'Video hazır')
        return
      }
      for (let round = 0; round < 12; round++) {
        setProgress({ text: `Durum kontrol ediliyor… ${el()}`, pct: null })
        const r = await runReelJob(url, {}, () => setProgress({ text: round === 0 ? `Seslendirme hazırlanıyor (bütün sahneler)… ${el()}` : `Parçalar birleştiriliyor… ${el()}`, pct: round === 0 ? 4 : 96 }))
        if (!r.ok) throw new Error(r.error)
        const res = r.job.result as { project?: StoryProject; phase?: string; missing?: number[]; total?: number; done?: number; stored?: boolean; reused?: boolean } | null
        if (res?.project && (res.reused || res.project.render.status === 'ready')) {
          apply(res.project)
          toast.success(res.stored === false ? 'Video üretildi ama bu sırada proje değişti; yeniden üretin' : 'Video hazır')
          return
        }
        if (res?.phase === 'parts' && res.missing?.length) {
          const total = res.total ?? res.missing.length
          let done = res.done ?? 0
          const queue = [...res.missing]
          const errors: string[] = []
          const tick = () => setProgress({ text: `Parçalar üretiliyor: ${done} / ${total} hazır · ${el()} (aynı anda 2 parça)`, pct: 6 + (88 * done) / total })
          tick()
          const worker = async () => {
            while (queue.length) {
              const k = queue.shift()!
              const pr = await runReelJob(url, { part: k }, tick)
              if (!pr.ok) errors.push(`Parça ${k + 1}: ${pr.error}`)
              else done++
              tick()
            }
          }
          await Promise.all([worker(), worker()])
          if (errors.length) throw new Error(`${errors.length} parça üretilemedi — «Videoyu üret» ile kaldığı yerden devam edin. ${errors[0]}`)
        }
      }
      throw new Error('Video tamamlanamadı; «Videoyu üret» ile kaldığı yerden devam edin')
    } catch (e) {
      await reload(p.id)
      toast.error(e instanceof Error ? e.message : 'Video üretilemedi', { duration: 8000 })
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  // ── share ──────────────────────────────────────────────────────────────────
  const [shareFmt, setShareFmt] = useState<MediaShareFormat>('reel')
  const [accounts, setAccounts] = useState<ShareAccount[] | null>(null)
  const [caption, setCaption] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [rows, setRows] = useState<ShareRow[]>([])
  useEffect(() => {
    if (!p || !fresh) {
      setAccounts(null)
      return
    }
    void reelsCall<{ accounts: ShareAccount[]; caption: string }>('GET', `${API}/${p.id}/share?format=${shareFmt}`).then((r) => {
      if (r.ok) {
        setAccounts(r.data.accounts)
        setCaption(r.data.caption)
      } else setAccounts([])
    })
  }, [p, fresh, shareFmt])

  const share = async () => {
    if (!p || !accounts) return
    const targets = accounts.filter((a) => picked.has(a.accountId) && a.selectable)
    if (!targets.length) return toast.error('Hesap seçin')
    if (!confirm(`${targets.length} hesapta yayımlanacak. Onaylıyor musunuz?`)) return
    setRows(targets.map((a) => ({ accountId: a.accountId, label: `${a.displayName} (${a.platform})`, state: 'sending', text: 'Gönderiliyor…' })))
    for (const a of targets) {
      const r = await runReelJob(`${API}/${p.id}/share`, { accountId: a.accountId, format: shareFmt })
      const res = r.ok ? ((r.job.result as { result?: { success?: boolean; code?: string; error?: string; ledgerStatus?: string; platformId?: string } } | null)?.result ?? null) : null
      const state: ShareRow['state'] = !r.ok ? 'failed' : res?.success ? 'ok' : res?.ledgerStatus === 'uncertain' ? 'uncertain' : 'failed'
      const text = !r.ok
        ? r.error
        : res?.success
          ? `yayımlandı${res.platformId ? ` · ${res.platformId}` : ''}`
          : res?.code === 'already_published'
            ? 'zaten paylaşılmış — tekrar gönderilmedi'
            : res?.ledgerStatus === 'uncertain'
              ? 'sonuç belirsiz — platformda kontrol edin; otomatik tekrar yok'
              : (r.job.error ?? res?.error ?? 'başarısız')
      setRows((xs) => xs.map((x) => (x.accountId === a.accountId ? { ...x, state, text } : x)))
    }
  }

  // ── derived view data ──────────────────────────────────────────────────────
  const timing = useMemo(() => {
    let t = 0
    return scenes.map((s) => {
      const len = sceneLen(s)
      const start = t
      t += len
      return { start, len }
    })
  }, [scenes])
  const total = estimateSeconds(scenes)
  const maxSec = MAX_SECONDS[draft.targetMin]
  const selIdx = scenes.findIndex((s) => s.id === sel)
  const cur = selIdx >= 0 ? scenes[selIdx] : null
  const assetOf = (v: SceneVisual): StoryAsset | undefined => (v.kind === 'asset' ? p?.assets.find((a) => a.id === v.assetId) : undefined)
  const thumbOf = (v: SceneVisual): string | null => (v.kind === 'ai' ? v.imageUrl : v.kind === 'asset' ? (assetOf(v)?.previewUrl ?? null) : null)
  const useCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of scenes) if (s.visual.kind === 'asset') m.set(s.visual.assetId, (m.get(s.visual.assetId) ?? 0) + 1)
    return m
  }, [scenes])
  const shots = shotList({ scenes })
  const covered = scenes.length ? scenes.filter((s) => s.visual.kind === 'asset').length / scenes.length : 0
  const F = FRAMES[draft.format]
  const vertical = draft.format === 'vertical'
  const th = STYLE_THEME[draft.style]
  const pxPerSec = (draft.targetMin === 1 ? 22 : draft.targetMin === 3 ? 12 : draft.targetMin === 5 ? 8 : 5) * zoom

  const changeTarget = (t: TargetMin) => {
    if (t > 1 && scenes.some((s) => s.visual.kind === 'ai')) {
      if (!confirm(`${t} dakikalık videoda AI çizimi kullanılmaz (maliyet yok). Çizimli sahneler metin kartına dönsün mü? (Sonra kendi görüntünüzü atayabilirsiniz.)`)) return
      setScenes((xs) => xs.map((s) => (s.visual.kind === 'ai' ? { ...s, visual: { kind: 'card' }, need: s.need || 'Bu cümleyi anlatan bir fotoğraf ya da kısa video ekleyin' } : s)))
      setDirty(true)
    }
    setD({ targetMin: t })
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full min-w-0 flex-col gap-3 rounded-3xl bg-[#0d0f13] p-3 text-zinc-100">
      {/* ── top bar ── */}
      <header className={cn(panel, 'flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5')}>
        <div className="flex items-center gap-2">
          <Clapperboard className="h-5 w-5 text-red-500" />
          <span className="text-sm font-black tracking-tight">Video Stüdyosu</span>
        </div>
        <select
          value={p?.id ?? ''}
          onChange={(e) => open((list ?? []).find((x) => x.id === e.target.value) ?? null)}
          className="max-w-[220px] rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs"
          aria-label="Proje"
        >
          <option value="">＋ Yeni proje</option>
          {(list ?? []).map((x) => (
            <option key={x.id} value={x.id}>
              {x.title.slice(0, 40)} · {x.targetMin ?? 1} dk {x.format === 'horizontal' ? 'yatay' : 'dikey'}
            </option>
          ))}
        </select>
        <input value={draft.title} onChange={(e) => setD({ title: e.target.value })} maxLength={120} placeholder="Video başlığı" className="min-w-[180px] flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-bold hover:border-white/10 focus:border-red-500 focus:outline-none" />

        <div className="flex items-center gap-1 rounded-lg bg-black/40 p-1" role="group" aria-label="Biçim">
          <button type="button" className={chip(vertical)} onClick={() => setD({ format: 'vertical' })} title="Reels, TikTok, Shorts">
            <Smartphone className="mr-1 inline h-3.5 w-3.5" />
            Dikey 9:16
          </button>
          <button type="button" className={chip(!vertical)} onClick={() => setD({ format: 'horizontal' })} title="YouTube">
            <Monitor className="mr-1 inline h-3.5 w-3.5" />
            Yatay 16:9
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-black/40 p-1" role="group" aria-label="Süre">
          {TARGET_MINUTES.map((t) => (
            <button key={t} type="button" className={chip(draft.targetMin === t)} onClick={() => changeTarget(t)}>
              {t} dk
            </button>
          ))}
        </div>
        <select value={draft.style} onChange={(e) => setD({ style: e.target.value as StoryStyle })} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs" aria-label="Stil" title={th.hint}>
          {STORY_STYLES.map((s) => (
            <option key={s} value={s}>
              {STYLE_THEME[s].label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {metaDirty || dirty || !p ? (
            <button type="button" onClick={() => void saveAll()} disabled={busy !== null} className={cn(btn, 'bg-white/10 hover:bg-white/15')}>
              {busy === 'meta' || busy === 'scenes' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {p ? 'Kaydet' : 'Projeyi oluştur'}
            </button>
          ) : (
            <span className="text-[11px] text-emerald-400">
              <Check className="mr-0.5 inline h-3 w-3" />
              kaydedildi
            </span>
          )}
          <button type="button" onClick={() => void plan()} disabled={busy !== null || !p} className={cn(btn, 'bg-violet-600 hover:bg-violet-500')}>
            {busy === 'plan' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} AI ile planla
          </button>
          {allowsAiImages(draft) && missing.length ? (
            <button type="button" onClick={() => void makeImages()} disabled={busy !== null || !ai?.images} className={cn(btn, 'bg-fuchsia-700 hover:bg-fuchsia-600')}>
              {busy === 'images' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {missing.length} çizim{usage ? ` (~${(missing.length * usage.price).toFixed(2)} $)` : ''}
            </button>
          ) : null}
          <button type="button" onClick={() => void render()} disabled={busy !== null || !p || !!problem} title={problem ?? undefined} className={cn(btn, 'bg-red-600 px-4 hover:bg-red-500')}>
            {busy === 'render' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
            {fresh ? 'Video güncel' : 'Videoyu üret'}
          </button>
        </div>
        {progress || problem ? (
          <div className="flex w-full items-center gap-3 text-[11px]">
            {progress ? (
              <>
                <div className="h-1.5 w-48 overflow-hidden rounded bg-white/10">
                  <div className={cn('h-full bg-red-500 transition-all', progress.pct === null && 'w-1/3 animate-pulse')} style={progress.pct !== null ? { width: `${progress.pct}%` } : undefined} />
                </div>
                <span className="text-zinc-300">{progress.text}</span>
              </>
            ) : null}
            {problem && !progress ? <span className="text-amber-400">⚠ {problem}</span> : null}
          </div>
        ) : null}
      </header>

      {/* ── main area ── */}
      <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[300px_minmax(0,1fr)_330px]">
        {/* LEFT: media bin / shot list / settings */}
        <aside className={cn(panel, 'flex min-h-[420px] flex-col overflow-hidden')}>
          <div className="flex border-b border-white/10 text-xs font-bold">
            {(
              [
                ['media', 'Medya', Images],
                ['shots', `Çekim listesi${shots.length ? ` (${shots.length})` : ''}`, ClipboardList],
                ['settings', 'Proje', Settings2],
              ] as const
            ).map(([k, l, Icon]) => (
              <button key={k} type="button" onClick={() => setLeft(k)} className={cn('flex flex-1 items-center justify-center gap-1 px-2 py-2.5', left === k ? 'border-b-2 border-red-500 text-white' : 'text-zinc-400 hover:text-zinc-100')}>
                <Icon className="h-3.5 w-3.5" />
                {l}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {left === 'media' ? (
              <div className="space-y-3">
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void uploadImages(e.target.files).finally(() => { if (fileRef.current) fileRef.current.value = '' })} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('Files')) {
                      e.preventDefault()
                      setDropHot(true)
                    }
                  }}
                  onDragLeave={() => setDropHot(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDropHot(false)
                    void uploadImages(e.dataTransfer.files)
                  }}
                  className={cn('flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed px-3 py-5 text-center text-xs transition', dropHot ? 'border-red-500 bg-red-500/10' : 'border-white/15 hover:border-white/30')}
                >
                  <Upload className="h-5 w-5 text-zinc-400" />
                  <span className="font-bold">Fotoğrafları sürükleyin veya seçin</span>
                  <span className="text-[10px] text-zinc-500">çoklu seçim · her biri ≤ 50 MB · AI her birini inceler</span>
                </button>
                {Object.entries(uploads).map(([n, v]) => (
                  <div key={n} className="text-[11px]">
                    <div className="flex justify-between">
                      <span className="truncate">{n}</span>
                      <span>%{v}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded bg-white/10">
                      <div className="h-full bg-red-500" style={{ width: `${v}%` }} />
                    </div>
                  </div>
                ))}
                {p ? (
                  <details className="rounded-xl border border-white/10 p-2 text-xs [&_*]:text-zinc-100">
                    <summary className="cursor-pointer font-bold">🎬 Kütüphaneden video ekle</summary>
                    <div className="mt-2 rounded-lg bg-white p-1 text-zinc-900 [&_*]:!text-zinc-900">
                      <ReelsVideoPicker value={null} onChange={(v) => void addVideo(v)} />
                    </div>
                  </details>
                ) : null}
                <p className="text-[10px] text-zinc-500">Bir görüntüyü zaman çizelgesindeki sahneye sürükleyip bırakın. Aynı görüntü birden çok sahnede kullanılabilir.</p>
                <div className="grid grid-cols-2 gap-2">
                  {(p?.assets ?? []).map((a) => (
                    <div
                      key={a.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', a.id)
                        setDrag({ kind: 'asset', id: a.id })
                      }}
                      onDragEnd={() => setDrag(null)}
                      className="group relative cursor-grab overflow-hidden rounded-lg border border-white/10 bg-black/40 active:cursor-grabbing"
                      title={a.description ?? a.name}
                    >
                      {a.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.previewUrl} alt="" className="h-20 w-full object-cover" draggable={false} />
                      ) : (
                        <div className="flex h-20 items-center justify-center text-[10px] text-zinc-500">{a.kind === 'video' ? 'Video' : 'Fotoğraf'}</div>
                      )}
                      <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] font-bold">{a.kind === 'video' ? `🎬 ${a.durationMs ? Math.round(a.durationMs / 1000) + ' sn' : ''}` : '🖼'}</span>
                      {useCount.get(a.id) ? <span className="absolute right-1 top-1 rounded bg-red-600 px-1 text-[9px] font-bold">×{useCount.get(a.id)}</span> : null}
                      <p className="line-clamp-2 px-1.5 py-1 text-[10px] leading-tight text-zinc-400">{a.description ?? (a.describeError ? `Okunamadı: ${a.describeError}` : 'AI inceliyor…')}</p>
                      <div className="absolute bottom-1 right-1 hidden gap-1 group-hover:flex">
                        <button type="button" onClick={() => void redescribe(a.id)} className="rounded bg-black/80 p-1" title="Yeniden incele">
                          <RefreshCw className="h-3 w-3" />
                        </button>
                        <button type="button" onClick={() => void removeAsset(a.id)} className="rounded bg-black/80 p-1 text-red-400" title="Çıkar">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {p && !p.assets.length ? <p className="text-center text-[11px] text-zinc-500">Henüz görüntü yok.</p> : null}
              </div>
            ) : left === 'shots' ? (
              <div className="space-y-3 text-xs">
                <div className="rounded-xl bg-black/30 p-3">
                  <p className="font-bold">
                    {draft.targetMin} dakikalık {vertical ? 'dikey' : 'yatay'} video için
                  </p>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-zinc-300">
                    <li>• ~{VISUAL_GUIDE[draft.targetMin].scenes} sahne, {VISUAL_GUIDE[draft.targetMin].visuals} farklı görüntü yeterli (tekrar kullanılabilir)</li>
                    <li>• {VISUAL_GUIDE[draft.targetMin].videos}</li>
                    <li>• {vertical ? 'Telefonu dik tutun; konu ekranın üst-orta kısmında olsun (alt üçte bir altyazıya ayrılır).' : 'Telefonu yatay tutun; konu ortada, alt kısımda altyazı için boşluk bırakın.'}</li>
                    <li>• Geniş açı (yer, bina) + yakın çekim (ayrıntı, belge, nesne) karışık olsun; aynı açıdan çok kare gerekmez.</li>
                    <li>• Gündüz, net, sabit çekim; videoda 5 sn sakin başlangıç bırakın. Yazı / tabela varsa okunur çekin.</li>
                    <li>• Kişi yüzleri için izin alın; çocuk ve mağdur yüzü kullanmayın.</li>
                    {draft.targetMin > 1 ? <li className="text-amber-300">• Bu uzunlukta AI çizimi yok (maliyet yok): görüntüsü olmayan sahne metin kartı olur.</li> : null}
                  </ul>
                  {scenes.length ? (
                    <div className="mt-2">
                      <div className="flex justify-between text-[10px] text-zinc-400">
                        <span>Kendi görüntüsü olan sahneler</span>
                        <span>%{Math.round(covered * 100)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded bg-white/10">
                        <div className="h-full bg-emerald-500" style={{ width: `${covered * 100}%` }} />
                      </div>
                    </div>
                  ) : null}
                </div>
                {!scenes.length ? <p className="text-zinc-500">Önce «AI ile planla»: AI her sahne için hangi fotoğraf / videoyu çekmeniz gerektiğini buraya yazar.</p> : null}
                {scenes.length && !shots.length ? <p className="text-emerald-400">Bütün sahnelerin görüntüsü var.</p> : null}
                <ol className="space-y-1.5">
                  {shots.map((s) => (
                    <li key={s.sceneId}>
                      <button
                        type="button"
                        onClick={() => setSel(s.sceneId)}
                        onDragOver={(e) => drag?.kind === 'asset' && e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (drag?.kind === 'asset') assignAsset(s.sceneId, drag.id)
                        }}
                        className={cn('w-full rounded-lg border px-2 py-1.5 text-left', sel === s.sceneId ? 'border-red-500 bg-red-500/10' : 'border-white/10 hover:border-white/25')}
                      >
                        <span className="font-mono text-[10px] text-zinc-500">
                          #{s.index + 1} · {fmt(timing[s.index]?.start ?? 0)}
                        </span>
                        <span className="block font-bold text-amber-200">📷 {s.need}</span>
                        <span className="line-clamp-1 text-[10px] text-zinc-400">«{s.text}»</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <label className="block">
                  <Label>Konu</Label>
                  <textarea value={draft.topic} onChange={(e) => setD({ topic: e.target.value })} rows={3} maxLength={1200} className={field} placeholder="ör. Truva Atı gerçek miydi? Troya kazıları ve efsane" />
                  <span className="text-[10px] text-zinc-500">AI bu konudan {draft.targetMin} dakikalık anlatımı yazar.</span>
                </label>
                <label className="block">
                  <Label>Anlatım metni (isteğe bağlı)</Label>
                  <textarea value={draft.script} onChange={(e) => setD({ script: e.target.value })} rows={draft.targetMin > 1 ? 8 : 5} maxLength={12000} className={field} />
                  <span className="text-[10px] text-zinc-500">Yazarsanız AI metni değiştirmez, yalnız sahnelere böler. {draft.targetMin} dk ≈ {(draft.targetMin * 60 * 13).toLocaleString('tr-TR')} karakter.</span>
                </label>
                <label className="block">
                  <Label>Seri etiketi</Label>
                  <input value={draft.seriesLabel} onChange={(e) => setD({ seriesLabel: e.target.value })} maxLength={32} className={field} />
                </label>
                <label className="block">
                  <Label>Paylaşım açıklaması</Label>
                  <textarea value={draft.caption} onChange={(e) => setD({ caption: e.target.value })} rows={3} maxLength={2000} className={field} placeholder="Boş bırakılırsa AI önerisi" />
                </label>
                <div className="rounded-xl bg-white p-2 text-zinc-900">
                  <RightsForm value={draft.rights} onChange={(rights) => setD({ rights })} />
                </div>
                {usage && allowsAiImages(draft) ? (
                  <p className="text-[10px] text-zinc-500">
                    AI çizim bütçesi {usage.month}: {usage.usd.toFixed(2)} $ / {usage.budget} $ · ~{usage.price} $/çizim
                  </p>
                ) : null}
                {ai && !ai.text ? <p className="rounded bg-amber-500/15 p-2 text-[11px] text-amber-200">AI editör kapalı; metin cümlelere bölünür.</p> : null}
                <button type="button" onClick={() => void saveMeta()} disabled={busy !== null} className={cn(btn, 'w-full justify-center bg-red-600 py-2 hover:bg-red-500')}>
                  {busy === 'meta' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {p ? 'Ayarları kaydet' : 'Projeyi oluştur'}
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* CENTER: frame preview, rendered video, share */}
        <section className={cn(panel, 'flex min-w-0 flex-col items-center gap-3 p-4')}>
          <div className="flex w-full items-center justify-between text-[11px] text-zinc-400">
            <span>
              Önizleme · {F.w}×{F.h} {cur ? `· sahne ${selIdx + 1} / ${scenes.length}` : ''}
            </span>
            <span className={cn('font-mono', total > maxSec ? 'text-red-400' : 'text-zinc-300')}>
              ~{fmt(total)} / hedef {draft.targetMin}:00 (en fazla {fmt(maxSec)})
            </span>
          </div>
          <FramePreview scene={cur} asset={cur ? assetOf(cur.visual) : undefined} thumb={cur ? thumbOf(cur.visual) : null} format={draft.format} style={draft.style} series={draft.seriesLabel} title={draft.title} />
          {cur ? (
            <div className="flex items-center gap-2">
              <button type="button" disabled={selIdx <= 0} onClick={() => setSel(scenes[selIdx - 1].id)} className={cn(btn, 'bg-white/10')}>
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[11px] text-zinc-400">
                {fmt(timing[selIdx]?.start ?? 0)} – {fmt((timing[selIdx]?.start ?? 0) + (timing[selIdx]?.len ?? 0))}
              </span>
              <button type="button" disabled={selIdx >= scenes.length - 1} onClick={() => setSel(scenes[selIdx + 1].id)} className={cn(btn, 'bg-white/10')}>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {p?.render.status === 'failed' && p.render.error ? <p className="text-xs text-red-400">Son üretim başarısız: {p.render.error}</p> : null}
          {p?.render.outputUrl ? (
            <div className="w-full rounded-xl border border-white/10 bg-black/40 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <Film className="h-4 w-4 text-red-500" />
                <b>Üretilen video</b>
                <span className="text-zinc-400">
                  {p.render.seconds ? fmt(p.render.seconds) : ''} {fresh ? '· güncel' : '· eski sürüm (değişiklik var)'}
                </span>
                <a href={p.render.outputUrl} target="_blank" rel="noreferrer" className="ml-auto font-bold text-sky-400 underline">
                  MP4 indir
                </a>
              </div>
              <video key={p.render.outputUrl} src={p.render.outputUrl} poster={p.render.coverUrl ?? undefined} controls playsInline className={cn('mx-auto rounded-lg bg-black', (p.format ?? 'vertical') === 'vertical' ? 'aspect-[9/16] max-h-[520px]' : 'aspect-video w-full max-w-[720px]')} />
            </div>
          ) : null}

          {p && fresh ? (
            <div className="w-full rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Send className="h-4 w-4 text-sky-400" />
                <b>Paylaş</b>
                {(['reel', 'video_story'] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setShareFmt(f)} className={chip(shareFmt === f)}>
                    {f === 'reel' ? (vertical && (p.render.seconds ?? 0) <= 180 ? 'Reels / Shorts' : 'Video (YouTube)') : 'Video hikâye'}
                  </button>
                ))}
              </div>
              {!vertical || (p.render.seconds ?? 0) > 180 ? <p className="mb-2 text-[11px] text-zinc-400">Bu video YouTube’a normal (uzun) video olarak yüklenir; Instagram / Facebook / Threads dikey ve kısa video ister.</p> : null}
              {caption ? <p className="mb-2 max-h-24 overflow-y-auto whitespace-pre-line rounded-lg bg-white/5 p-2 text-[11px] text-zinc-300">{caption}</p> : null}
              {accounts === null ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <ul className="grid gap-1 sm:grid-cols-2">
                {(accounts ?? []).map((a) => (
                  <li key={a.accountId}>
                    <label className={cn('flex items-center gap-2 rounded-lg border border-white/10 px-2 py-1.5', !a.selectable && 'opacity-40')}>
                      <input
                        type="checkbox"
                        disabled={!a.selectable}
                        checked={picked.has(a.accountId)}
                        onChange={(e) =>
                          setPicked((s) => {
                            const n = new Set(s)
                            if (e.target.checked) n.add(a.accountId)
                            else n.delete(a.accountId)
                            return n
                          })
                        }
                      />
                      <span className="font-bold">{a.displayName}</span>
                      <span className="text-zinc-500">{a.platform}</span>
                      {a.reason ? <span className="ml-auto text-[10px] text-amber-300">{a.reason}</span> : null}
                    </label>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => void share()} disabled={!picked.size || rows.some((r) => r.state === 'sending')} className={cn(btn, 'mt-2 bg-sky-600 hover:bg-sky-500')}>
                <Send className="h-3.5 w-3.5" /> Seçili hesaplarda yayımla
              </button>
              <ul className="mt-2 space-y-1">
                {rows.map((r) => (
                  <li key={r.accountId} className={r.state === 'ok' ? 'text-emerald-400' : r.state === 'failed' ? 'text-red-400' : r.state === 'uncertain' ? 'text-amber-300' : ''}>
                    {r.state === 'sending' ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}
                    {r.label}: {r.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {/* RIGHT: scene inspector */}
        <aside className={cn(panel, 'space-y-3 self-start p-3 text-xs')}>
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4 text-red-500" />
            <b className="text-sm">Sahne {cur ? selIdx + 1 : ''}</b>
            {cur ? (
              <div className="ml-auto flex gap-1">
                <button type="button" onClick={() => nudge(cur.id, -1)} disabled={selIdx === 0} className="rounded bg-white/10 p-1 disabled:opacity-30" title="Öne al">
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => nudge(cur.id, 1)} disabled={selIdx === scenes.length - 1} className="rounded bg-white/10 p-1 disabled:opacity-30" title="Arkaya al">
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => deleteScene(cur.id)} className="rounded bg-white/10 p-1 text-red-400" title="Sahneyi sil">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </div>
          {!cur ? <p className="text-zinc-500">{scenes.length ? 'Zaman çizelgesinden bir sahne seçin.' : p ? '«AI ile planla» ile sahneleri oluşturun.' : 'Önce «Proje» sekmesinde konuyu yazıp projeyi oluşturun.'}</p> : null}
          {cur ? (
            <>
              <label className="block">
                <Label>Anlatım (seslendirilir ve altyazı olur)</Label>
                <textarea value={cur.text} onChange={(e) => patchScene(cur.id, (x) => ({ ...x, text: e.target.value }))} rows={4} maxLength={260} className={field} />
                <span className="text-[10px] text-zinc-500">
                  ≈ {sceneLen(cur).toFixed(1)} sn · {[...cur.text].length} karakter
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <Label>Vurgu</Label>
                  <input value={cur.highlights.join(', ')} onChange={(e) => patchScene(cur.id, (x) => ({ ...x, highlights: e.target.value.split(',').map((w) => w.trim()).filter(Boolean) }))} className={field} placeholder="kelime, kelime" />
                </label>
                <label className="block">
                  <Label>Etiket</Label>
                  <input value={cur.label ?? ''} onChange={(e) => patchScene(cur.id, (x) => ({ ...x, label: e.target.value || null }))} maxLength={28} className={field} placeholder="ör. 1871" />
                </label>
              </div>
              <label className="block">
                <Label>Görüntü</Label>
                <select value={cur.visual.kind === 'asset' ? cur.visual.assetId : cur.visual.kind} onChange={(e) => setVisualKind(cur, e.target.value)} className={field}>
                  <option value="card">▦ Metin kartı (ücretsiz)</option>
                  {allowsAiImages(draft) || cur.visual.kind === 'ai' ? <option value="ai">✨ AI çizimi{allowsAiImages(draft) ? '' : ' (uzun videoda kullanılamaz)'}</option> : null}
                  {(p?.assets ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.kind === 'video' ? '🎬' : '🖼'} {a.name}
                    </option>
                  ))}
                </select>
              </label>
              {cur.visual.kind === 'asset' && assetOf(cur.visual)?.description ? <p className="rounded bg-white/5 p-2 text-[11px] text-zinc-400">AI: {assetOf(cur.visual)?.description}</p> : null}
              {cur.visual.kind === 'asset' && assetOf(cur.visual)?.kind === 'video' ? (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1">
                    Başlangıç
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={(cur.visual.offsetMs / 1000).toString()}
                      onChange={(e) => patchScene(cur.id, (x) => (x.visual.kind === 'asset' ? { ...x, visual: { ...x.visual, offsetMs: Math.max(0, Math.round(Number(e.target.value) * 1000) || 0) } } : x))}
                      className="w-16 rounded border border-white/10 bg-black/30 px-1 py-0.5"
                    />
                    sn
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={cur.keepAudio} onChange={(e) => patchScene(cur.id, (x) => ({ ...x, keepAudio: e.target.checked }))} /> Ortam sesi (kısık)
                  </label>
                </div>
              ) : null}
              {cur.visual.kind === 'ai' ? (
                <div className="space-y-1">
                  <textarea value={cur.visual.prompt} onChange={(e) => patchScene(cur.id, (x) => (x.visual.kind === 'ai' ? { ...x, visual: { ...x.visual, prompt: e.target.value } } : x))} rows={3} maxLength={600} className={cn(field, 'text-xs')} placeholder="Çizim tarifi (İngilizce daha iyi sonuç verir)" />
                  {cur.visual.error ? <p className="text-[11px] text-red-400">{cur.visual.error}</p> : null}
                  {allowsAiImages(draft) ? (
                    <button type="button" onClick={() => void makeImages(cur.id)} disabled={busy !== null || !ai?.images} className="text-[11px] font-bold text-fuchsia-300 disabled:opacity-40">
                      <Sparkles className="mr-1 inline h-3 w-3" />
                      {cur.visual.imagePath ? 'Bu çizimi yenile' : 'Bu çizimi üret'}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <label className="block">
                <Label>Çekim notu (eklenecek görüntü)</Label>
                <input value={cur.need ?? ''} onChange={(e) => patchScene(cur.id, (x) => ({ ...x, need: e.target.value || null }))} maxLength={200} className={field} placeholder="ör. Kazı alanının geniş açı fotoğrafı" />
              </label>
              {cur.reason ? <p className="text-[10px] text-zinc-500">AI gerekçesi: {cur.reason}</p> : null}
            </>
          ) : null}
          {p ? (
            <button type="button" onClick={addScene} disabled={scenes.length >= MAX_SCENES} className={cn(btn, 'w-full justify-center border border-dashed border-white/20 hover:border-white/40')}>
              <Plus className="h-3.5 w-3.5" /> Sahne ekle {cur ? '(bundan sonra)' : ''}
            </button>
          ) : null}
        </aside>
      </div>

      {/* ── timeline ── */}
      <section className={cn(panel, 'p-3')}>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
          <b className="text-xs text-zinc-100">Zaman çizelgesi</b>
          <span>{scenes.length} sahne</span>
          <span className={cn('font-mono', total > maxSec && 'text-red-400')}>~{fmt(total)}</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" /> kendi görüntü
            <span className="ml-2 h-2 w-2 rounded-sm bg-amber-500" /> metin kartı
            {allowsAiImages(draft) ? (
              <>
                <span className="ml-2 h-2 w-2 rounded-sm bg-fuchsia-500" /> AI çizimi
              </>
            ) : null}
          </span>
          <span className="ml-auto flex items-center gap-1">
            Yakınlık
            <input type="range" min={0.5} max={3} step={0.25} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-24" />
          </span>
          {dirty ? (
            <button type="button" onClick={() => void saveScenes()} disabled={busy !== null} className={cn(btn, 'bg-white/10')}>
              <Save className="h-3.5 w-3.5" /> Sahneleri kaydet
            </button>
          ) : null}
        </div>
        {!scenes.length ? (
          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-zinc-500">
            <ImagePlus className="mr-2 h-4 w-4" /> Görüntüleri ekleyin, sonra «AI ile planla» — sahneler burada dizilir.
          </div>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="relative" style={{ width: Math.max(600, total * pxPerSec + 40) }}>
              {/* ruler */}
              <div className="relative mb-1 h-4 border-b border-white/10">
                {Array.from({ length: Math.ceil(total / (draft.targetMin === 1 ? 5 : draft.targetMin === 3 ? 15 : 30)) + 1 }, (_, k) => {
                  const step = draft.targetMin === 1 ? 5 : draft.targetMin === 3 ? 15 : 30
                  return (
                    <span key={k} className="absolute top-0 font-mono text-[9px] text-zinc-500" style={{ left: k * step * pxPerSec }}>
                      {fmt(k * step)}
                    </span>
                  )
                })}
              </div>
              <div className="flex gap-0.5">
                {scenes.map((s, i) => {
                  const w = Math.max(34, timing[i].len * pxPerSec - 2)
                  const thumb = thumbOf(s.visual)
                  const color = s.visual.kind === 'asset' ? 'border-emerald-500/70' : s.visual.kind === 'card' ? 'border-amber-500/70' : 'border-fuchsia-500/70'
                  return (
                    <button
                      key={s.id}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', s.id)
                        setDrag({ kind: 'scene', id: s.id })
                      }}
                      onDragEnd={() => setDrag(null)}
                      onDragOver={(e) => drag && e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (drag?.kind === 'asset') {
                          assignAsset(s.id, drag.id)
                          setSel(s.id)
                        } else if (drag?.kind === 'scene') moveScene(drag.id, s.id)
                        setDrag(null)
                      }}
                      onClick={() => setSel(s.id)}
                      className={cn('relative h-20 shrink-0 overflow-hidden rounded-md border-2 bg-black/50 text-left', color, sel === s.id && 'ring-2 ring-white')}
                      style={{ width: w }}
                      title={s.text}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" draggable={false} />
                      ) : s.visual.kind === 'card' ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 px-1 text-center text-[9px] font-black uppercase text-amber-300">{(s.label || s.highlights[0] || '').slice(0, 14)}</span>
                      ) : null}
                      <span className="absolute left-0.5 top-0.5 rounded bg-black/75 px-1 font-mono text-[9px] font-bold">{i + 1}</span>
                      {s.visual.kind !== 'asset' && s.need ? <span className="absolute right-0.5 top-0.5 rounded bg-amber-500 px-0.5 text-[9px] text-black" title={s.need}>📷</span> : null}
                      {w > 70 ? <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-black/70 px-1 py-0.5 text-[9px] leading-tight">{s.text}</span> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * The selected scene in the real frame: picture placement (cover / blurred fill like the
 * renderer), the safe area, series pill, label, caption band and the watermark's size.
 */
function FramePreview(props: { scene: StoryScene | null; asset: StoryAsset | undefined; thumb: string | null; format: StoryFormat; style: StoryStyle; series: string; title: string }) {
  const F = FRAMES[props.format]
  const vertical = props.format === 'vertical'
  const th = STYLE_THEME[props.style]
  const W = vertical ? 300 : 560
  const k = W / F.w
  const H = F.h * k
  const s = props.scene
  const pct = (v: number, of: number) => `${(v / of) * 100}%`
  return (
    <div className="relative overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/10" style={{ width: W, height: H }}>
      {props.thumb ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={props.thumb} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-lg" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={props.thumb} alt="" className={cn('absolute inset-0 h-full w-full', props.asset?.kind === 'video' ? 'object-contain' : 'object-cover')} />
        </>
      ) : s?.visual.kind === 'card' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#3a2a1c] to-[#0e0b08]" style={{ paddingBottom: vertical ? '20%' : '12%' }}>
          <span className="px-4 text-center font-black uppercase" style={{ color: th.highlight, fontSize: (vertical ? 132 : 150) * k }}>
            {(s.label || s.highlights[0] || s.text.split(/\s+/).slice(0, 2).join(' ')).slice(0, 40)}
          </span>
          <span className="mt-1 h-1 w-10 rounded" style={{ background: th.labelBg }} />
          <span className="mt-1 text-white/70" style={{ fontSize: 40 * k }}>
            {props.title.slice(0, 70)}
          </span>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-zinc-600">{s ? (s.visual.kind === 'ai' ? 'çizim henüz yok' : '') : 'sahne seçilmedi'}</div>
      )}
      {/* safe area */}
      <div className="pointer-events-none absolute border border-dashed border-white/25" style={{ left: pct(F.safe.left, F.w), right: pct(F.w - F.safe.right, F.w), top: pct(F.safe.top, F.h), bottom: pct(F.h - F.safe.bottom, F.h) }} />
      {/* series pill */}
      <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded font-black uppercase" style={{ top: F.pillY * k, background: th.pill, color: th.pillText, fontSize: 30 * k, padding: `${8 * k}px ${24 * k}px` }}>
        {props.series.slice(0, 32)}
      </span>
      {/* label */}
      {s?.label ? (
        <span className="absolute -rotate-[4deg] rounded font-black" style={{ left: (F.safe.left + 30) * k, top: (F.labelY - 42) * k, background: th.labelBg, color: th.labelText, fontSize: F.labelSize * k, padding: `${14 * k}px ${28 * k}px` }}>
          {s.label}
        </span>
      ) : null}
      {/* watermark size reference (it drifts slowly over the whole frame) */}
      <span className="absolute rounded bg-white/15" style={{ width: 150 * k, height: 156 * k, right: 60 * k, top: (F.h / 2) * k - 78 * k }} title="Filigran (video boyunca yavaşça gezer)" />
      {/* caption */}
      {s ? (
        <span className="absolute -translate-x-1/2 -translate-y-1/2 rounded-lg text-center font-black leading-tight" style={{ left: `${((F.safe.left + F.safe.right) / 2 / F.w) * 100}%`, top: F.captionY * k, maxWidth: (F.safe.right - F.safe.left - 70) * k, background: th.box, color: th.text, fontSize: F.capSize * k, padding: `${18 * k}px ${32 * k}px` }}>
          {s.text.split(/\s+/).slice(0, Math.round(F.capChars / 5.5)).map((w, i) => (
            <span key={i} style={{ color: s.highlights.some((h) => h.toLocaleLowerCase('tr-TR') === w.replace(/[.,!?;:«»"]/g, '').toLocaleLowerCase('tr-TR')) ? th.highlight : undefined }}>
              {w}{' '}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  )
}

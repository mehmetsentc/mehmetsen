'use client'

/**
 * STORY-1 — Reels Studio «Konu → Video».
 *   1. Konu: topic or ready script, style, series label, rights
 *   2. Görüntüler: the editor's photos (uploaded) and Video Kütüphanesi videos;
 *      the AI reads what each shows
 *   3. Sahneler: AI plan → timeline (sentence, highlights, label, which visual);
 *      every choice can be changed by hand
 *   4. Üretim: missing AI illustrations (paid, budget-capped) → video
 *   5. Paylaş: to connected accounts through the shared publish ledger
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ImagePlus, Loader2, Plus, RefreshCw, Save, Send, Sparkles, Trash2, Wand2 } from 'lucide-react'
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
  estimateSeconds,
  MAX_SCENES,
  missingImages,
  renderKeyFor,
  renderProblem,
  STORY_STYLES,
  STYLE_THEME,
  type SceneVisual,
  type StoryProject,
  type StoryScene,
  type StoryStyle,
} from '@/lib/story/storyProject'

const API = '/api/admin/social/story-projects'
type Usage = { month: string; usd: number; images: number; budget: number; price: number } | null
type ShareAccount = { accountId: string; platform: MediaSharePlatform; displayName: string; username: string | null; selectable: boolean; reason: string | null }
type ShareRow = { accountId: string; label: string; state: 'sending' | 'ok' | 'failed' | 'uncertain'; text: string }

const input_ = 'w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5 text-sm'
const card = 'rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4'
const btn = 'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold disabled:opacity-50'
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('')
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1 text-xs">
      <span className="font-semibold text-[rgb(var(--color-text))]">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-[rgb(var(--color-muted))]">{hint}</span> : null}
    </label>
  )
}

function Step({ n, title, children, right }: { n: number; title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className={card}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-black text-white">{n}</span>
        <h3 className="text-sm font-extrabold">{title}</h3>
        <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>
      </div>
      {children}
    </section>
  )
}

const emptyRights: MediaRights = { kind: 'owned', sourceName: null, note: null }

export function StoryVideoStudio() {
  const [list, setList] = useState<StoryProject[] | null>(null)
  const [ai, setAi] = useState<{ text: boolean; images: boolean } | null>(null)
  const [usage, setUsage] = useState<Usage>(null)
  const [p, setP] = useState<StoryProject | null>(null)
  const [draft, setDraft] = useState<{ title: string; topic: string; script: string; caption: string; style: StoryStyle; seriesLabel: string; rights: MediaRights }>({ title: '', topic: '', script: '', caption: '', style: 'paper', seriesLabel: 'NaHaber', rights: emptyRights })
  const [scenes, setScenes] = useState<StoryScene[]>([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [uploads, setUploads] = useState<Record<string, number>>({})
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
    setDraft(proj ? { title: proj.title, topic: proj.topic, script: proj.script, caption: proj.caption, style: proj.style, seriesLabel: proj.seriesLabel, rights: proj.rights } : { title: '', topic: '', script: '', caption: '', style: 'paper', seriesLabel: 'NaHaber', rights: emptyRights })
    setScenes(proj?.scenes ?? [])
    setDirty(false)
  }, [])

  const apply = useCallback((proj: StoryProject | null | undefined, keepScenes = false) => {
    if (!proj) return
    setP(proj)
    if (!keepScenes) {
      setScenes(proj.scenes)
      setDirty(false)
    }
    setList((l) => (l ? [proj, ...l.filter((x) => x.id !== proj.id)] : [proj]))
  }, [])

  const reload = useCallback(async (id: string, keepScenes = false) => {
    const r = await reelsCall<{ project: StoryProject }>('GET', `${API}/${id}`)
    if (r.ok) apply(r.data.project, keepScenes)
  }, [apply])

  // ── 1. meta ────────────────────────────────────────────────────────────────
  const saveMeta = async () => {
    setBusy('meta')
    const r = p ? await reelsCall<{ project: StoryProject }>('POST', `${API}/${p.id}`, draft) : await reelsCall<{ project: StoryProject }>('POST', API, draft)
    setBusy(null)
    if (!r.ok) return toast.error(r.error)
    apply(r.data.project, dirty)
    setDraft((d) => ({ ...d, title: r.data.project.title, seriesLabel: r.data.project.seriesLabel }))
    toast.success(p ? 'Kaydedildi' : 'Proje oluşturuldu — şimdi görüntü ekleyin veya sahneleri planlayın')
  }

  // ── 2. assets ──────────────────────────────────────────────────────────────
  const watchDescribe = async (id: string, job: { jobId: string } | null | undefined) => {
    if (!job?.jobId) return
    const sep = '?'
    for (let i = 0; i < 40; i++) {
      await new Promise((res) => setTimeout(res, i < 5 ? 3000 : 8000))
      const r = await reelsCall<{ job: { status: string } }>('GET', `${API}/${id}/assets${sep}job=${encodeURIComponent(job.jobId)}`)
      if (!r.ok || r.data.job.status !== 'running') break
    }
    await reload(id, true)
  }

  const uploadImages = async (files: FileList | null) => {
    if (!p || !files?.length) return
    const uid = auth.currentUser?.uid
    if (!uid) return toast.error('Oturum bulunamadı; sayfayı yenileyin')
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name}: yalnız fotoğraf (video için Video Kütüphanesi'ni kullanın)`)
        continue
      }
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`${file.name}: 50 MB sınırını aşıyor`)
        continue
      }
      const name = `${Date.now()}_${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`.slice(0, 120)
      const path = `news-images/${uid}/story/${p.id}/${name}`
      try {
        const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type })
        await new Promise<void>((resolve, reject) =>
          task.on('state_changed', (s) => setUploads((u) => ({ ...u, [file.name]: Math.round((s.bytesTransferred / s.totalBytes) * 100) })), reject, () => resolve()),
        )
        const previewUrl = await getDownloadURL(task.snapshot.ref)
        const r = await reelsCall<{ project: StoryProject; job: { jobId: string } }>('POST', `${API}/${p.id}/assets`, { action: 'add', kind: 'image', storagePath: path, previewUrl, name: file.name })
        if (!r.ok) toast.error(`${file.name}: ${r.error}`)
        else {
          apply(r.data.project, true)
          void watchDescribe(p.id, r.data.job)
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

  const addVideo = async (v: { id: string; title: string } | null) => {
    if (!p || !v) return
    const r = await reelsCall<{ project: StoryProject; job: { jobId: string } }>('POST', `${API}/${p.id}/assets`, { action: 'add', kind: 'video', videoItemId: v.id })
    if (!r.ok) return toast.error(r.error)
    apply(r.data.project, true)
    toast.success('Video eklendi; AI izliyor…')
    void watchDescribe(p.id, r.data.job)
  }

  const removeAsset = async (assetId: string) => {
    if (!p || !confirm('Bu görüntü projeden çıkarılsın mı? Kullanan sahneler AI çizimine döner.')) return
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

  // ── 3. scenes ──────────────────────────────────────────────────────────────
  const plan = async () => {
    if (!p) return
    if (dirty || scenes.length) {
      if (!confirm('AI sahneleri yeniden planlayacak; mevcut sahne listesi değişir. Devam edilsin mi?')) return
    }
    setBusy('plan')
    setProgress('AI editör sahneleri hazırlıyor…')
    const r = await runReelJob(`${API}/${p.id}/plan`, {}, (ms) => setProgress(`AI editör çalışıyor… ${Math.round(ms / 1000)} sn`))
    setBusy(null)
    setProgress(null)
    if (!r.ok) return toast.error(r.error)
    const res = r.job.result as { project?: StoryProject; note?: string | null; source?: string }
    apply(res.project ?? null)
    if (res.note) toast(res.note, { icon: 'ℹ️' })
    else toast.success('Sahneler hazır — kontrol edin, istediğinizi değiştirin')
  }

  const patchScene = (id: string, fn: (s: StoryScene) => StoryScene) => {
    setScenes((xs) => xs.map((s) => (s.id === id ? fn(s) : s)))
    setDirty(true)
  }
  const move = (i: number, d: -1 | 1) => {
    setScenes((xs) => {
      const j = i + d
      if (j < 0 || j >= xs.length) return xs
      const n = [...xs]
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
    setDirty(true)
  }
  const setVisual = (s: StoryScene, value: string) => {
    if (value === 'ai') {
      patchScene(s.id, (x) => ({ ...x, keepAudio: false, visual: x.visual.kind === 'ai' ? x.visual : { kind: 'ai', prompt: x.text, imagePath: null, imageUrl: null, imageKey: null, error: null } }))
    } else {
      patchScene(s.id, (x) => ({ ...x, visual: { kind: 'asset', assetId: value, offsetMs: 0 } }))
    }
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

  // ── 4. production ──────────────────────────────────────────────────────────
  const live: StoryProject | null = p ? { ...p, scenes } : null
  const missing = live ? missingImages(live) : []
  const problem = live ? renderProblem(live) : null
  const fresh = !!(p && p.render.status === 'ready' && p.render.key === renderKeyFor({ ...p, scenes }) && !dirty)

  const makeImages = async (sceneId?: string) => {
    if (!p) return
    if (dirty && !(await saveScenes())) return
    const n = sceneId ? 1 : missing.length
    if (usage && !confirm(`${n} çizim üretilecek (tahmini ${(n * usage.price).toFixed(2)} $; bu ay ${usage.usd.toFixed(2)} / ${usage.budget} $). Devam?`)) return
    setBusy('images')
    setProgress('Çizimler üretiliyor…')
    const r = await runReelJob(`${API}/${p.id}/images`, sceneId ? { sceneId } : {}, (ms) => setProgress(`Çizimler üretiliyor… ${Math.round(ms / 1000)} sn`))
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

  const render = async () => {
    if (!p) return
    if (dirty && !(await saveScenes())) return
    setBusy('render')
    setProgress('Video hazırlanıyor (seslendirme, sahneler, altyazı)…')
    const r = await runReelJob(`${API}/${p.id}/render`, {}, (ms) => setProgress(`Video hazırlanıyor… ${Math.round(ms / 1000)} sn (genelde 2–5 dk)`))
    setBusy(null)
    setProgress(null)
    if (!r.ok) {
      await reload(p.id)
      return toast.error(r.error)
    }
    const res = r.job.result as { project?: StoryProject; stored?: boolean } | null
    if (res?.project) apply(res.project)
    else await reload(p.id)
    toast.success(res?.stored === false ? 'Video üretildi ama bu sırada proje değişti; yeniden üretin' : 'Video hazır')
  }

  // ── 5. share ───────────────────────────────────────────────────────────────
  const [format, setFormat] = useState<MediaShareFormat>('reel')
  const [accounts, setAccounts] = useState<ShareAccount[] | null>(null)
  const [caption, setCaption] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [rows, setRows] = useState<ShareRow[]>([])
  useEffect(() => {
    if (!p || !fresh) {
      setAccounts(null)
      return
    }
    void reelsCall<{ accounts: ShareAccount[]; caption: string }>('GET', `${API}/${p.id}/share?format=${format}`).then((r) => {
      if (r.ok) {
        setAccounts(r.data.accounts)
        setCaption(r.data.caption)
      } else setAccounts([])
    })
  }, [p, fresh, format])

  const share = async () => {
    if (!p || !accounts) return
    const targets = accounts.filter((a) => picked.has(a.accountId) && a.selectable)
    if (!targets.length) return toast.error('Hesap seçin')
    if (!confirm(`${targets.length} hesapta ${format === 'reel' ? 'Reels' : 'video hikâye'} olarak yayımlanacak. Onaylıyor musunuz?`)) return
    setRows(targets.map((a) => ({ accountId: a.accountId, label: `${a.displayName} (${a.platform})`, state: 'sending', text: 'Gönderiliyor…' })))
    for (const a of targets) {
      const r = await runReelJob(`${API}/${p.id}/share`, { accountId: a.accountId, format })
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

  // ── view ───────────────────────────────────────────────────────────────────
  const timing = useMemo(() => {
    let t = 0
    return scenes.map((s) => {
      const len = Math.max(1.6, [...s.text].length / 14.5 + 0.4)
      const start = t
      t += len
      return { start, end: t }
    })
  }, [scenes])
  const total = estimateSeconds(scenes)
  const thumbOf = (v: SceneVisual): string | null => (v.kind === 'ai' ? v.imageUrl : p?.assets.find((a) => a.id === v.assetId)?.previewUrl ?? null)

  return (
    <div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className={cn(card, 'space-y-2 self-start')}>
        <button type="button" onClick={() => open(null)} className={cn(btn, 'w-full justify-center bg-red-600 text-white')}>
          <Plus className="h-4 w-4" /> Yeni video
        </button>
        {ai && !ai.text ? <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">AI editör kapalı (Gemini anahtarı / STORY_AI). Metin cümlelere bölünür.</p> : null}
        {usage ? (
          <p className="text-[11px] text-[rgb(var(--color-muted))]">
            AI çizim bütçesi {usage.month}: <b>{usage.usd.toFixed(2)} $</b> / {usage.budget} $ · {usage.images} çizim · ~{usage.price} $/çizim
          </p>
        ) : null}
        {list === null ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        <ul className="space-y-1">
          {(list ?? []).map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => open(x)} className={cn('w-full rounded-lg px-2 py-1.5 text-left text-xs', p?.id === x.id ? 'bg-red-50 font-bold text-red-700 dark:bg-red-950/40 dark:text-red-200' : 'hover:bg-[rgb(var(--color-surface))]')}>
                <span className="line-clamp-2">{x.title}</span>
                <span className="text-[10px] text-[rgb(var(--color-muted))]">
                  {x.scenes.length} sahne · {x.assets.length} görüntü {x.render.status === 'ready' ? '· video hazır' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 space-y-3">
        <Step n={1} title="Konu ve stil" right={<button type="button" onClick={() => void saveMeta()} disabled={busy !== null} className={cn(btn, 'bg-[rgb(var(--color-text))] text-[rgb(var(--color-card))]')}>{busy === 'meta' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{p ? 'Kaydet' : 'Projeyi oluştur'}</button>}>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-3">
              <Field label="Konu" hint="AI bu konudan anlatımı yazar. Kendi metniniz varsa aşağıya yazın.">
                <textarea value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} rows={3} maxLength={600} className={input_} placeholder="ör. Truva Atı gerçek miydi? Troya kazıları ve efsane" />
              </Field>
              <Field label="Anlatım metni (isteğe bağlı)" hint="Yazarsanız AI metni değiştirmez, yalnız sahnelere böler.">
                <textarea value={draft.script} onChange={(e) => setDraft({ ...draft, script: e.target.value })} rows={5} maxLength={2000} className={input_} />
              </Field>
              <Field label="Başlık">
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120} className={input_} />
              </Field>
            </div>
            <div className="space-y-3">
              <Field label="Görsel stil" hint={STYLE_THEME[draft.style].hint}>
                <select value={draft.style} onChange={(e) => setDraft({ ...draft, style: e.target.value as StoryStyle })} className={input_}>
                  {STORY_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {STYLE_THEME[s].label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Seri etiketi" hint="Videonun üstünde görünür, ör. «NaHaber · Tarih Defteri»">
                <input value={draft.seriesLabel} onChange={(e) => setDraft({ ...draft, seriesLabel: e.target.value })} maxLength={32} className={input_} />
              </Field>
              <Field label="Paylaşım açıklaması" hint="Boş bırakılırsa AI önerisi kullanılır">
                <textarea value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} rows={2} maxLength={2000} className={input_} />
              </Field>
              <RightsForm value={draft.rights} onChange={(rights) => setDraft({ ...draft, rights })} />
            </div>
          </div>
        </Step>

        {p ? (
          <Step
            n={2}
            title="Görüntüler (isteğe bağlı)"
            right={
              <>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void uploadImages(e.target.files).finally(() => { if (fileRef.current) fileRef.current.value = '' })} />
                <button type="button" onClick={() => fileRef.current?.click()} className={cn(btn, 'border border-[rgb(var(--color-border))]')}>
                  <ImagePlus className="h-4 w-4" /> Fotoğraf yükle
                </button>
              </>
            }
          >
            <p className="mb-2 text-[11px] text-[rgb(var(--color-muted))]">Fotoğraflar (≤ 50 MB) ve Video Kütüphanesi videoları. AI her birini izleyip uygun cümleye yerleştirir; uygun görüntü olmayan cümleye çizim üretilir.</p>
            {Object.entries(uploads).map(([n, v]) => (
              <p key={n} className="text-xs">
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> {n}: %{v}
              </p>
            ))}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {p.assets.map((a) => (
                <div key={a.id} className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))]">
                  {a.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.previewUrl} alt="" className="h-28 w-full object-cover" />
                  ) : (
                    <div className="flex h-28 items-center justify-center bg-[rgb(var(--color-surface))] text-xs">{a.kind === 'video' ? 'Video' : 'Fotoğraf'}</div>
                  )}
                  <div className="space-y-1 p-2 text-[11px]">
                    <p className="truncate font-bold">
                      {a.kind === 'video' ? '🎬 ' : '🖼 '}
                      {a.name}
                    </p>
                    <p className="line-clamp-3 text-[rgb(var(--color-muted))]">{a.description ?? (a.describeError ? `Okunamadı: ${a.describeError}` : 'AI inceliyor…')}</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void redescribe(a.id)} className="text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]" title="Yeniden incele">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => void removeAsset(a.id)} className="text-red-600" title="Çıkar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-bold">Video Kütüphanesi'nden video ekle</summary>
              <div className="mt-2">
                <ReelsVideoPicker value={null} onChange={(v) => void addVideo(v)} />
              </div>
            </details>
          </Step>
        ) : null}

        {p ? (
          <Step
            n={3}
            title={`Sahneler ve zaman çizelgesi${scenes.length ? ` · ~${fmt(total)}` : ''}`}
            right={
              <>
                <button type="button" onClick={() => void plan()} disabled={busy !== null} className={cn(btn, 'bg-violet-600 text-white')}>
                  {busy === 'plan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} AI ile planla
                </button>
                {dirty ? (
                  <button type="button" onClick={() => void saveScenes()} disabled={busy !== null} className={cn(btn, 'bg-[rgb(var(--color-text))] text-[rgb(var(--color-card))]')}>
                    <Save className="h-4 w-4" /> Sahneleri kaydet
                  </button>
                ) : null}
              </>
            }
          >
            {!scenes.length ? <p className="text-xs text-[rgb(var(--color-muted))]">Önce görüntüleri ekleyin (isteğe bağlı), sonra «AI ile planla».</p> : null}
            <ol className="space-y-2">
              {scenes.map((s, i) => {
                const thumb = thumbOf(s.visual)
                const asset = s.visual.kind === 'asset' ? p.assets.find((a) => a.id === (s.visual as { assetId: string }).assetId) : undefined
                return (
                  <li key={s.id} className="grid gap-2 rounded-xl border border-[rgb(var(--color-border))] p-2 md:grid-cols-[72px_minmax(0,1fr)_260px]">
                    <div className="relative h-32 w-[72px] overflow-hidden rounded-lg bg-[rgb(var(--color-surface))]">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center p-1 text-center text-[10px] text-[rgb(var(--color-muted))]">{s.visual.kind === 'ai' ? 'çizim yok' : '—'}</span>
                      )}
                      <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] font-bold text-white">{i + 1}</span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-[11px] text-[rgb(var(--color-muted))]">
                        <span className="font-mono">
                          {fmt(timing[i]?.start ?? 0)}–{fmt(timing[i]?.end ?? 0)}
                        </span>
                        {s.reason ? <span className="truncate">AI: {s.reason}</span> : null}
                      </div>
                      <textarea value={s.text} onChange={(e) => patchScene(s.id, (x) => ({ ...x, text: e.target.value }))} rows={2} maxLength={200} className={input_} aria-label="Sahne metni" />
                      <div className="grid grid-cols-2 gap-2">
                        <input value={s.highlights.join(', ')} onChange={(e) => patchScene(s.id, (x) => ({ ...x, highlights: e.target.value.split(',').map((w) => w.trim()).filter(Boolean) }))} className={input_} placeholder="Vurgu kelimeleri (virgülle)" />
                        <input value={s.label ?? ''} onChange={(e) => patchScene(s.id, (x) => ({ ...x, label: e.target.value || null }))} maxLength={28} className={input_} placeholder="Etiket (ör. 1871)" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <select value={s.visual.kind === 'ai' ? 'ai' : s.visual.assetId} onChange={(e) => setVisual(s, e.target.value)} className={input_} aria-label="Görüntü">
                        <option value="ai">✨ AI çizimi</option>
                        {p.assets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.kind === 'video' ? '🎬' : '🖼'} {a.name}
                          </option>
                        ))}
                      </select>
                      {s.visual.kind === 'ai' ? (
                        <>
                          <textarea value={s.visual.prompt} onChange={(e) => patchScene(s.id, (x) => (x.visual.kind === 'ai' ? { ...x, visual: { ...x.visual, prompt: e.target.value } } : x))} rows={2} maxLength={600} className={cn(input_, 'text-xs')} placeholder="Çizim tarifi" />
                          {s.visual.error ? <p className="text-[11px] text-red-600">{s.visual.error}</p> : null}
                          <button type="button" onClick={() => void makeImages(s.id)} disabled={busy !== null || !ai?.images} className="text-[11px] font-bold text-violet-700 disabled:opacity-50 dark:text-violet-300">
                            <Sparkles className="mr-1 inline h-3 w-3" />
                            {s.visual.imagePath ? 'Bu çizimi yenile' : 'Bu çizimi üret'}
                          </button>
                        </>
                      ) : asset?.kind === 'video' ? (
                        <div className="flex items-center gap-2 text-xs">
                          <label className="flex items-center gap-1">
                            Başlangıç
                            <input type="number" min={0} step={0.5} value={(s.visual.offsetMs / 1000).toString()} onChange={(e) => patchScene(s.id, (x) => (x.visual.kind === 'asset' ? { ...x, visual: { ...x.visual, offsetMs: Math.max(0, Math.round(Number(e.target.value) * 1000) || 0) } } : x))} className="w-16 rounded border border-[rgb(var(--color-border))] bg-transparent px-1 py-0.5" />
                            sn
                          </label>
                          <label className="flex items-center gap-1">
                            <input type="checkbox" checked={s.keepAudio} onChange={(e) => patchScene(s.id, (x) => ({ ...x, keepAudio: e.target.checked }))} /> Ortam sesi (kısık)
                          </label>
                        </div>
                      ) : null}
                      <div className="flex gap-2 pt-1">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Yukarı" className="disabled:opacity-30">
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === scenes.length - 1} title="Aşağı" className="disabled:opacity-30">
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => { setScenes((xs) => xs.filter((x) => x.id !== s.id)); setDirty(true) }} title="Sahneyi sil" className="ml-auto text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
            {scenes.length < MAX_SCENES && scenes.length ? (
              <button type="button" onClick={() => { setScenes((xs) => [...xs, { id: newId(), text: 'Yeni sahne metni.', highlights: [], label: null, keepAudio: false, reason: null, visual: { kind: 'ai', prompt: '', imagePath: null, imageUrl: null, imageKey: null, error: null } }]); setDirty(true) }} className={cn(btn, 'mt-2 border border-dashed border-[rgb(var(--color-border))] text-xs')}>
                <Plus className="h-4 w-4" /> Sahne ekle
              </button>
            ) : null}
          </Step>
        ) : null}

        {p && scenes.length ? (
          <Step n={4} title="Üretim">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void makeImages()} disabled={busy !== null || !missing.length || !ai?.images} className={cn(btn, 'bg-violet-600 text-white')}>
                {busy === 'images' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {missing.length ? `Eksik ${missing.length} çizimi üret${usage ? ` (~${(missing.length * usage.price).toFixed(2)} $)` : ''}` : 'Çizimler tamam'}
              </button>
              <button type="button" onClick={() => void render()} disabled={busy !== null || !!problem} className={cn(btn, 'bg-red-600 text-white')}>
                {busy === 'render' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {fresh ? 'Video güncel' : 'Videoyu üret'}
              </button>
              {problem ? <span className="text-xs text-amber-700 dark:text-amber-300">{problem}</span> : null}
              {progress ? <span className="text-xs text-[rgb(var(--color-muted))]">{progress}</span> : null}
            </div>
            {p.render.status === 'failed' && p.render.error ? <p className="mt-2 text-xs text-red-600">Son üretim başarısız: {p.render.error}</p> : null}
            {p.render.outputUrl ? (
              <div className="mt-3 flex flex-wrap items-start gap-4">
                <video key={p.render.outputUrl} src={p.render.outputUrl} poster={p.render.coverUrl ?? undefined} controls playsInline className="aspect-[9/16] w-[240px] rounded-xl bg-black" />
                <div className="space-y-1 text-xs">
                  <p>
                    Süre: <b>{p.render.seconds} sn</b> {fresh ? '· güncel' : '· eski sürüm (değişiklikler var, yeniden üretin)'}
                  </p>
                  <a href={p.render.outputUrl} target="_blank" rel="noreferrer" className="font-bold text-blue-600 underline">
                    MP4'ü indir / aç
                  </a>
                </div>
              </div>
            ) : null}
          </Step>
        ) : null}

        {p && fresh ? (
          <Step n={5} title="Paylaş">
            <div className="mb-2 flex gap-2 text-xs">
              {(['reel', 'video_story'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFormat(f)} className={cn('rounded-lg px-3 py-1.5 font-bold', format === f ? 'bg-red-600 text-white' : 'border border-[rgb(var(--color-border))]')}>
                  {f === 'reel' ? 'Reels / Shorts' : 'Video hikâye'}
                </button>
              ))}
            </div>
            {caption ? <p className="mb-2 whitespace-pre-line rounded-lg bg-[rgb(var(--color-surface))] p-2 text-[11px]">{caption}</p> : null}
            {accounts === null ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <ul className="grid gap-1 sm:grid-cols-2">
              {(accounts ?? []).map((a) => (
                <li key={a.accountId}>
                  <label className={cn('flex items-center gap-2 rounded-lg border border-[rgb(var(--color-border))] px-2 py-1.5 text-xs', !a.selectable && 'opacity-50')}>
                    <input type="checkbox" disabled={!a.selectable} checked={picked.has(a.accountId)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(a.accountId); else n.delete(a.accountId); return n })} />
                    <span className="font-bold">{a.displayName}</span>
                    <span className="text-[rgb(var(--color-muted))]">{a.platform}</span>
                    {a.reason ? <span className="ml-auto text-[10px] text-amber-700">{a.reason}</span> : null}
                  </label>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => void share()} disabled={!picked.size || rows.some((r) => r.state === 'sending')} className={cn(btn, 'mt-2 bg-blue-600 text-white')}>
              <Send className="h-4 w-4" /> Seçili hesaplarda yayımla
            </button>
            <ul className="mt-2 space-y-1 text-xs">
              {rows.map((r) => (
                <li key={r.accountId} className={r.state === 'ok' ? 'text-emerald-700' : r.state === 'failed' ? 'text-red-600' : r.state === 'uncertain' ? 'text-amber-700' : ''}>
                  {r.state === 'sending' ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}
                  {r.label}: {r.text}
                </li>
              ))}
            </ul>
          </Step>
        ) : null}
      </div>
    </div>
  )
}

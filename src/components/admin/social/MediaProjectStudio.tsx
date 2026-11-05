'use client'

/**
 * MEDIA-1 — Reels Studio «Medya projesi»: news-independent media.
 *   Left   : projects + «Yeni proje» (library / upload + rights record)
 *   Center : source player with the selected range looping, 9:16 preview of the clip
 *   Right  : clip list, range (handles, presets, «buradan başlat / bitir»), frame and
 *            text toggles, platform limits, render, share to accounts
 * Preview runs in the browser; the server renders only on «Bölümü üret».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Film, Loader2, Plus, Save, Scissors, Send, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { reelsCall, runReelJob } from './reelsApi'
import { ReelsVideoPicker, type PickedVideo } from './ReelsVideoPicker'
import {
  CLIP_MAX_MS,
  CLIP_MIN_MS,
  DEFAULT_CLIP_OPTIONS,
  MAX_CLIPS,
  PLATFORM_LIMITS,
  PLATFORM_NAME,
  PRESET_SECONDS,
  RIGHTS_KINDS,
  RIGHTS_TEXT,
  type ClipOptions,
  type MediaClip,
  type MediaProject,
  type MediaRights,
  type MediaShareFormat,
  type MediaSharePlatform,
  type RightsKind,
} from '@/lib/media/mediaProject'

type ShareAccount = { accountId: string; platform: MediaSharePlatform; displayName: string; username: string | null; selectable: boolean; reason: string | null }
type ShareRow = { accountId: string; label: string; state: 'sending' | 'ok' | 'failed' | 'uncertain'; text: string }

const API = '/api/admin/social/media-projects'
const sec = (ms: number) => Math.round(ms / 100) / 10
const fmtTime = (ms: number) => {
  const s = Math.max(0, ms) / 1000
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
}
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('')

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1 text-xs">
      <span className="font-semibold text-[rgb(var(--color-text))]">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-[rgb(var(--color-muted))]">{hint}</span> : null}
    </label>
  )
}
const input_ = 'w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5 text-sm'

function RightsForm({ value, onChange }: { value: MediaRights; onChange: (r: MediaRights) => void }) {
  return (
    <div className="space-y-2 rounded-xl border border-[rgb(var(--color-border))] p-3">
      <p className="text-xs font-bold text-[rgb(var(--color-text))]">Kullanım hakkı (zorunlu)</p>
      <select value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value as RightsKind })} className={input_} aria-label="Kullanım hakkı">
        {RIGHTS_KINDS.map((k) => (
          <option key={k} value={k}>
            {RIGHTS_TEXT[k]}
          </option>
        ))}
      </select>
      {value.kind !== 'owned' ? (
        <Field label="Kaynak (video sahibi)" hint="Paylaşımda «Kaynak: …» olarak yazılır">
          <input value={value.sourceName ?? ''} maxLength={120} onChange={(e) => onChange({ ...value, sourceName: e.target.value })} className={input_} placeholder="ör. Ahmet Yılmaz / Valilik / DHA" />
        </Field>
      ) : null}
      {value.kind === 'permission' || value.kind === 'user_submitted' || value.kind === 'licensed' ? (
        <Field label="İzin / lisans nerede kayıtlı" hint="Belge içeriği değil, yeri: e-posta tarihi, sözleşme no, mesaj">
          <input value={value.note ?? ''} maxLength={500} onChange={(e) => onChange({ ...value, note: e.target.value })} className={input_} placeholder="ör. 05.11 e-posta onayı" />
        </Field>
      ) : null}
      {value.kind === 'found_online' ? (
        <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          İzinsiz video hazırlanabilir ama paylaşılamaz. Meta izinsiz yeniden paylaşımda hesabın erişimini ve gelirini düşürüyor; sahibinden izin alın.
        </p>
      ) : null}
    </div>
  )
}

/** The clip on a 9:16 frame as the render will draw it (approximate, browser-only). */
function ClipPreview({ project, clip, videoRef, onTime, onDuration }: { project: MediaProject; clip: MediaClip | null; videoRef: React.RefObject<HTMLVideoElement | null>; onTime: (ms: number) => void; onDuration: (ms: number) => void }) {
  const o = clip?.options ?? DEFAULT_CLIP_OPTIONS
  const vertical = o.frame === 'vertical'
  const source = project.rights.kind !== 'owned' ? project.rights.sourceName : null
  // Loop inside the selected range.
  const onTimeUpdate = () => {
    const v = videoRef.current
    if (!v || !clip) return
    const ms = v.currentTime * 1000
    onTime(ms)
    if (ms >= clip.endMs || ms < clip.startMs - 500) v.currentTime = clip.startMs / 1000
  }
  return (
    <div className={cn('relative mx-auto overflow-hidden rounded-2xl bg-black', vertical ? 'aspect-[9/16] w-[260px]' : 'w-full max-w-[460px]')}>
      {vertical && project.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={project.posterUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl" />
      ) : null}
      {project.sourceUrl ? (
        <video
          ref={videoRef}
          src={project.sourceUrl}
          poster={project.posterUrl ?? undefined}
          controls
          playsInline
          muted={o.mute}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && onDuration(Math.round(e.currentTarget.duration * 1000))}
          className={cn('relative', vertical ? 'absolute inset-0 h-full w-full object-contain' : 'w-full')}
        />
      ) : (
        <p className="p-6 text-center text-xs text-white">Önizleme için videonun adresi yok</p>
      )}
      {vertical && o.showLogo ? <span className="pointer-events-none absolute left-3 top-6 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">NaHaber</span> : null}
      {vertical && o.showSource && source ? <span className="pointer-events-none absolute right-3 top-6 max-w-[60%] truncate rounded bg-[#071530]/75 px-1.5 py-0.5 text-[10px] text-white">Kaynak: {source}</span> : null}
      {vertical && o.showTitle && clip?.title ? (
        <p className="pointer-events-none absolute inset-x-3 bottom-[22%] rounded-lg border-l-4 border-red-600 bg-[#071530]/85 px-2 py-1.5 text-[12px] font-black leading-tight text-white">{clip.title}</p>
      ) : null}
    </div>
  )
}

function PlatformLimits({ ms, rights }: { ms: number; rights: RightsKind }) {
  const s = ms / 1000
  const rows = (Object.keys(PLATFORM_LIMITS) as MediaSharePlatform[]).map((p) => {
    const lim = PLATFORM_LIMITS[p]
    const reelOk = s <= lim.reelMaxSec && !(p === 'youtube' && s > 60 && rights !== 'owned')
    const storyOk = lim.storyMaxSec !== null && s <= lim.storyMaxSec
    return { p, reelOk, storyOk, storyNa: lim.storyMaxSec === null }
  })
  return (
    <div className="flex flex-wrap gap-1 text-[11px]" aria-label="Platform süre uygunluğu">
      {rows.map((r) => (
        <span key={r.p} className={cn('rounded-full px-2 py-0.5', r.reelOk ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200')}>
          {PLATFORM_NAME[r.p]} {r.reelOk ? '✓' : '✗'}
          {r.storyNa ? '' : ` · hikâye ${r.storyOk ? '✓' : '✗'}`}
        </span>
      ))}
    </div>
  )
}

function SharePanel({ project, clip }: { project: MediaProject; clip: MediaClip }) {
  const [format, setFormat] = useState<MediaShareFormat>('reel')
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
    void reelsCall<{ accounts: ShareAccount[] }>('GET', `${API}/${project.id}/share?clipId=${clip.id}&format=${format}`).then((r) => {
      if (!off) setAccounts(r.ok ? r.data.accounts : [])
    })
    return () => {
      off = true
    }
  }, [project.id, clip.id, clip.renderKey, format])

  const label = (a: ShareAccount) => `${PLATFORM_NAME[a.platform]} · ${a.displayName}${a.username ? ` (@${a.username})` : ''}`
  const send = async () => {
    setBusy(true)
    setConfirm(false)
    const chosen = (accounts ?? []).filter((a) => sel.includes(a.accountId))
    setRows(chosen.map((a) => ({ accountId: a.accountId, label: label(a), state: 'sending', text: 'gönderiliyor…' })))
    for (const a of chosen) {
      const r = await runReelJob(`${API}/${project.id}/share`, { clipId: clip.id, accountId: a.accountId, format })
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
      setRows((cur) => cur.map((x) => (x.accountId === a.accountId ? { ...x, state, text } : x)))
    }
    setBusy(false)
  }

  return (
    <div className="space-y-2 rounded-xl border border-[rgb(var(--color-border))] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-[rgb(var(--color-text))]">Paylaş · {clip.name}</p>
        <div className="flex gap-1 text-[11px]">
          {(['reel', 'video_story'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFormat(f)} className={cn('rounded-md px-2 py-1', format === f ? 'bg-[rgb(var(--color-brand))] text-white' : 'border border-[rgb(var(--color-border))]')}>
              {f === 'reel' ? 'Reels / video gönderi' : 'Video hikâye'}
            </button>
          ))}
        </div>
      </div>
      {accounts === null ? <p className="text-xs text-[rgb(var(--color-muted))]">Hesaplar yükleniyor…</p> : null}
      {accounts && accounts.length === 0 ? <p className="text-xs text-[rgb(var(--color-muted))]">Bu biçim için bağlı hesap yok.</p> : null}
      <ul className="max-h-56 space-y-1 overflow-auto">
        {(accounts ?? []).map((a) => (
          <li key={a.accountId}>
            <label className={cn('flex items-start gap-2 text-xs', !a.selectable && 'opacity-60')}>
              <input type="checkbox" disabled={!a.selectable || busy} checked={sel.includes(a.accountId)} onChange={() => setSel((c) => (c.includes(a.accountId) ? c.filter((x) => x !== a.accountId) : [...c, a.accountId]))} className="mt-0.5" />
              <span>
                <span className="font-semibold">{label(a)}</span>
                {a.reason ? <span className="block text-[11px] text-amber-700 dark:text-amber-300">{a.reason}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {confirm ? (
        <div className="space-y-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-semibold">Gerçek paylaşım yapılacak: «{clip.name}» ({sec(clip.endMs - clip.startMs)} sn) → {sel.length} hesap</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void send()} className="rounded-md bg-red-600 px-3 py-1 font-bold text-white">
              Onayla ve paylaş
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="rounded-md border border-[rgb(var(--color-border))] px-3 py-1">
              Vazgeç
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy || sel.length === 0} onClick={() => setConfirm(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} {sel.length ? `${sel.length} hesapta paylaş` : 'Hesap seçin'}
        </button>
      )}
      {rows.length ? (
        <ul className="space-y-1 text-[11px]">
          {rows.map((r) => (
            <li key={r.accountId} className={cn('rounded-md px-2 py-1', r.state === 'ok' ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100' : r.state === 'sending' ? 'bg-[rgb(var(--color-surface))]' : r.state === 'uncertain' ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100' : 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100')}>
              {r.label}: {r.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function NewProject({ onCreated, onCancel }: { onCreated: (p: MediaProject) => void; onCancel: () => void }) {
  const [video, setVideo] = useState<PickedVideo | null>(null)
  const [title, setTitle] = useState('')
  const [rights, setRights] = useState<MediaRights>({ kind: 'owned', sourceName: null, note: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const create = async () => {
    if (!video) return setError('Önce video seçin veya yükleyin')
    setBusy(true)
    setError(null)
    const r = await reelsCall<{ project: MediaProject }>('POST', API, { videoItemId: video.id, title: title || video.title, rights })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onCreated(r.data.project)
  }
  return (
    <div className="space-y-3">
      <p className="text-sm font-bold">Yeni medya projesi</p>
      <ReelsVideoPicker value={video} onChange={setVideo} />
      <Field label="Proje adı">
        <input value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} className={input_} placeholder={video?.title ?? 'ör. Sağanak sonrası cadde'} />
      </Field>
      <RightsForm value={rights} onChange={setRights} />
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" disabled={busy || !video} onClick={() => void create()} className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">
          {busy ? 'Oluşturuluyor…' : 'Projeyi oluştur'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm">
          Vazgeç
        </button>
      </div>
    </div>
  )
}

export function MediaProjectStudio() {
  const [projects, setProjects] = useState<MediaProject[] | null>(null)
  const [project, setProject] = useState<MediaProject | null>(null)
  const [draft, setDraft] = useState<MediaProject | null>(null)
  const [creating, setCreating] = useState(false)
  const [clipId, setClipId] = useState<string | null>(null)
  const [now, setNow] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [mediaDur, setMediaDur] = useState<number | null>(null)

  const load = useCallback(async () => {
    const r = await reelsCall<{ projects: MediaProject[] }>('GET', API)
    setProjects(r.ok ? r.data.projects : [])
    if (!r.ok) setError(r.status === 403 ? 'Medya projeleri yalnız merkez sosyal medya yöneticilerine açık.' : r.error)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const open = (p: MediaProject) => {
    if (p.id !== project?.id) setMediaDur(null)
    setProject(p)
    setDraft(structuredClone(p))
    setClipId(p.clips[0]?.id ?? null)
    setCreating(false)
    setError(null)
  }

  const dirty = useMemo(() => !!draft && !!project && JSON.stringify(draft) !== JSON.stringify(project), [draft, project])
  const clip = draft?.clips.find((c) => c.id === clipId) ?? null
  const durMs = draft?.durationMs ?? mediaDur

  const setClip = (patch: Partial<MediaClip>) => {
    if (!draft || !clip) return
    setDraft({ ...draft, clips: draft.clips.map((c) => (c.id === clip.id ? { ...c, ...patch, status: 'draft' } : c)) })
  }
  const setOpt = (patch: Partial<ClipOptions>) => clip && setClip({ options: { ...clip.options, ...patch } })
  const setRange = (startMs: number, endMs: number) => {
    const max = durMs ?? Number.MAX_SAFE_INTEGER
    const s = Math.max(0, Math.min(startMs, max - CLIP_MIN_MS))
    const e = Math.max(s + CLIP_MIN_MS, Math.min(endMs, max, s + CLIP_MAX_MS))
    setClip({ startMs: Math.round(s), endMs: Math.round(e) })
  }
  const addClip = (from?: MediaClip) => {
    if (!draft || draft.clips.length >= MAX_CLIPS) return
    const base = from ?? clip
    const start = base ? base.endMs : 0
    const end = Math.min(start + 30_000, durMs ?? start + 30_000)
    const c: MediaClip = {
      id: newId(),
      name: `Bölüm ${draft.clips.length + 1}`,
      startMs: end - start >= CLIP_MIN_MS ? start : 0,
      endMs: end - start >= CLIP_MIN_MS ? end : Math.min(30_000, durMs ?? 30_000),
      title: base?.title ?? draft.title,
      options: base?.options ?? { ...DEFAULT_CLIP_OPTIONS },
      status: 'draft',
      renderKey: null,
      outputUrl: null,
      coverUrl: null,
      seconds: null,
      error: null,
      renderedAt: null,
    }
    setDraft({ ...draft, clips: [...draft.clips, c] })
    setClipId(c.id)
  }

  const save = async (): Promise<MediaProject | null> => {
    if (!draft) return null
    setBusy('save')
    // PATCH (reelsCall supports GET/POST only)
    const token = (await (await import('@/lib/firebase/auth')).auth.currentUser?.getIdToken()) ?? ''
    const res = await fetch(`${API}/${draft.id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: draft.title, caption: draft.caption, rights: draft.rights, linkedNewsId: draft.linkedNewsId, clips: draft.clips.map((c) => ({ id: c.id, name: c.name, startMs: c.startMs, endMs: c.endMs, title: c.title, options: c.options })) }),
    }).catch(() => null)
    const body = res ? ((await res.json().catch(() => null)) as { project?: MediaProject; error?: string } | null) : null
    setBusy(null)
    if (!res?.ok || !body?.project) {
      toast.error(body?.error ?? 'Kaydedilemedi')
      return null
    }
    open(body.project)
    setClipId(clip?.id ?? body.project.clips[0]?.id ?? null)
    void load()
    return body.project
  }

  const render = async () => {
    if (!clip) return
    const saved = dirty ? await save() : project
    if (!saved) return
    setBusy('render')
    const r = await runReelJob(`${API}/${saved.id}/render`, { clipId: clip.id })
    setBusy(null)
    if (!r.ok || r.job.status === 'failed') toast.error(r.ok ? (r.job.error ?? 'Üretilemedi') : r.error)
    const fresh = await reelsCall<{ project: MediaProject }>('GET', `${API}/${saved.id}`)
    if (fresh.ok) {
      open(fresh.data.project)
      setClipId(clip.id)
    }
  }

  const remove = async () => {
    if (!project) return
    const token = (await (await import('@/lib/firebase/auth')).auth.currentUser?.getIdToken()) ?? ''
    const res = await fetch(`${API}/${project.id}`, { method: 'DELETE', credentials: 'same-origin', headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
    if (!res?.ok) return toast.error('Silinemedi')
    setProject(null)
    setDraft(null)
    void load()
  }

  const len = clip ? clip.endMs - clip.startMs : 0
  const ready = clip && project?.clips.find((c) => c.id === clip.id)?.status === 'ready' && !dirty

  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[300px_1fr_360px]">
      {/* Left: projects */}
      <aside className="min-h-0 space-y-2 overflow-auto rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Medya projeleri</p>
          <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1 rounded-lg bg-[rgb(var(--color-brand))] px-2 py-1 text-xs font-bold text-white">
            <Plus className="h-3.5 w-3.5" /> Yeni
          </button>
        </div>
        <p className="text-[11px] text-[rgb(var(--color-muted))]">Haberden bağımsız video: kısalt, bölümlere ayır, orijinal ya da yazılı paylaş.</p>
        {creating ? <NewProject onCreated={(p) => { open(p); void load() }} onCancel={() => setCreating(false)} /> : null}
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
        {projects === null ? <p className="text-xs text-[rgb(var(--color-muted))]">Yükleniyor…</p> : null}
        {projects?.length === 0 && !creating ? <p className="text-xs text-[rgb(var(--color-muted))]">Henüz proje yok. «Yeni» ile başlayın.</p> : null}
        <ul className="space-y-1">
          {(projects ?? []).map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => open(p)} className={cn('flex w-full items-center gap-2 rounded-lg p-1.5 text-left text-xs', project?.id === p.id ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-[rgb(var(--color-surface))]')}>
                {p.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.posterUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                ) : (
                  <Film className="h-10 w-10 shrink-0 rounded bg-[rgb(var(--color-surface))] p-2" />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.title}</span>
                  <span className="block text-[11px] text-[rgb(var(--color-muted))]">
                    {p.clips.length} bölüm · {p.clips.filter((c) => c.status === 'ready').length} hazır · {RIGHTS_TEXT[p.rights.kind].split(' (')[0]}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Center: preview */}
      <section className="min-h-0 space-y-3 overflow-auto rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3">
        {!draft ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-[rgb(var(--color-muted))]">
            <Scissors className="h-8 w-8" />
            Soldan bir proje seçin veya yeni proje açın.
          </div>
        ) : (
          <>
            <ClipPreview project={draft} clip={clip} videoRef={videoRef} onTime={setNow} onDuration={setMediaDur} />
            {clip ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold">
                    {fmtTime(clip.startMs)} → {fmtTime(clip.endMs)} · {sec(len)} sn
                  </span>
                  <span className="text-[rgb(var(--color-muted))]">oynatıcı: {fmtTime(now)}{durMs ? ` / ${fmtTime(durMs)}` : ''}</span>
                </div>
                {durMs ? (
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-[11px]">
                      Başlangıç
                      <input type="range" min={0} max={durMs} step={100} value={clip.startMs} onChange={(e) => setRange(Number(e.target.value), clip.endMs)} className="flex-1" aria-label="Başlangıç" />
                    </label>
                    <label className="flex items-center gap-2 text-[11px]">
                      Bitiş
                      <input type="range" min={0} max={durMs} step={100} value={clip.endMs} onChange={(e) => setRange(clip.startMs, Number(e.target.value))} className="flex-1" aria-label="Bitiş" />
                    </label>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <button type="button" onClick={() => setRange(now, Math.max(now + CLIP_MIN_MS, clip.endMs))} className="rounded-md border border-[rgb(var(--color-border))] px-2 py-1">
                    Buradan başlat
                  </button>
                  <button type="button" onClick={() => setRange(clip.startMs, now)} className="rounded-md border border-[rgb(var(--color-border))] px-2 py-1">
                    Burada bitir
                  </button>
                  {PRESET_SECONDS.map((s) => (
                    <button key={s} type="button" onClick={() => setRange(clip.startMs, clip.startMs + s * 1000)} className="rounded-md border border-[rgb(var(--color-border))] px-2 py-1">
                      {s} sn
                    </button>
                  ))}
                  <button type="button" onClick={() => videoRef.current && ((videoRef.current.currentTime = clip.startMs / 1000), void videoRef.current.play())} className="rounded-md bg-[rgb(var(--color-surface))] px-2 py-1 font-semibold">
                    ▶ Bölümü oynat
                  </button>
                </div>
                <PlatformLimits ms={len} rights={draft.rights.kind} />
              </div>
            ) : (
              <p className="text-center text-xs text-[rgb(var(--color-muted))]">Bölüm ekleyin.</p>
            )}
          </>
        )}
      </section>

      {/* Right: clips, options, render, share */}
      <aside className="min-h-0 space-y-3 overflow-auto rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3">
        {!draft ? null : (
          <>
            <Field label="Proje adı">
              <input value={draft.title} maxLength={140} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={input_} />
            </Field>
            <Field label="Paylaşım metni" hint="Boşsa bölüm başlığı kullanılır; izinli/lisanslı görüntüde «Kaynak: …» otomatik eklenir">
              <textarea value={draft.caption} maxLength={2000} rows={3} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} className={input_} />
            </Field>
            <RightsForm value={draft.rights} onChange={(rights) => setDraft({ ...draft, rights })} />

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold">Bölümler ({draft.clips.length}/{MAX_CLIPS})</p>
                <button type="button" disabled={draft.clips.length >= MAX_CLIPS} onClick={() => addClip()} className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--color-border))] px-2 py-0.5 text-[11px] disabled:opacity-50">
                  <Plus className="h-3 w-3" /> Bölüm ekle
                </button>
              </div>
              <ul className="space-y-1">
                {draft.clips.map((c) => (
                  <li key={c.id} className={cn('flex items-center gap-1 rounded-lg px-2 py-1 text-xs', c.id === clipId ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-[rgb(var(--color-surface))]')}>
                    <button type="button" onClick={() => setClipId(c.id)} className="min-w-0 flex-1 text-left">
                      <span className="font-semibold">{c.name}</span>{' '}
                      <span className="text-[rgb(var(--color-muted))]">
                        {sec(c.endMs - c.startMs)} sn · {c.options.frame === 'original' ? 'orijinal' : c.options.showTitle ? 'yazılı' : 'yazısız'} ·{' '}
                        {project?.clips.find((x) => x.id === c.id)?.status === 'ready' && !dirty ? 'hazır ✓' : c.status === 'failed' ? 'hata' : 'üretilmedi'}
                      </span>
                    </button>
                    <button type="button" title="Kopyala (ör. yazısız sürüm)" disabled={draft.clips.length >= MAX_CLIPS} onClick={() => {
                      const copy: MediaClip = { ...c, id: newId(), name: `${c.name} (kopya)`, status: 'draft', renderKey: null, outputUrl: null, coverUrl: null, seconds: null, error: null, renderedAt: null }
                      setDraft({ ...draft, clips: [...draft.clips, copy] })
                      setClipId(copy.id)
                    }} className="rounded p-1 hover:bg-[rgb(var(--color-surface))]">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="Bölümü sil" onClick={() => {
                      const clips = draft.clips.filter((x) => x.id !== c.id)
                      setDraft({ ...draft, clips })
                      if (clipId === c.id) setClipId(clips[0]?.id ?? null)
                    }} className="rounded p-1 text-red-700 hover:bg-[rgb(var(--color-surface))]">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {clip ? (
              <div className="space-y-2 rounded-xl border border-[rgb(var(--color-border))] p-3">
                <Field label="Bölüm adı">
                  <input value={clip.name} maxLength={80} onChange={(e) => setClip({ name: e.target.value })} className={input_} />
                </Field>
                <div className="flex gap-1 text-[11px]" role="radiogroup" aria-label="Görünüm">
                  {(
                    [
                      ['vertical', 'NaHaber düzeni (9:16)'],
                      ['original', 'Orijinal haliyle'],
                    ] as const
                  ).map(([f, l]) => (
                    <button key={f} type="button" role="radio" aria-checked={clip.options.frame === f} onClick={() => setOpt({ frame: f, ...(f === 'original' ? { showTitle: false, showLogo: false, showSource: false } : {}) })} className={cn('flex-1 rounded-md px-2 py-1', clip.options.frame === f ? 'bg-[rgb(var(--color-brand))] text-white' : 'border border-[rgb(var(--color-border))]')}>
                      {l}
                    </button>
                  ))}
                </div>
                {clip.options.frame === 'original' ? (
                  <p className="text-[11px] text-[rgb(var(--color-muted))]">Kırpma, yazı ve logo yok; yalnız platformların kabul ettiği MP4 biçimine çevrilir.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-1 text-[11px]">
                      {(
                        [
                          ['showTitle', 'Başlık yazısı'],
                          ['showLogo', 'NaHaber logosu'],
                          ['showSource', 'Kaynak etiketi'],
                          ['mute', 'Sesi kapat'],
                        ] as const
                      ).map(([k, l]) => (
                        <label key={k} className="inline-flex items-center gap-1.5">
                          <input type="checkbox" checked={clip.options[k]} onChange={(e) => setOpt({ [k]: e.target.checked } as Partial<ClipOptions>)} /> {l}
                        </label>
                      ))}
                    </div>
                    {clip.options.showTitle ? (
                      <Field label="Başlık yazısı">
                        <input value={clip.title} maxLength={140} onChange={(e) => setClip({ title: e.target.value })} className={input_} />
                      </Field>
                    ) : null}
                  </>
                )}
                {clip.options.frame === 'original' ? (
                  <label className="inline-flex items-center gap-1.5 text-[11px]">
                    <input type="checkbox" checked={clip.options.mute} onChange={(e) => setOpt({ mute: e.target.checked })} /> Sesi kapat
                  </label>
                ) : null}
                {clip.error && clip.status === 'failed' ? <p className="text-[11px] text-red-700">Son üretim: {clip.error}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!!busy || !dirty} onClick={() => void save()} className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
                    <Save className="h-3.5 w-3.5" /> {busy === 'save' ? 'Kaydediliyor…' : 'Kaydet'}
                  </button>
                  <button type="button" disabled={!!busy} onClick={() => void render()} className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                    {busy === 'render' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />} {busy === 'render' ? 'Üretiliyor…' : ready ? 'Hazır ✓ (yeniden üret)' : 'Bölümü üret'}
                  </button>
                </div>
                {ready && project ? (
                  <>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video src={project.clips.find((c) => c.id === clip.id)?.outputUrl ?? undefined} controls playsInline className="mx-auto max-h-80 rounded-lg bg-black" />
                    <SharePanel project={project} clip={project.clips.find((c) => c.id === clip.id)!} />
                  </>
                ) : (
                  <p className="text-[11px] text-[rgb(var(--color-muted))]">{dirty ? 'Değişiklikler kaydedilmedi; üretim önce kaydeder.' : 'Paylaşmak için önce bölümü üretin.'}</p>
                )}
              </div>
            ) : null}

            <button type="button" onClick={() => void remove()} className="inline-flex items-center gap-1 text-[11px] text-red-700">
              <Trash2 className="h-3 w-3" /> Projeyi sil (paylaşım kayıtları korunur)
            </button>
            {ready ? (
              <p className="flex items-center gap-1 text-[11px] text-emerald-700">
                <Check className="h-3 w-3" /> Üretilen dosya platform kurallarına uygun (H.264/AAC, 30 fps)
              </p>
            ) : null}
          </>
        )}
      </aside>
    </div>
  )
}

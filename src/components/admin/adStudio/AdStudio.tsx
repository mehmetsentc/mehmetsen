'use client'

/**
 * REKLAM STÜDYOSU — firma / ürün / iş ilanı / kampanya reklam videoları.
 * 6 adım: Video · Şablon · Metin · Ses · Yazı stili · Çıktı. Sağda canlı (yaklaşık) önizleme.
 * Çıktıda NaHaber logosu, yazısı ya da kapanışı YOKTUR; kapanışta yalnız firmanın kartı.
 * Ses: 4 profesyonel Gemini sesi (ücretli); ücretsiz sese düşülmez.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Check, Clapperboard, Download, ImageIcon, Loader2, Mic, Music, Pause, Play, Plus, Sparkles, Trash2, Type, Upload, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import { cn } from '@/lib/utils'
import { auth } from '@/lib/firebase/auth'
import { storage } from '@/lib/firebase/storage'
import { runReelJob } from '@/components/admin/social/reelsApi'
import {
  AD_ASPECTS,
  AD_KINDS,
  AD_KIND_INFO,
  AD_LOOKS,
  AD_LOOK_INFO,
  AD_MUSIC,
  AD_MUSIC_INFO,
  AD_TEXT_STYLES,
  AD_TEXT_STYLE_INFO,
  AD_TONES,
  AD_TONE_INFO,
  AD_VOICES,
  AD_VOICE_IDS,
  LOGO_POSITIONS,
  TEXT_POSITIONS,
  VIDEO_SOUNDS,
  VIDEO_SOUND_LABEL,
  adRenderProblem,
  adTotalMs,
  ribbonFor,
  splitScript,
  textWindowEnd,
  timeScenes,
  usesOwnMusic,
  voiceIsCurrent,
  type AdKind,
  type AdLook,
  type AdProject,
  type AdScene,
  type AdTextStyle,
} from '@/lib/adStudio/adModel'

const API = '/api/admin/ad-studio'
const STEPS = [
  ['video', 'Video', Clapperboard],
  ['sablon', 'Şablon', Sparkles],
  ['metin', 'Metin', Type],
  ['ses', 'Ses', Mic],
  ['stil', 'Yazı stili', Wand2],
  ['cikti', 'Çıktı', Download],
] as const
type Step = (typeof STEPS)[number][0]

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
const chip = (on: boolean) => cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold', on ? 'border-orange-600 bg-orange-600 text-white' : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]')
const card = (on: boolean) => cn('rounded-xl border p-3 text-left transition', on ? 'border-orange-600 ring-2 ring-orange-500/30' : 'border-[rgb(var(--color-border))] hover:border-orange-300')
const PALETTE = ['#ff5a1f', '#e11d48', '#facc15', '#22d3ee', '#2563eb', '#16a34a', '#d4af37', '#ffffff']

// ── liste ────────────────────────────────────────────────────────────────────
export function AdStudio() {
  const [ads, setAds] = useState<AdProject[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState<AdKind | null>(null)

  const load = useCallback(async () => {
    const r = await call<{ ads: AdProject[] }>('GET', API)
    if (r.ok) setAds(r.data.ads)
    else toast.error(r.error)
  }, [])
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('reklam')
    if (id) setOpenId(id)
    void load()
  }, [load])

  const open = (id: string | null) => {
    setOpenId(id)
    const u = new URL(window.location.href)
    if (id) u.searchParams.set('reklam', id)
    else u.searchParams.delete('reklam')
    window.history.replaceState(null, '', u.toString())
    if (!id) void load()
  }

  const create = async (kind: AdKind) => {
    setCreating(kind)
    const r = await call<{ ad: AdProject }>('POST', API, { kind, title: `${AD_KIND_INFO[kind].label} — yeni` })
    setCreating(null)
    if (!r.ok) return toast.error(r.error)
    open(r.data.ad.id)
  }

  if (openId) return <AdEditor id={openId} onBack={() => open(null)} />

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
        <div>Reklam videolarında <b>NaHaber logosu, yazısı ya da kapanışı bulunmaz</b>. Kapanışta yalnız firmanın kartı gösterilir. Seslendirme 4 profesyonel Gemini sesiyle yapılır (ücretli, aylık ses bütçesinden).</div>
      </div>
      <section className="space-y-3">
        <h2 className="text-base font-extrabold">Yeni reklam — türünü seçin</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AD_KINDS.map((k) => (
            <button key={k} type="button" disabled={!!creating} onClick={() => void create(k)} className="group rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 text-left hover:border-orange-400 disabled:opacity-60">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-extrabold">{AD_KIND_INFO[k].label}</span>
                {creating === k ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 text-orange-600 opacity-0 group-hover:opacity-100" />}
              </div>
              <p className="mt-1 text-[13px] text-[rgb(var(--color-muted))]">{AD_KIND_INFO[k].desc}</p>
              <p className="mt-2 text-[12px] font-semibold text-orange-700">Şablon: {AD_LOOK_INFO[AD_KIND_INFO[k].look].label} · Ses: {AD_VOICES[AD_KIND_INFO[k].voice].name}</p>
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-extrabold">Reklamlar</h2>
        {!ads ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : !ads.length ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">Henüz reklam yok.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ads.map((a) => (
              <button key={a.id} type="button" onClick={() => open(a.id)} className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-left hover:border-orange-400">
                <div className="flex aspect-video items-center justify-center bg-neutral-900">
                  {a.render.coverUrl ? <img src={a.render.coverUrl} alt="" className="h-full w-full object-cover" /> : <Clapperboard className="h-8 w-8 text-neutral-500" />}
                </div>
                <div className="p-3">
                  <div className="truncate text-sm font-extrabold">{a.title}</div>
                  <div className="mt-0.5 text-[12px] text-[rgb(var(--color-muted))]">
                    {AD_KIND_INFO[a.kind].label} · {AD_LOOK_INFO[a.look].label} · {a.render.status === 'ready' ? 'Video hazır' : 'Taslak'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── düzenleyici ──────────────────────────────────────────────────────────────
function AdEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const [ad, setAd] = useState<AdProject | null>(null)
  const [step, setStep] = useState<Step>('video')
  const [saving, setSaving] = useState(false)
  const pending = useRef<Record<string, unknown>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void call<{ ad: AdProject }>('GET', `${API}/${id}`).then((r) => (r.ok ? setAd(r.data.ad) : toast.error(r.error)))
  }, [id])

  /** sunucudan gelen yalnız sunucunun ürettiği alanlar alınır (yazılan metin ezilmez) */
  const takeServer = useCallback((s: AdProject) => setAd((cur) => (cur ? { ...cur, voice: s.voice, render: s.render, media: s.media, logoUrl: s.logoUrl, updatedAt: s.updatedAt } : s)), [])

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const body = pending.current
    if (!Object.keys(body).length) return true
    pending.current = {}
    setSaving(true)
    const r = await call<{ ad: AdProject }>('PATCH', `${API}/${id}`, body)
    setSaving(false)
    if (!r.ok) {
      toast.error(r.error)
      return false
    }
    takeServer(r.data.ad)
    return true
  }, [id, takeServer])

  const patch = useCallback(
    (p: Partial<AdProject>) => {
      setAd((cur) => (cur ? { ...cur, ...p } : cur))
      Object.assign(pending.current, p)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), 700)
    },
    [flush],
  )

  if (!ad) return <Loader2 className="h-6 w-6 animate-spin" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void flush().then(onBack)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold">
          <ArrowLeft className="h-4 w-4" /> Reklamlar
        </button>
        <input value={ad.title} onChange={(e) => patch({ title: e.target.value })} className="h-9 min-w-[240px] flex-1 rounded-xl border border-[rgb(var(--color-border))] bg-transparent px-3 text-[15px] font-extrabold" />
        <span className="text-[12px] text-[rgb(var(--color-muted))]">{saving ? 'Kaydediliyor…' : 'Kaydedildi'}</span>
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm('Bu reklam projesi silinsin mi? (Üretilmiş video dosyası etkilenmez)')) return
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
          <button key={k} type="button" onClick={() => setStep(k)} className={cn('inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold', step === k ? 'border-orange-600 bg-orange-600 text-white' : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]')}>
            <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[11px]', step === k ? 'bg-white text-orange-700' : 'bg-[rgb(var(--color-border))]')}>{i + 1}</span>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 space-y-4 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
          {step === 'video' && <VideoStep ad={ad} patch={patch} takeServer={takeServer} />}
          {step === 'sablon' && <TemplateStep ad={ad} patch={patch} />}
          {step === 'metin' && <TextStep ad={ad} patch={patch} />}
          {step === 'ses' && <VoiceStep ad={ad} patch={patch} flush={flush} takeServer={takeServer} />}
          {step === 'stil' && <StyleStep ad={ad} patch={patch} />}
          {step === 'cikti' && <OutputStep ad={ad} patch={patch} flush={flush} takeServer={takeServer} />}
          <div className="flex justify-between border-t border-[rgb(var(--color-border))] pt-3">
            <button type="button" disabled={step === 'video'} onClick={() => setStep(STEPS[Math.max(0, STEPS.findIndex((s) => s[0] === step) - 1)]![0])} className="h-9 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold disabled:opacity-40">
              Geri
            </button>
            <button type="button" disabled={step === 'cikti'} onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, STEPS.findIndex((s) => s[0] === step) + 1)]![0])} className="h-9 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white disabled:opacity-40">
              Sonraki adım
            </button>
          </div>
        </section>
        <Preview ad={ad} />
      </div>
    </div>
  )
}

type StepProps = { ad: AdProject; patch: (p: Partial<AdProject>) => void }

function H({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div>
      <h3 className="text-[15px] font-extrabold">{children}</h3>
      {hint && <p className="text-[12.5px] text-[rgb(var(--color-muted))]">{hint}</p>}
    </div>
  )
}

async function uploadFile(file: File, adId: string, onPct: (n: number) => void): Promise<string> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Oturum yok')
  const isVideo = file.type.startsWith('video/')
  const name = `${Date.now()}_${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`.slice(0, 120)
  const task = uploadBytesResumable(storageRef(storage, `${isVideo ? 'news-videos' : 'news-images'}/${uid}/ads/${adId}/${name}`), file, { contentType: file.type })
  await new Promise<void>((resolve, reject) => task.on('state_changed', (s) => onPct(Math.round((s.bytesTransferred / s.totalBytes) * 100)), reject, () => resolve()))
  return getDownloadURL(task.snapshot.ref)
}

function VideoStep({ ad, patch, takeServer }: StepProps & { takeServer: (a: AdProject) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [pct, setPct] = useState<number | null>(null)
  const add = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      const isVideo = file.type.startsWith('video/')
      if (!isVideo && !file.type.startsWith('image/')) {
        toast.error(`${file.name}: yalnız video ya da görsel`)
        continue
      }
      if (file.size > (isVideo ? 200 : 50) * 1024 * 1024) {
        toast.error(`${file.name}: ${isVideo ? 200 : 50} MB sınırını aşıyor`)
        continue
      }
      try {
        setPct(0)
        const url = await uploadFile(file, ad.id, setPct)
        const r = await call<{ ad: AdProject }>('POST', `${API}/${ad.id}/media`, { url, type: isVideo ? 'video' : 'image', name: file.name })
        if (!r.ok) toast.error(r.error)
        else takeServer(r.data.ad)
      } catch (e) {
        toast.error(`${file.name}: yüklenemedi (${e instanceof Error ? e.message.slice(0, 80) : 'hata'})`)
      } finally {
        setPct(null)
      }
    }
  }
  const move = (i: number, d: number) => {
    const m = [...ad.media]
    const j = i + d
    if (j < 0 || j >= m.length) return
    ;[m[i], m[j]] = [m[j]!, m[i]!]
    patch({ media: m })
  }
  return (
    <div className="space-y-4">
      <H hint="Firmanın çektiği video ya da ürün fotoğrafları. Birden fazla dosya sırayla birleşir.">1 · Reklam videosu / görselleri</H>
      <input ref={input} type="file" accept="video/*,image/*" multiple hidden onChange={(e) => void add(e.target.files).finally(() => (e.target.value = ''))} />
      <button type="button" onClick={() => input.current?.click()} disabled={pct !== null} className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50/50 px-4 py-8 text-sm font-semibold text-orange-800 disabled:opacity-70">
        {pct !== null ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
        {pct !== null ? `Yükleniyor… %${pct}` : 'Video ya da görsel yükle (video ≤ 200 MB, görsel ≤ 50 MB)'}
      </button>
      {ad.media.map((m, i) => (
        <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[rgb(var(--color-border))] p-3">
          {m.kind === 'video' ? <Clapperboard className="h-5 w-5 text-orange-600" /> : <ImageIcon className="h-5 w-5 text-orange-600" />}
          <div className="min-w-[140px] flex-1">
            <div className="truncate text-sm font-bold">{m.name}</div>
            <div className="text-[12px] text-[rgb(var(--color-muted))]">{m.kind === 'video' ? `Video · ${mmss(m.durationMs ?? 0)}${m.hasAudio ? ' · kendi müziği/sesi var' : ' · sessiz'}` : 'Görsel'} · kullanılan {sec(m.outMs - m.inMs)}</div>
          </div>
          {m.kind === 'video' && (
            <label className="text-[12px]">
              Başla (sn)
              <input type="number" min={0} step={0.5} value={m.inMs / 1000} onChange={(e) => patch({ media: ad.media.map((x) => (x.id === m.id ? { ...x, inMs: Math.round(Number(e.target.value) * 1000) } : x)) })} className="ml-1 w-20 rounded border border-[rgb(var(--color-border))] bg-transparent px-1.5 py-1" />
            </label>
          )}
          <label className="text-[12px]">
            {m.kind === 'video' ? 'Bitir (sn)' : 'Süre (sn)'}
            <input type="number" min={0.5} step={0.5} value={m.outMs / 1000} onChange={(e) => patch({ media: ad.media.map((x) => (x.id === m.id ? { ...x, outMs: Math.round(Number(e.target.value) * 1000) } : x)) })} className="ml-1 w-20 rounded border border-[rgb(var(--color-border))] bg-transparent px-1.5 py-1" />
          </label>
          <div className="flex gap-1">
            <button type="button" title="Yukarı" onClick={() => move(i, -1)} className="rounded border border-[rgb(var(--color-border))] p-1.5"><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" title="Aşağı" onClick={() => move(i, 1)} className="rounded border border-[rgb(var(--color-border))] p-1.5"><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" title="Kaldır" onClick={() => patch({ media: ad.media.filter((x) => x.id !== m.id) })} className="rounded border border-[rgb(var(--color-border))] p-1.5 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      ))}
      {ad.media.length > 0 && <p className="text-sm font-semibold">Toplam süre: {mmss(adTotalMs(ad))}</p>}
      <div className="space-y-2">
        <H>Biçim</H>
        <div className="flex flex-wrap gap-2">
          {AD_ASPECTS.map((a) => (
            <button key={a} type="button" onClick={() => patch({ aspect: a })} className={chip(ad.aspect === a)}>
              {a} {a === '9:16' ? 'Reels / Story' : a === '4:5' ? 'Gönderi' : a === '1:1' ? 'Kare' : 'YouTube / TV'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => patch({ fit: 'cover' })} className={chip(ad.fit === 'cover')}>Kadrajı doldur</button>
          <button type="button" onClick={() => patch({ fit: 'blur' })} className={chip(ad.fit === 'blur')}>Tamamı görünsün (bulanık zemin)</button>
        </div>
      </div>
    </div>
  )
}

function TemplateStep({ ad, patch }: StepProps) {
  const applyLook = (l: AdLook) => {
    const L = AD_LOOK_INFO[l]
    patch({ look: l, textStyle: L.style, music: L.music, accent: L.accent, ribbonOn: L.deco.kind === 'ribbon' || !!AD_KIND_INFO[ad.kind].ribbon })
  }
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <H hint="Tür değişince şablon değişmez; önerilen şablonu aşağıdan seçebilirsiniz.">2 · Reklam türü</H>
        <div className="flex flex-wrap gap-2">
          {AD_KINDS.map((k) => (
            <button key={k} type="button" onClick={() => patch({ kind: k })} className={chip(ad.kind === k)}>
              {AD_KIND_INFO[k].label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <H hint="Görünüm şablonu renk tonunu, geçişleri, süsleri, yazı stilini ve müziği birlikte ayarlar. Sonra tek tek değiştirebilirsiniz.">Görünüm şablonu</H>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {AD_LOOKS.map((l) => {
            const L = AD_LOOK_INFO[l]
            return (
              <button key={l} type="button" onClick={() => applyLook(l)} className={card(ad.look === l)}>
                <LookThumb look={l} />
                <div className="mt-2 flex items-center gap-1.5 text-sm font-extrabold">
                  {ad.look === l && <Check className="h-4 w-4 text-orange-600" />}
                  {L.label}
                  {AD_KIND_INFO[ad.kind].look === l && <span className="rounded bg-orange-100 px-1.5 text-[10px] font-bold text-orange-700">ÖNERİLEN</span>}
                </div>
                <div className="text-[12px] text-[rgb(var(--color-muted))]">{L.desc}</div>
              </button>
            )
          })}
        </div>
        {(AD_LOOK_INFO[ad.look].deco.kind === 'ribbon' || AD_KIND_INFO[ad.kind].ribbon) && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ad.ribbonOn} onChange={(e) => patch({ ribbonOn: e.target.checked })} /> Köşe şeridi göster ({ribbonFor({ ...ad, ribbonOn: true })?.kind === 'ribbon' ? (ribbonFor({ ...ad, ribbonOn: true }) as { text: string }).text : ''})
          </label>
        )}
      </div>
      <div className="space-y-2">
        <H hint="Seslendirme konuşurken müzik otomatik kısılır.">Fon müziği</H>
        {usesOwnMusic(ad) && (
          <p className="rounded-lg bg-orange-50 px-3 py-2 text-[13px] text-orange-900">
            Videonun kendi müziği kullanılıyor — üzerine fon müziği <b>eklenmez</b>. Kendi müziğimizi kullanmak için «Videonun kendi sesi»ni <b>Kapalı</b> yapın.
          </p>
        )}
        <div className={cn('flex flex-wrap gap-2', usesOwnMusic(ad) && 'pointer-events-none opacity-40')}>
          {AD_MUSIC.map((m) => (
            <span key={m} className="inline-flex items-center gap-1">
              <button type="button" onClick={() => patch({ music: m })} className={chip(ad.music === m)}>
                <Music className="h-3.5 w-3.5" /> {AD_MUSIC_INFO[m].label}
              </button>
              {AD_MUSIC_INFO[m].bed && <PlayButton src={`/api/reels/music/${AD_MUSIC_INFO[m].bed}`} />}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <H>Videonun kendi sesi</H>
        <div className="flex flex-wrap gap-2">
          {VIDEO_SOUNDS.map((v) => (
            <button key={v} type="button" onClick={() => patch({ videoSound: v })} className={chip(ad.videoSound === v)}>
              {VIDEO_SOUND_LABEL[v]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function LookThumb({ look }: { look: AdLook }) {
  const L = AD_LOOK_INFO[look]
  const filter = { sinema: 'contrast(1.15) saturate(0.9)', canli: 'saturate(1.4)', sicak: 'sepia(0.25) saturate(1.1)', solgun: 'sepia(0.45) saturate(0.8)', none: 'none', soguk: 'hue-rotate(-10deg)', siyahbeyaz: 'grayscale(1)' }[L.filter] ?? 'none'
  return (
    <div className="relative h-20 overflow-hidden rounded-lg" style={{ background: 'linear-gradient(135deg,#5b6b7a,#c9a46a 60%,#2d3a46)', filter }}>
      {L.deco.kind === 'bars' && (
        <>
          <div className="absolute inset-x-0 top-0 h-2.5 bg-black" />
          <div className="absolute inset-x-0 bottom-0 h-2.5 bg-black" />
        </>
      )}
      {L.deco.kind === 'frame' && <div className="absolute inset-1.5 border border-white/90" />}
      {L.deco.kind === 'ribbon' && (
        <span className="absolute left-1.5 top-1.5 rounded px-1.5 text-[9px] font-black" style={{ background: L.deco.bg, color: L.deco.fg }}>
          {L.deco.text}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-4 flex justify-center">
        <StyleSample style={L.style} accent={L.accent} small />
      </div>
    </div>
  )
}

/** yazı stilinin tarayıcı önizlemesi (yaklaşık; asıl çizim sunucuda) */
function StyleSample({ style, accent, text = 'Kalitenin adresi', small, size = 16 }: { style: AdTextStyle; accent: string; text?: string; small?: boolean; size?: number }) {
  const fs = small ? 10 : size
  const base: CSSProperties = { fontSize: fs, lineHeight: 1.2, maxWidth: '92%', textAlign: 'center', display: 'inline-block' }
  const words = text.split(' ')
  switch (style) {
    case 'bant':
      return <span style={{ ...base, background: accent, color: '#fff', fontWeight: 900, padding: '2px 8px' }}>{text}</span>
    case 'guclu':
      return <span style={{ ...base, fontFamily: "'Bebas Neue', Impact, 'Arial Narrow', sans-serif", fontSize: fs * 1.5, color: '#fff', textTransform: 'uppercase', borderLeft: `4px solid ${accent}`, paddingLeft: 6, textAlign: 'left', textShadow: '0 2px 8px rgba(0,0,0,.8)', letterSpacing: 0.5 }}>{text}</span>
    case 'vurgu':
      return (
        <span style={{ ...base, color: '#fff', fontWeight: 900, textShadow: '0 2px 6px rgba(0,0,0,.85)' }}>
          {words.slice(0, -1).join(' ')} <span style={{ background: accent, padding: '0 4px', borderRadius: 4, textShadow: 'none' }}>{words[words.length - 1]}</span>
        </span>
      )
    case 'sinema':
      return <span style={{ ...base, color: '#fff', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', background: 'linear-gradient(transparent,rgba(0,0,0,.6),transparent)', padding: '4px 10px', fontSize: fs * 0.85 }}>{text}</span>
    case 'zarif':
      return <span style={{ ...base, fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', color: '#F8F3E8', background: 'rgba(12,10,8,.66)', padding: '3px 10px', borderBottom: `2px solid ${accent}`, borderRadius: 6 }}>{text}</span>
    case 'kurumsal':
      return <span style={{ ...base, color: '#fff', fontWeight: 800, background: 'rgba(15,30,61,.92)', borderTop: `3px solid ${accent}`, padding: '3px 10px', borderRadius: 5, textAlign: 'left' }}>{text}</span>
    case 'etiket':
      return <span style={{ ...base, color: '#111', fontWeight: 900, background: accent === '#ff5a1f' ? '#FACC15' : accent, padding: '2px 8px', borderRadius: 6, transform: 'rotate(-3.5deg)', textTransform: 'uppercase' }}>{text}</span>
    default:
      return <span style={{ ...base, color: '#fff', fontWeight: 500, background: 'rgba(0,0,0,.68)', padding: '2px 8px', borderRadius: 5 }}>{text}</span>
  }
}

function PlayButton({ src }: { src: string }) {
  const [on, setOn] = useState(false)
  const el = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => el.current?.pause(), [])
  return (
    <button
      type="button"
      title="Dinle"
      onClick={() => {
        if (!el.current) {
          el.current = new Audio(src)
          el.current.onended = () => setOn(false)
        }
        if (on) {
          el.current.pause()
          setOn(false)
        } else {
          void el.current.play().then(() => setOn(true)).catch(() => toast.error('Ses çalınamadı'))
        }
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgb(var(--color-border))]"
    >
      {on ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
    </button>
  )
}

function TextStep({ ad, patch }: StepProps) {
  const make = () => {
    const lines = splitScript(ad.script)
    if (!lines.length) return toast.error('Önce reklam metnini yazın')
    const from = ad.voiceOn ? ad.voiceStartMs : 300
    const winEnd = textWindowEnd(ad)
    const to = Math.min(winEnd || 60_000, ad.voiceOn && ad.voice ? ad.voiceStartMs + ad.voice.durationMs : winEnd || 60_000)
    const sc = timeScenes(lines, from, Math.max(from + 1500, to))
    patch({ scenes: sc })
    toast.success(`${sc.length} sahne yazısı oluşturuldu`)
  }
  const set = (sid: string, p: Partial<AdScene>) => patch({ scenes: ad.scenes.map((s) => (s.id === sid ? { ...s, ...p } : s)) })
  return (
    <div className="space-y-4">
      <H hint="Seslendirme bu metni okur. Üç nokta (…) duraklama verir. Ünlem coşku katar.">3 · Reklam metni</H>
      <textarea rows={8} value={ad.script} onChange={(e) => patch({ script: e.target.value })} placeholder={AD_KIND_INFO[ad.kind].sample} className={field} />
      <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-[rgb(var(--color-muted))]">
        <span>{ad.script.length} / 1500 karakter</span>
        <span>Tahmini okuma ≈ {Math.round(ad.script.length / 14)} sn</span>
        {ad.media.length > 0 && <span>Video {mmss(adTotalMs(ad))}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-[rgb(var(--color-border))] pt-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={ad.textOn} onChange={(e) => patch({ textOn: e.target.checked })} /> Video üzerinde yazı göster
        </label>
        <button type="button" onClick={make} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-orange-600 px-3 text-sm font-bold text-white">
          <Wand2 className="h-4 w-4" /> Metinden sahne yazıları oluştur
        </button>
        <span className="text-[12px] text-[rgb(var(--color-muted))]">{ad.voice ? 'Seslendirme süresine göre dağıtılır' : 'Seslendirmeyi oluşturduktan sonra yeniden dağıtmanız önerilir'}</span>
      </div>
      {ad.textOn && (
        <div className="space-y-2">
          {ad.scenes.map((s, i) => (
            <div key={s.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 rounded-xl border border-[rgb(var(--color-border))] p-2.5">
              <span className="mt-1.5 text-center text-[12px] font-bold text-[rgb(var(--color-muted))]">{i + 1}</span>
              <div className="space-y-1.5">
                <input value={s.text} onChange={(e) => set(s.id, { text: e.target.value })} className={field} />
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <label>
                    Başla
                    <input type="number" step={0.1} min={0} value={s.startMs / 1000} onChange={(e) => set(s.id, { startMs: Math.round(Number(e.target.value) * 1000) })} className="ml-1 w-16 rounded border border-[rgb(var(--color-border))] bg-transparent px-1 py-0.5" />
                  </label>
                  <label>
                    Bitir
                    <input type="number" step={0.1} min={0} value={s.endMs / 1000} onChange={(e) => set(s.id, { endMs: Math.round(Number(e.target.value) * 1000) })} className="ml-1 w-16 rounded border border-[rgb(var(--color-border))] bg-transparent px-1 py-0.5" />
                  </label>
                  {ad.textStyle === 'vurgu' && (
                    <label>
                      Vurgulu kelime
                      <input value={s.emphasis} placeholder="son kelime" onChange={(e) => set(s.id, { emphasis: e.target.value })} className="ml-1 w-28 rounded border border-[rgb(var(--color-border))] bg-transparent px-1 py-0.5" />
                    </label>
                  )}
                  <button type="button" onClick={() => patch({ scenes: ad.scenes.filter((x) => x.id !== s.id) })} className="ml-auto text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const last = ad.scenes[ad.scenes.length - 1]
              const st = last ? last.endMs + 100 : 500
              patch({ scenes: [...ad.scenes, { id: `s${Date.now().toString(36)}`, text: 'Yeni yazı', startMs: st, endMs: st + 3000, emphasis: '' }] })
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" /> Yazı ekle
          </button>
        </div>
      )}
    </div>
  )
}

function VoiceStep({ ad, patch, flush, takeServer }: StepProps & { flush: () => Promise<boolean>; takeServer: (a: AdProject) => void }) {
  const [busy, setBusy] = useState(false)
  const [sample, setSample] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const current = voiceIsCurrent(ad)
  const estUsd = (Math.max(1, ad.script.length / 14) * 25 * 9) / 1e6
  const listen = async (voice: (typeof AD_VOICE_IDS)[number]) => {
    const k = `${voice}-${ad.tone}`
    setSample(k)
    const r = await call<{ url: string }>('POST', `${API}/voices`, { voice, tone: ad.tone })
    if (!r.ok) {
      setSample(null)
      return toast.error(r.error)
    }
    audio.current?.pause()
    audio.current = new Audio(r.data.url)
    audio.current.onended = () => setSample(null)
    void audio.current.play().catch(() => setSample(null))
  }
  const generate = async () => {
    if (!(await flush())) return
    setBusy(true)
    const r = await call<{ ad: AdProject }>('POST', `${API}/${ad.id}/voice`)
    setBusy(false)
    if (!r.ok) return toast.error(r.error)
    takeServer(r.data.ad)
    toast.success('Seslendirme hazır')
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <H hint="Profesyonel Gemini sesleri (ücretli). Ücretsiz standart sese düşülmez.">4 · Seslendirme</H>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={ad.voiceOn} onChange={(e) => patch({ voiceOn: e.target.checked })} /> Seslendirme olsun
        </label>
      </div>
      {ad.voiceOn ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {AD_VOICE_IDS.map((v) => (
              <div key={v} className={card(ad.voiceId === v)}>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => patch({ voiceId: v })} className="flex flex-1 items-center gap-3 text-left">
                    <span className={cn('flex h-10 w-10 items-center justify-center rounded-full text-sm font-black text-white', AD_VOICES[v].gender === 'Kadın' ? 'bg-rose-500' : 'bg-slate-700')}>{AD_VOICES[v].name[0]}</span>
                    <span>
                      <span className="block text-sm font-extrabold">{AD_VOICES[v].name} <span className="font-semibold text-[rgb(var(--color-muted))]">· {AD_VOICES[v].gender}</span></span>
                      <span className="block text-[12px] text-[rgb(var(--color-muted))]">{AD_VOICES[v].desc}</span>
                    </span>
                  </button>
                  <button type="button" title="Örnek dinle" onClick={() => void listen(v)} className="inline-flex h-8 items-center gap-1 rounded-full border border-[rgb(var(--color-border))] px-2.5 text-[12px] font-semibold">
                    {sample === `${v}-${ad.tone}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Dinle
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <H>Ton</H>
            <div className="flex flex-wrap gap-2">
              {AD_TONES.map((t) => (
                <button key={t} type="button" onClick={() => patch({ tone: t })} className={chip(ad.tone === t)}>
                  {AD_TONE_INFO[t].label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Hız: {ad.speed <= 0.92 ? 'Ağır' : ad.speed >= 1.08 ? 'Hızlı' : 'Normal'}
              <input type="range" min={0.85} max={1.15} step={0.05} value={ad.speed} onChange={(e) => patch({ speed: Number(e.target.value) })} className="w-full" />
            </label>
            <label className="text-sm font-semibold">
              Ses başlangıcı: {sec(ad.voiceStartMs)}
              <input type="range" min={0} max={5000} step={100} value={ad.voiceStartMs} onChange={(e) => patch({ voiceStartMs: Number(e.target.value) })} className="w-full" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[rgb(var(--color-border))] p-3">
            <button type="button" disabled={busy || !ad.script.trim()} onClick={() => void generate()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />} {current ? 'Seslendirme güncel' : ad.voice ? 'Seslendirmeyi yenile' : 'Seslendirmeyi oluştur'}
            </button>
            <span className="text-[12px] text-[rgb(var(--color-muted))]">Tahmini maliyet ≈ {estUsd < 0.01 ? '0,01 $ altı' : `${estUsd.toFixed(2).replace('.', ',')} $`} · aynı metin tekrar ücretlendirilmez</span>
            {ad.voice && (
              <div className="w-full space-y-1">
                <div className={cn('text-[12px] font-semibold', current ? 'text-green-700' : 'text-orange-700')}>
                  {current ? `Hazır · ${sec(ad.voice.durationMs)} · ${AD_VOICES[ad.voice.voice].name}, ${AD_TONE_INFO[ad.voice.tone].label}` : 'Metin ya da ses seçimi değişti — yenileyin'}
                </div>
                <audio controls src={ad.voice.url} className="w-full" />
              </div>
            )}
          </div>
          {!ad.script.trim() && <p className="text-sm text-orange-700">Önce «Metin» adımında reklam metnini yazın.</p>}
        </>
      ) : (
        <p className="text-sm text-[rgb(var(--color-muted))]">Seslendirmesiz reklam: yalnız müzik ve (isterseniz) videonun kendi sesi.</p>
      )}
    </div>
  )
}

function StyleStep({ ad, patch }: StepProps) {
  return (
    <div className="space-y-4">
      <H hint="Reklama uygun, okunaklı stiller. Örnekler yaklaşık; videoda sunucu çizer.">5 · Yazı stili</H>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {AD_TEXT_STYLES.map((s) => (
          <button key={s} type="button" onClick={() => patch({ textStyle: s })} className={card(ad.textStyle === s)}>
            <div className="flex h-20 items-center justify-center rounded-lg" style={{ background: 'linear-gradient(135deg,#4b5563,#a3835a)' }}>
              <StyleSample style={s} accent={ad.accent} size={14} />
            </div>
            <div className="mt-2 text-sm font-extrabold">{AD_TEXT_STYLE_INFO[s].label}</div>
            <div className="text-[12px] text-[rgb(var(--color-muted))]">{AD_TEXT_STYLE_INFO[s].desc}</div>
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <div className="text-sm font-bold">Yeri</div>
          <div className="flex gap-2">
            {TEXT_POSITIONS.map((p) => (
              <button key={p} type="button" onClick={() => patch({ textPos: p })} className={chip(ad.textPos === p)}>
                {p === 'alt' ? 'Alt' : p === 'orta' ? 'Orta' : 'Üst'}
              </button>
            ))}
          </div>
        </div>
        <label className="space-y-1.5 text-sm font-bold">
          Büyüklük
          <input type="range" min={44} max={100} step={2} value={ad.textSize} onChange={(e) => patch({ textSize: Number(e.target.value) })} className="w-full" />
        </label>
        <div className="space-y-1.5">
          <div className="text-sm font-bold">Vurgu rengi</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PALETTE.map((c) => (
              <button key={c} type="button" title={c} onClick={() => patch({ accent: c })} className={cn('h-7 w-7 rounded-full border-2', ad.accent === c ? 'border-orange-600' : 'border-[rgb(var(--color-border))]')} style={{ background: c }} />
            ))}
            <input type="color" value={ad.accent} onChange={(e) => patch({ accent: e.target.value })} className="h-7 w-9" />
          </div>
        </div>
      </div>
    </div>
  )
}

function OutputStep({ ad, patch, flush, takeServer }: StepProps & { flush: () => Promise<boolean>; takeServer: (a: AdProject) => void }) {
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [pct, setPct] = useState<number | null>(null)
  const logoInput = useRef<HTMLInputElement>(null)
  const problem = adRenderProblem(ad)
  const c = ad.card
  const setCard = (p: Partial<typeof c>) => patch({ card: { ...c, ...p } })
  const upLogo = async (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return toast.error('Logo bir görsel olmalı (PNG önerilir)')
    try {
      setPct(0)
      const url = await uploadFile(f, ad.id, setPct)
      const r = await call<{ ad: AdProject }>('POST', `${API}/${ad.id}/media`, { url, type: 'image', name: f.name, role: 'logo' })
      if (!r.ok) toast.error(r.error)
      else takeServer(r.data.ad)
    } catch {
      toast.error('Logo yüklenemedi')
    } finally {
      setPct(null)
    }
  }
  const render = async () => {
    if (!(await flush())) return
    setBusy(true)
    setElapsed(0)
    const r = await runReelJob(`${API}/${ad.id}/render`, {}, setElapsed)
    setBusy(false)
    if (!r.ok) return toast.error(r.error)
    const g = await call<{ ad: AdProject }>('GET', `${API}/${ad.id}`)
    if (g.ok) takeServer(g.data.ad)
    toast.success('Reklam videosu hazır')
  }
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <H hint="Videonun son saniyelerinde firmanın kartı. NaHaber kapanışı kullanılmaz.">6 · Firma kapanış kartı</H>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={c.enabled} onChange={(e) => setCard({ enabled: e.target.checked })} /> Kart olsun
          </label>
        </div>
        {c.enabled && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[12px] font-semibold">Firma adı<input value={c.name} onChange={(e) => setCard({ name: e.target.value })} className={field} /></label>
            <label className="text-[12px] font-semibold">Slogan<input value={c.slogan} onChange={(e) => setCard({ slogan: e.target.value })} className={field} /></label>
            <label className="text-[12px] font-semibold">Telefon<input value={c.phone} onChange={(e) => setCard({ phone: e.target.value })} className={field} /></label>
            <label className="text-[12px] font-semibold">Adres<input value={c.address} onChange={(e) => setCard({ address: e.target.value })} className={field} /></label>
            <label className="text-[12px] font-semibold">Web / sosyal<input value={c.web} onChange={(e) => setCard({ web: e.target.value })} className={field} /></label>
            <label className="text-[12px] font-semibold">Kart süresi: {sec(c.durationMs)}<input type="range" min={2000} max={8000} step={500} value={c.durationMs} onChange={(e) => setCard({ durationMs: Number(e.target.value) })} className="w-full" /></label>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <H hint="İsteğe bağlı: firmanın kendi logosu köşede ve kartta görünür.">Firma logosu</H>
        <input ref={logoInput} type="file" accept="image/*" hidden onChange={(e) => void upLogo(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
        <div className="flex flex-wrap items-center gap-2">
          {ad.logoUrl && <img src={ad.logoUrl} alt="Logo" className="h-10 rounded border border-[rgb(var(--color-border))] bg-white object-contain p-1" />}
          <button type="button" onClick={() => logoInput.current?.click()} disabled={pct !== null} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold">
            {pct !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {ad.logoUrl ? 'Logoyu değiştir' : 'Logo yükle'}
          </button>
          {ad.logoUrl && (
            <>
              {LOGO_POSITIONS.map((p) => (
                <button key={p} type="button" onClick={() => patch({ logoPos: p })} className={chip(ad.logoPos === p)}>
                  {p.replace('-', ' ').replace('sag', 'sağ').replace('ust', 'üst')}
                </button>
              ))}
              <button type="button" onClick={() => patch({ logoUrl: null })} className="text-sm font-semibold text-red-600">Kaldır</button>
            </>
          )}
        </div>
      </div>
      <div className="space-y-3 rounded-2xl border border-[rgb(var(--color-border))] p-4">
        <H>Reklam videosunu oluştur</H>
        {problem ? <p className="text-sm font-semibold text-orange-700">{problem}</p> : <p className="text-sm text-green-700">Hazır: {mmss(adTotalMs(ad))} · {ad.aspect} · {AD_LOOK_INFO[ad.look].label} · NaHaber logosu/kapanışı yok</p>}
        <button type="button" disabled={!!problem || busy} onClick={() => void render()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-extrabold text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />} {busy ? `Hazırlanıyor… ${Math.round(elapsed / 1000)} sn` : 'MP4 oluştur'}
        </button>
        {busy && <p className="text-[12px] text-[rgb(var(--color-muted))]">Video uzunluğuna göre 2–8 dakika sürebilir; sayfada kalın (sayfa kapanırsa video yine üretilir, «Reklamlar» listesinde görünür).</p>}
        {ad.render.status === 'failed' && <p className="text-sm text-red-600">Son deneme başarısız: {ad.render.error}</p>}
        {ad.render.status === 'ready' && ad.render.outputUrl && (
          <div className="space-y-2">
            <video src={ad.render.outputUrl} controls poster={ad.render.coverUrl ?? undefined} className="max-h-[420px] rounded-xl bg-black" />
            <div className="flex flex-wrap gap-2">
              <a href={ad.render.outputUrl} download target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-neutral-900 px-3 text-sm font-bold text-white">
                <Download className="h-4 w-4" /> MP4 indir
              </a>
              {ad.render.coverUrl && (
                <a href={ad.render.coverUrl} download target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-bold">
                  <ImageIcon className="h-4 w-4" /> Kapak görseli
                </a>
              )}
            </div>
            {ad.render.key !== null && problem === null && <p className="text-[12px] text-[rgb(var(--color-muted))]">Değişiklik yaparsanız «MP4 oluştur» ile yeniden üretin.</p>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── canlı önizleme (yaklaşık) ────────────────────────────────────────────────
function Preview({ ad }: { ad: AdProject }) {
  const video = useRef<HTMLVideoElement>(null)
  const voice = useRef<HTMLAudioElement>(null)
  const [t, setT] = useState(0)
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const total = adTotalMs(ad)
  const offsets = useMemo(() => {
    let acc = 0
    return ad.media.map((m) => {
      const o = acc
      acc += m.outMs - m.inMs
      return o
    })
  }, [ad.media])
  const m = ad.media[Math.min(idx, ad.media.length - 1)]
  const now = (offsets[idx] ?? 0) + t
  const cardOn = ad.card.enabled && total > 0 && now >= total - ad.card.durationMs
  const scene = ad.textOn ? ad.scenes.find((s) => now >= s.startMs && now < s.endMs && (!ad.card.enabled || s.startMs < total - ad.card.durationMs)) : null
  const L = AD_LOOK_INFO[ad.look]
  const rib = ribbonFor(ad)
  const ratio = { '9:16': '9 / 16', '4:5': '4 / 5', '1:1': '1 / 1', '16:9': '16 / 9' }[ad.aspect]
  const filter = { sinema: 'contrast(1.12) saturate(0.95)', canli: 'saturate(1.3)', sicak: 'sepia(0.2) saturate(1.05)', solgun: 'sepia(0.35) saturate(0.8)', none: 'none', soguk: 'none', siyahbeyaz: 'grayscale(1)' }[L.filter] ?? 'none'

  useEffect(() => {
    const v = video.current
    if (!v || !m || m.kind !== 'video') return
    v.currentTime = m.inMs / 1000
    if (playing) void v.play().catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, m?.id])

  useEffect(() => {
    if (!playing || !m || m.kind !== 'image') return
    const t0 = performance.now() - t
    const h = setInterval(() => {
      const el = performance.now() - t0
      if (el >= m.outMs - m.inMs) {
        if (idx < ad.media.length - 1) {
          setIdx(idx + 1)
          setT(0)
        } else setPlaying(false)
      } else setT(el)
    }, 100)
    return () => clearInterval(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, idx, m?.id])

  const toggle = () => {
    if (playing) {
      video.current?.pause()
      voice.current?.pause()
      setPlaying(false)
      return
    }
    if (now >= total - 200) {
      setIdx(0)
      setT(0)
    }
    setPlaying(true)
    if (m?.kind === 'video') void video.current?.play().catch(() => undefined)
    if (voice.current && ad.voiceOn) {
      const at = (now - ad.voiceStartMs) / 1000
      if (at >= 0) voice.current.currentTime = at
      else voice.current.currentTime = 0
      void voice.current.play().catch(() => undefined)
    }
  }

  const k = 1 / 3.2 // önizleme kutusu ~ 340 px genişlikte, 1080 px tabanına göre
  return (
    <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
      <div className="text-[12px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Önizleme (yaklaşık)</div>
      <div className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: ratio }}>
        {m ? (
          m.kind === 'video' ? (
            <video
              ref={video}
              src={m.url}
              muted={ad.videoSound === 'kapali'}
              playsInline
              className={cn('absolute inset-0 h-full w-full', ad.fit === 'cover' ? 'object-cover' : 'object-contain')}
              style={{ filter }}
              onTimeUpdate={(e) => {
                const ct = e.currentTarget.currentTime * 1000
                setT(Math.max(0, ct - m.inMs))
                if (ct >= m.outMs) {
                  if (idx < ad.media.length - 1) {
                    setIdx(idx + 1)
                    setT(0)
                  } else {
                    e.currentTarget.pause()
                    voice.current?.pause()
                    setPlaying(false)
                  }
                }
              }}
            />
          ) : (
            <img src={m.url} alt="" className={cn('absolute inset-0 h-full w-full', ad.fit === 'cover' ? 'object-cover' : 'object-contain')} style={{ filter }} />
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-400">Video ekleyin</div>
        )}
        {!cardOn && L.deco.kind === 'bars' && (
          <>
            <div className="absolute inset-x-0 top-0 bg-black" style={{ height: '6.5%' }} />
            <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: '6.5%' }} />
          </>
        )}
        {!cardOn && L.deco.kind === 'frame' && <div className="absolute inset-[3.5%] border border-white/90" />}
        {!cardOn && rib?.kind === 'ribbon' && (
          <span className="absolute left-[6%] top-[8.5%] rounded px-2 py-0.5 text-[11px] font-black tracking-wide" style={{ background: rib.bg, color: rib.fg }}>
            {rib.text}
          </span>
        )}
        {!cardOn && ad.logoUrl && <img src={ad.logoUrl} alt="" className={cn('absolute max-h-[11%] max-w-[20%] object-contain', ad.logoPos.startsWith('sag') ? 'right-[5%]' : 'left-[5%]', ad.logoPos.endsWith('ust') ? 'top-[8.5%]' : 'bottom-[8.5%]')} />}
        {!cardOn && scene && (
          <div className="absolute inset-x-0 flex justify-center px-3" style={{ top: ad.textPos === 'ust' ? '20%' : ad.textPos === 'orta' ? '50%' : '76%', transform: 'translateY(-50%)' }}>
            <StyleSample style={ad.textStyle} accent={ad.accent} text={scene.text} size={Math.round(ad.textSize * k * 0.95)} />
          </div>
        )}
        {cardOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center" style={{ background: `linear-gradient(160deg,#0b0b10,#14141c 65%,${ad.accent}8c)` }}>
            {ad.logoUrl && <img src={ad.logoUrl} alt="" className="max-h-16 max-w-[50%] object-contain" />}
            <div className="text-[28px] uppercase leading-none text-white" style={{ fontFamily: "'Bebas Neue', Impact, sans-serif" }}>{ad.card.name || 'Firma adı'}</div>
            <div className="h-1 w-12" style={{ background: ad.accent }} />
            {ad.card.slogan && <div className="text-[13px] italic text-[#F1ECE2]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{ad.card.slogan}</div>}
            <div className="text-[11px] text-white/85">{[ad.card.phone && `Tel: ${ad.card.phone}`, ad.card.address, ad.card.web].filter(Boolean).join(' · ')}</div>
          </div>
        )}
        {ad.voice && <audio ref={voice} src={ad.voice.url} preload="auto" />}
      </div>
      <div className="mx-auto flex max-w-[340px] items-center gap-2">
        <button type="button" onClick={toggle} disabled={!m} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-orange-600 text-white disabled:opacity-40">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <div className="h-1.5 flex-1 overflow-hidden rounded bg-[rgb(var(--color-border))]">
          <div className="h-full bg-orange-600" style={{ width: `${total ? Math.min(100, (now / total) * 100) : 0}%` }} />
        </div>
        <span className="w-20 text-right text-[12px] tabular-nums">{mmss(now)} / {mmss(total)}</span>
      </div>
      <p className="mx-auto max-w-[340px] text-[11.5px] text-[rgb(var(--color-muted))]">Önizleme tarayıcıda yaklaşık gösterilir (müzik çalınmaz). Asıl video «Çıktı» adımında sunucuda üretilir; NaHaber logosu ve kapanışı eklenmez.</p>
    </aside>
  )
}

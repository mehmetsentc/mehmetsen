'use client'

/**
 * REELS-1/2 — Reels studio: build the NaHaber news reel for one article
 * (Google TTS voice, brand audio, typewriter headline), pick the voice per reel,
 * manage the voice library, watch / download, and share to Instagram / Facebook.
 */
import { useEffect, useState } from 'react'
import { Clapperboard, Film, Image as ImageIcon, Loader2, RefreshCw, Search } from 'lucide-react'
import { auth } from '@/lib/firebase/auth'
import { tierForVoice } from '@/lib/reels/ttsQuotaRules'
import { ManualShareFlow } from './ManualShareFlow'
import { ReelsVoiceLibrary } from './ReelsVoiceLibrary'
import { GENDER_TEXT, reelsCall, reelsJob, TIER_TEXT, voiceLabel, type VoicesResponse } from './reelsApi'

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
}
type NewsPick = { newsId: string; title: string; category: string; city: string | null; publishedAt: number | null; imageUrl: string | null; hasVideo: boolean }
type Status = { enabled: boolean; voice: string; rate: number; ttsReady: boolean }
type Usage = {
  month: string
  overageApproved: boolean
  approvedBy: string | null
  tiers: Array<{ tier: string; used: number; cap: number; free: number; requests: number; overFree: number }>
}

const MEDIA_TEXT: Record<ReelResult['media'], string> = {
  image: 'Haber görseli (yakınlaşma efekti)',
  video: 'Haberin kendi videosu',
  none: 'Marka arka planı (görsel kullanım hakkı onaylı değil)',
}

async function call<T>(method: 'GET' | 'POST', body?: unknown, path = '/api/admin/social/reels/render') {
  return reelsCall<T>(method, path, body)
}

/** Accepts a raw id or a CMS edit URL (/admin/news/{id}/edit). */
export function parseNewsId(input: string): string {
  const s = input.trim()
  const m = s.match(/\/admin\/news\/([A-Za-z0-9_-]{4,64})/)
  return m ? m[1]! : s
}

export function ReelsStudioPanel() {
  const [status, setStatus] = useState<Status | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReelResult | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [voices, setVoices] = useState<VoicesResponse | null>(null)
  const [voicePick, setVoicePick] = useState('') // '' = automatic (category / default)
  const [showLibrary, setShowLibrary] = useState(false)
  const [q, setQ] = useState('')
  const [news, setNews] = useState<NewsPick[]>([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [picked, setPicked] = useState<NewsPick | null>(null)
  const [shareFmt, setShareFmt] = useState<'reel' | 'video_story' | null>(null)

  const loadNews = async (query: string) => {
    setNewsLoading(true)
    const r = await call<{ items: NewsPick[] }>('GET', undefined, `/api/admin/social/reels/news?q=${encodeURIComponent(query)}`)
    setNewsLoading(false)
    if (r.ok) setNews(r.data.items)
  }

  const loadVoices = async () => {
    const v = await call<VoicesResponse>('GET', undefined, '/api/admin/social/reels/voices')
    if (v.ok) setVoices(v.data)
  }

  const loadUsage = async () => {
    const u = await call<{ usage: Usage }>('GET', undefined, '/api/admin/social/reels/tts-usage')
    if (u.ok) setUsage(u.data.usage)
  }

  const setApproval = async (approve: boolean) => {
    if (approve && !window.confirm('Bu ay Google seslendirme ücretsiz limitinin üzerine çıkılmasına izin verilsin mi? Aşan karakterler Google Cloud faturasına yansır.')) return
    const u = await call<{ usage: Usage }>('POST', { approve, ...(approve ? { confirm: 'UCRETLI_KULLANIMA_ONAY' } : {}) }, '/api/admin/social/reels/tts-usage')
    if (u.ok) setUsage(u.data.usage)
    else setError(u.error)
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) return
      const r = await call<Status>('GET')
      if (r.ok) setStatus(r.data)
      void loadUsage()
      void loadVoices()
      void loadNews('')
    })
    try {
      const q = new URLSearchParams(window.location.search).get('newsId')
      if (q) setInput(q)
    } catch {
      // ignore
    }
    return () => unsub()
  }, [])

  const build = async (force: boolean) => {
    const newsId = parseNewsId(input)
    if (!newsId) return
    setBusy(true)
    setError(null)
    setShareFmt(null)
    // REELS-12: background job + polling
    const r = await reelsJob<{ result: ReelResult }>('/api/admin/social/reels/render', { newsId, force, ...(voicePick ? { voice: voicePick } : {}), async: true })
    setBusy(false)
    if (r.ok) setResult(r.data.result)
    else setError(r.error)
    void loadUsage()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[rgb(var(--color-border))] p-4 text-sm">
        <p className="font-semibold">Haber Reels stüdyosu</p>
        <p className="mt-1 text-[rgb(var(--color-muted))]">
          Yayındaki bir haberden dikey haber videosu üretir: daktilo efektli manşet, Google seslendirmesi, NaHaber
          marka müziği. Süre seslendirmeye göre değişir.
        </p>
        {status ? (
          <p className="mt-2 text-xs text-[rgb(var(--color-muted))]">
            Ses: <b>{voices ? voiceLabel(voices.effective.voice) : status.voice}</b> (hız {voices ? voices.effective.rate : status.rate}) · Google TTS {status.ttsReady ? 'hazır' : 'anahtarı eksik'} ·
            {status.enabled ? ' açık' : ' kapalı (SOCIAL_REELS_ENABLED=false)'}
          </p>
        ) : null}
      </div>

      {usage ? (
        <div className="rounded-xl border border-[rgb(var(--color-border))] p-4 text-sm" data-tts-usage>
          <p className="font-semibold">Seslendirme sayacı · {usage.month}</p>
          <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
            Ücretsiz limitin %95&apos;inde durur. Ücretli kullanım yalnızca bu ay için açıkça onaylanırsa devam eder.
          </p>
          <ul className="mt-2 space-y-1">
            {usage.tiers.filter((x) => x.used > 0 || (status ? tierForVoice(status.voice) === x.tier : false)).map((x) => (
              <li key={x.tier} className="flex items-center gap-2">
                <span className="w-24 shrink-0">{TIER_TEXT[x.tier] ?? x.tier}</span>
                <span className="h-2 flex-1 overflow-hidden rounded bg-[rgb(var(--color-border))]">
                  <span className={`block h-full ${x.used >= x.cap ? 'bg-red-600' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (x.used / x.cap) * 100)}%` }} />
                </span>
                <span className="w-48 shrink-0 text-right text-xs tabular-nums">
                  {x.used.toLocaleString('tr-TR')} / {x.cap.toLocaleString('tr-TR')}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-3 text-xs">
            {usage.overageApproved ? (
              <>
                <span className="font-semibold text-red-500">Bu ay ücretli kullanım onaylı</span>
                <button type="button" onClick={() => setApproval(false)} className="underline">Onayı kaldır</button>
              </>
            ) : (
              <>
                <span className="text-[rgb(var(--color-muted))]">Limit dolunca seslendirme durur.</span>
                <button type="button" onClick={() => setApproval(true)} className="underline">Bu ay limiti aşmaya izin ver</button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {voices ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="font-semibold">Bu video için ses</span>
            <select
              value={voicePick}
              onChange={(e) => setVoicePick(e.target.value)}
              className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5 text-sm"
            >
              <option value="">Otomatik ({voiceLabel(voices.effective.voice)} / kategori sesi)</option>
              {voices.voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {voiceLabel(v.name)} · {GENDER_TEXT[v.gender]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setShowLibrary((x) => !x)} className="text-xs underline">
            {showLibrary ? 'Ses kütüphanesini gizle' : 'Sesleri dinle / varsayılanı değiştir'}
          </button>
        </div>
      ) : null}
      {voices && showLibrary ? (
        <ReelsVoiceLibrary data={voices} onSaved={() => void loadVoices()} onUsageChange={() => void loadUsage()} />
      ) : null}

      <div className="space-y-2 rounded-xl border border-[rgb(var(--color-border))] p-3" data-reels-news>
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-[rgb(var(--color-muted))]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void loadNews(q)
            }}
            placeholder="Haber ara (başlıktan) — Enter"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button type="button" onClick={() => void loadNews(q)} className="rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-xs font-semibold">
            {newsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Ara'}
          </button>
        </div>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {news.map((n) => (
            <li key={n.newsId}>
              <button
                type="button"
                onClick={() => {
                  setPicked(n)
                  setInput(n.newsId)
                  setResult(null)
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[rgb(var(--color-surface))] ${picked?.newsId === n.newsId ? 'ring-2 ring-red-600' : ''}`}
              >
                {n.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={n.imageUrl} alt="" className="h-10 w-14 shrink-0 rounded object-cover" />
                ) : (
                  <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-[rgb(var(--color-border))]"><ImageIcon className="h-4 w-4" /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 font-semibold">{n.title}</span>
                  <span className="text-xs text-[rgb(var(--color-muted))]">
                    {n.category}
                    {n.city ? ` · ${n.city}` : ''}
                    {n.publishedAt ? ` · ${new Date(n.publishedAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                  </span>
                </span>
                {n.hasVideo ? (
                  <span className="inline-flex items-center gap-1 rounded bg-red-600/10 px-1.5 py-0.5 text-[10px] font-bold text-red-600"><Film className="h-3 w-3" />VİDEO</span>
                ) : null}
              </button>
            </li>
          ))}
          {!newsLoading && news.length === 0 ? <li className="px-2 text-xs text-[rgb(var(--color-muted))]">Haber bulunamadı.</li> : null}
        </ul>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Seçilen haber (ya da haber ID / düzenleme linki yapıştırın)"
          className="flex-1 rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy || !input.trim()}
          onClick={() => build(false)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
          Reels oluştur
        </button>
        <button
          type="button"
          disabled={busy || !input.trim()}
          onClick={() => build(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" /> Yeniden üret
        </button>
      </div>
      {busy ? <p className="text-xs text-[rgb(var(--color-muted))]">Video hazırlanıyor (genelde 15–40 sn)…</p> : null}
      {error ? <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{error}</p> : null}

      {result ? (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,320px)_1fr]">
          <video key={result.url + (result.seconds ?? '')} src={result.url} controls playsInline className="w-full rounded-xl bg-black" />
          <div className="space-y-2 text-sm">
            <p>
              <b>Medya:</b> {MEDIA_TEXT[result.media]}
              {result.mediaBasis ? <span className="text-[rgb(var(--color-muted))]"> ({result.mediaBasis})</span> : null}
            </p>
            {result.seconds ? <p><b>Süre:</b> {result.seconds.toFixed(1)} sn</p> : null}
            {result.voice ? <p><b>Ses:</b> {voiceLabel(result.voice)}{result.rate ? ` · hız ${result.rate}` : ''}</p> : null}
            {result.voiceText ? <p><b>Seslendirme:</b> {result.voiceText}</p> : null}
            {result.reused ? <p className="text-xs text-[rgb(var(--color-muted))]">Daha önce üretilmiş video gösteriliyor.</p> : null}
            <a href={result.url} target="_blank" rel="noreferrer" className="inline-block font-semibold text-blue-600 underline">
              MP4 indir / aç
            </a>
            <div className="mt-3 space-y-2 border-t border-[rgb(var(--color-border))] pt-3" data-reels-share>
              <p className="font-semibold">Sosyal medyada paylaş</p>
              <div className="flex gap-1.5 text-xs">
                {(['reel', 'video_story'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setShareFmt(shareFmt === f ? null : f)}
                    className={`rounded-full border px-3 py-1 font-bold ${shareFmt === f ? 'border-red-600 bg-red-600 text-white' : 'border-[rgb(var(--color-border))]'}`}
                  >
                    {f === 'reel' ? 'Reels olarak' : 'Video hikâye olarak'}
                  </button>
                ))}
              </div>
              {shareFmt ? (
                <ManualShareFlow key={shareFmt} newsId={result.newsId} newsTitle={picked?.title ?? result.newsId} mode={shareFmt} onClose={() => setShareFmt(null)} />
              ) : null}
              <p className="text-xs text-[rgb(var(--color-muted))]">Otomatik paylaşım için: SMM → Otomasyon kuralında «Reels» / «Video hikâye» biçimini işaretleyin.</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

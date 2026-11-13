'use client'

/**
 * TIKTOK-1 — TikTok post dialog (TikTok Content Sharing Guidelines):
 *   - creator info is fetched EVERY time an account is chosen; the creator's
 *     nickname is shown so the editor knows where the video goes
 *   - privacy: only the creator's options, NO default (must be picked)
 *   - Allow Comment / Duet / Stitch: unchecked by default; greyed out when the
 *     creator disabled them in TikTok
 *   - commercial content disclosure: off by default; when on, «Your brand» and/or
 *     «Branded content» must be chosen; branded content can't be «only me»
 *   - Music Usage (and Branded Content Policy) declaration before the button
 *   - preview of the video, editable caption, no NaHaber watermark added
 *   - nothing is sent until the editor presses «TikTok’ta paylaş»
 *   - after sending: «processing may take a few minutes», status is polled
 */
import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { reelsCall, runReelJob } from './reelsApi'
import { cn } from '@/lib/utils'

type Account = { accountId: string; displayName: string; selectable: boolean; reason: string | null }
type Privacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY'
type CreatorInfo = {
  nickname: string
  username: string | null
  avatarUrl: string | null
  privacyLevelOptions: Privacy[]
  commentDisabled: boolean
  duetDisabled: boolean
  stitchDisabled: boolean
  maxVideoPostDurationSec: number | null
}

const PRIVACY_TR: Record<Privacy, string> = {
  PUBLIC_TO_EVERYONE: 'Herkes',
  MUTUAL_FOLLOW_FRIENDS: 'Arkadaşlar (karşılıklı takip)',
  FOLLOWER_OF_CREATOR: 'Takipçiler',
  SELF_ONLY: 'Yalnızca ben',
}

const MUSIC_URL = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en'
const BRANDED_URL = 'https://www.tiktok.com/legal/page/global/bc-policy/en'

export function TikTokPostDialog({
  newsId,
  videoUrl,
  coverUrl = null,
  seconds: secondsProp,
  onFinished,
}: {
  newsId: string
  /** Omit (news-list shortcut) to use the story's saved reel returned by the API. */
  videoUrl?: string
  coverUrl?: string | null
  seconds?: number | null
  onFinished?: () => void
}) {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [hasVideo, setHasVideo] = useState(true)
  const [savedVideo, setSavedVideo] = useState<{ url: string; seconds: number | null } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [accountId, setAccountId] = useState('')
  const [info, setInfo] = useState<CreatorInfo | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)

  const [mode, setMode] = useState<'direct' | 'inbox'>('direct')
  const [privacy, setPrivacy] = useState<Privacy | ''>('')
  const [allowComment, setAllowComment] = useState(false)
  const [allowDuet, setAllowDuet] = useState(false)
  const [allowStitch, setAllowStitch] = useState(false)
  const [commercial, setCommercial] = useState(false)
  const [yourBrand, setYourBrand] = useState(false)
  const [brandedContent, setBrandedContent] = useState(false)
  const [aiGenerated, setAiGenerated] = useState(false)
  const [title, setTitle] = useState('')
  const [consent, setConsent] = useState(false)

  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string; publishId?: string } | null>(null)
  const [statusText, setStatusText] = useState<string | null>(null)

  const [reloadKey, setReloadKey] = useState(0)
  const [building, setBuilding] = useState(false)
  const [buildSec, setBuildSec] = useState(0)
  const [buildError, setBuildError] = useState<string | null>(null)

  // «Video oluştur»: render (or reuse) the story's NaHaber reel, then reload the dialog data.
  const buildVideo = async () => {
    if (building) return
    setBuilding(true)
    setBuildError(null)
    setBuildSec(0)
    const r = await runReelJob('/api/admin/social/tiktok', { newsId, prepare: true }, (ms) => setBuildSec(Math.round(ms / 1000)))
    setBuilding(false)
    if (!r.ok) return setBuildError(r.error)
    setReloadKey((k) => k + 1)
  }

  useEffect(() => {
    let off = false
    void reelsCall<{ accounts: Account[]; hasVideo: boolean; video?: { url: string; seconds: number | null } | null }>('GET', `/api/admin/social/tiktok?newsId=${encodeURIComponent(newsId)}`).then((r) => {
      if (off) return
      if (!r.ok) return setLoadError(r.error)
      setAccounts(r.data.accounts)
      setHasVideo(r.data.hasVideo)
      setSavedVideo(r.data.video ?? null)
    })
    return () => {
      off = true
    }
  }, [newsId, reloadKey])

  // Fresh creator info on every account choice (TikTok guideline).
  useEffect(() => {
    if (!accountId) return
    let off = false
    setInfo(null)
    setInfoError(null)
    setInfoLoading(true)
    setPrivacy('')
    setAllowComment(false)
    setAllowDuet(false)
    setAllowStitch(false)
    void reelsCall<{ info: CreatorInfo; defaultTitle: string }>(
      'GET',
      `/api/admin/social/tiktok?newsId=${encodeURIComponent(newsId)}&accountId=${encodeURIComponent(accountId)}&info=1`,
    ).then((r) => {
      if (off) return
      setInfoLoading(false)
      if (!r.ok) return setInfoError(r.error)
      setInfo(r.data.info)
      setTitle((t) => t || r.data.defaultTitle.slice(0, 2200))
    })
    return () => {
      off = true
    }
  }, [accountId, newsId])

  // Branded content can't be private.
  useEffect(() => {
    if (commercial && brandedContent && privacy === 'SELF_ONLY') setPrivacy('')
  }, [commercial, brandedContent, privacy])

  const previewUrl = videoUrl ?? savedVideo?.url ?? ''
  const seconds = secondsProp !== undefined ? secondsProp : (savedVideo?.seconds ?? null)
  const tooLong = !!info?.maxVideoPostDurationSec && seconds !== null && seconds > info.maxVideoPostDurationSec
  const blocker = useMemo(() => {
    if (!accountId) return 'TikTok hesabı seçin'
    if (!info) return infoError ? 'Hesap bilgisi alınamadı' : 'Hesap bilgisi yükleniyor'
    if (tooLong) return `Video bu hesap için çok uzun (en fazla ${info.maxVideoPostDurationSec} sn)`
    if (mode === 'direct' && !privacy) return 'Kimlerin görebileceğini seçin'
    if (commercial && !yourBrand && !brandedContent) return 'Ticari içerik için «Kendi markanız» veya «Markalı içerik» seçin'
    if (!title.trim()) return 'Başlık yazın'
    if (!consent) return 'Müzik kullanım onayını işaretleyin'
    return null
  }, [accountId, info, infoError, tooLong, mode, privacy, commercial, yourBrand, brandedContent, title, consent])

  const send = async () => {
    if (blocker || sending) return
    setSending(true)
    setResult(null)
    setStatusText(null)
    const r = await reelsCall<{ result: { success: boolean; error?: string; publishId?: string; tiktokStatus?: string | null } }>('POST', '/api/admin/social/tiktok', {
      newsId,
      accountId,
      settings: { mode, privacyLevel: mode === 'direct' ? privacy : null, allowComment, allowDuet, allowStitch, commercial, yourBrand, brandedContent, aiGenerated, title, consent },
    })
    setSending(false)
    if (!r.ok) return setResult({ ok: false, text: r.error })
    const res = r.data.result
    if (!res.success) return setResult({ ok: false, text: res.error ?? 'TikTok paylaşımı başarısız' })
    setResult({ ok: true, text: 'TikTok’a gönderildi. İşlenmesi birkaç dakika sürebilir; durum aşağıda güncellenir.', publishId: res.publishId })
    onFinished?.()
  }

  // Poll TikTok's processing status (≤ 10 min, every 10 s).
  useEffect(() => {
    if (!result?.ok || !result.publishId) return
    let off = false
    let n = 0
    const tick = async () => {
      if (off || n++ > 60) return
      const r = await reelsCall<{ status: string | null; text: string }>(
        'GET',
        `/api/admin/social/tiktok?accountId=${encodeURIComponent(accountId)}&publishId=${encodeURIComponent(result.publishId!)}`,
      )
      if (off) return
      if (r.ok) {
        setStatusText(r.data.text)
        if (r.data.status === 'PUBLISH_COMPLETE' || r.data.status === 'FAILED' || r.data.status === 'SEND_TO_USER_INBOX') return
      }
      setTimeout(() => void tick(), 10_000)
    }
    void tick()
    return () => {
      off = true
    }
  }, [result, accountId])

  if (loadError) return <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{loadError}</p>
  if (!accounts) return <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…</p>
  if (accounts.length === 0) return <p className="text-sm">Bağlı TikTok hesabı yok. Hesaplar ekranından «TikTok hesabı» bağlayın.</p>
  if (!hasVideo)
    return (
      <div className="space-y-2 text-sm">
        <p>Bu haberin videosu henüz yok.</p>
        {accounts.some((a) => a.selectable) ? (
          <button
            type="button"
            onClick={() => void buildVideo()}
            disabled={building}
            className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-1.5 font-bold text-white disabled:opacity-60"
          >
            {building ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {building ? `Video hazırlanıyor… ${buildSec} sn` : 'Video oluştur'}
          </button>
        ) : (
          <p className="text-xs text-[rgb(var(--color-muted))]">Bu haber için kullanılabilir TikTok hesabı yok: {accounts[0]?.reason ?? 'hesap seçilemiyor'}</p>
        )}
        {building ? <p className="text-xs text-[rgb(var(--color-muted))]">Video oluşturma 1–3 dakika sürebilir; pencereyi kapatmayın. Hazır olunca paylaşım ayarları açılır.</p> : null}
        {buildError ? <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">Video oluşturulamadı: {buildError}</p> : null}
      </div>
    )

  const box = 'rounded-lg border border-[rgb(var(--color-border))] p-2'
  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold">TikTok hesabı</span>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5">
          <option value="">Seçin…</option>
          {accounts.map((a) => (
            <option key={a.accountId} value={a.accountId} disabled={!a.selectable}>
              {a.displayName}
              {a.reason ? ` — ${a.reason}` : ''}
            </option>
          ))}
        </select>
      </label>

      {infoLoading ? <p className="flex items-center gap-2 text-xs"><Loader2 className="h-3 w-3 animate-spin" /> TikTok hesap bilgisi alınıyor…</p> : null}
      {infoError ? <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{infoError} — paylaşım şu an yapılamaz, daha sonra tekrar deneyin.</p> : null}

      {info ? (
        <>
          <div className="flex items-center gap-2 rounded-lg bg-[rgb(var(--color-surface))] p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- TikTok avatar (2 h signed URL), not optimisable */}
            {info.avatarUrl ? <img src={info.avatarUrl} alt="" className="h-8 w-8 rounded-full" /> : null}
            <p>
              Gönderilecek hesap: <b>{info.nickname}</b>
              {info.username ? <span className="text-[rgb(var(--color-muted))]"> (@{info.username})</span> : null}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <video src={previewUrl} poster={coverUrl ?? undefined} controls playsInline className="w-full rounded-lg bg-black" aria-label="Video önizleme" />
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Başlık ve etiketler (düzenleyebilirsiniz)</span>
              <textarea value={title} onChange={(e) => setTitle(e.target.value.slice(0, 2200))} rows={7} className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent p-2 text-xs" />
              <span className="text-[10px] text-[rgb(var(--color-muted))]">{title.length}/2200</span>
            </label>
          </div>
          {tooLong ? <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">Video {Math.round(seconds!)} sn; bu hesap en fazla {info.maxVideoPostDurationSec} sn kabul ediyor.</p> : null}

          <div className={box}>
            <span className="mb-1 block text-xs font-semibold">Paylaşım şekli</span>
            <label className="mr-3 inline-flex items-center gap-1.5"><input type="radio" checked={mode === 'direct'} onChange={() => setMode('direct')} /> Doğrudan yayımla</label>
            <label className="inline-flex items-center gap-1.5"><input type="radio" checked={mode === 'inbox'} onChange={() => setMode('inbox')} /> TikTok’a taslak gönder (uygulamadan tamamlanır)</label>
          </div>

          {mode === 'direct' ? (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Bu videoyu kimler görebilir?</span>
              <select value={privacy} onChange={(e) => setPrivacy(e.target.value as Privacy)} className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5">
                <option value="">Seçin…</option>
                {info.privacyLevelOptions.map((p) => (
                  <option key={p} value={p} disabled={p === 'SELF_ONLY' && commercial && brandedContent} title={p === 'SELF_ONLY' && commercial && brandedContent ? 'Markalı içerik gizli olamaz' : undefined}>
                    {PRIVACY_TR[p]}
                    {p === 'SELF_ONLY' && commercial && brandedContent ? ' (markalı içerik gizli olamaz)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className={cn(box, 'space-y-1')}>
            <span className="block text-xs font-semibold">Etkileşim izinleri</span>
            {(
              [
                ['Yorumlara izin ver', allowComment, setAllowComment, info.commentDisabled],
                ['Duet’e izin ver', allowDuet, setAllowDuet, info.duetDisabled],
                ['Stitch’e izin ver', allowStitch, setAllowStitch, info.stitchDisabled],
              ] as const
            ).map(([label, val, set, disabled]) => (
              <label key={label} className={cn('flex items-center gap-1.5', disabled && 'opacity-50')} title={disabled ? 'Bu hesabın TikTok ayarlarında kapalı' : undefined}>
                <input type="checkbox" checked={val} disabled={disabled} onChange={(e) => set(e.target.checked)} />
                {label}
                {disabled ? <span className="text-[10px]"> (TikTok ayarlarında kapalı)</span> : null}
              </label>
            ))}
          </div>

          <div className={cn(box, 'space-y-1')}>
            <label className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">Ticari içerik bildirimi</span>
              <input type="checkbox" role="switch" checked={commercial} onChange={(e) => (setCommercial(e.target.checked), e.target.checked ? null : (setYourBrand(false), setBrandedContent(false)))} />
            </label>
            <p className="text-[11px] text-[rgb(var(--color-muted))]">Video bir ürün, marka veya hizmeti tanıtıyorsa açın.</p>
            {commercial ? (
              <div className="space-y-1 pl-1">
                <label className="flex items-start gap-1.5">
                  <input type="checkbox" checked={yourBrand} onChange={(e) => setYourBrand(e.target.checked)} className="mt-0.5" />
                  <span>Kendi markanız <span className="block text-[10px] text-[rgb(var(--color-muted))]">Video «Tanıtım içeriği» (Promotional content) olarak etiketlenir.</span></span>
                </label>
                <label className="flex items-start gap-1.5">
                  <input type="checkbox" checked={brandedContent} onChange={(e) => setBrandedContent(e.target.checked)} className="mt-0.5" />
                  <span>Markalı içerik <span className="block text-[10px] text-[rgb(var(--color-muted))]">Video «Ücretli iş birliği» (Paid partnership) olarak etiketlenir.</span></span>
                </label>
                {!yourBrand && !brandedContent ? <p className="text-[11px] text-amber-700">En az birini seçmeniz gerekir.</p> : null}
              </div>
            ) : null}
          </div>

          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={aiGenerated} onChange={(e) => setAiGenerated(e.target.checked)} />
            Video yapay zekâ ile üretildi (sunucu / seslendirme)
          </label>

          <label className="flex items-start gap-1.5 text-xs">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>
              Paylaşarak TikTok’un{' '}
              {commercial && brandedContent ? (
                <>
                  <a href={BRANDED_URL} target="_blank" rel="noopener noreferrer" className="underline">Markalı İçerik Politikası</a> ve{' '}
                </>
              ) : null}
              <a href={MUSIC_URL} target="_blank" rel="noopener noreferrer" className="underline">Müzik Kullanım Onayı</a>’nı kabul ediyorum.
            </span>
          </label>

          <button
            type="button"
            onClick={() => void send()}
            disabled={!!blocker || sending || !!result?.ok}
            title={blocker ?? undefined}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-3 py-2 font-bold text-white disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {sending ? 'Gönderiliyor…' : 'TikTok’ta paylaş'}
          </button>
          {blocker && !result ? <p className="text-[11px] text-[rgb(var(--color-muted))]">{blocker}</p> : null}
        </>
      ) : null}

      {result ? <p className={cn('rounded-lg p-2 text-xs', result.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>{result.text}</p> : null}
      {statusText ? <p className="rounded-lg bg-[rgb(var(--color-surface))] p-2 text-xs">Durum: {statusText}</p> : null}
    </div>
  )
}

'use client'

/**
 * «Hesabımda yayımla»: İçerik → hesap → desteklenen biçim → önizleme → onay.
 * Always an explicit target account (never a silent fallback to the legacy
 * connection). Success is shown only with the platform's post id.
 * «Bağlantıyı paylaş» is a separate action: it only shares the news link from
 * the user's own device and never calls a platform API.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, Loader2, Send, Share2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { TARGET_BLOCKER_TEXT, type PublishFormat } from '@/lib/social/accounts/capabilities'
import { PLATFORM_LABEL, socialApi, type SocialAccountRow, type SocialMe } from './socialClient'

type NewsItem = {
  newsId: string
  title: string
  publishedAt: number | null
  citySlug: string | null
  imageUrl: string | null
  url: string
  eligible: boolean
  code: string | null
  reason: string | null
  action: string | null
}

type ShareResult = { status: 'published' | 'already_published'; platformId: string | null; account: string; platform: string; format: PublishFormat }

const FORMAT_LABEL: Record<PublishFormat, string> = { post: 'Görselli gönderi', story: 'Hikâye' }

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[rgb(var(--color-border))] p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[rgb(var(--color-text))]">
        <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[11px]', done ? 'bg-emerald-600 text-white' : 'bg-[rgb(var(--color-surface))]')}>{n}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}

export async function shareLink(url: string, title: string) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title, url })
      return
    }
    await navigator.clipboard.writeText(url)
    toast.success('Haber bağlantısı kopyalandı.')
  } catch {
    // User cancelled the share sheet or clipboard is unavailable — nothing was posted anywhere.
  }
}

export function ShareComposer({ publisherId, accountFilter }: { publisherId?: string; accountFilter?: (a: SocialAccountRow) => boolean }) {
  const [me, setMe] = useState<SocialMe | null>(null)
  const [news, setNews] = useState<NewsItem[]>([])
  const [accounts, setAccounts] = useState<SocialAccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newsId, setNewsId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [format, setFormat] = useState<PublishFormat | ''>('')
  const [confirmed, setConfirmed] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: true; r: ShareResult } | { ok: false; text: string; action?: string; uncertain: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [m, n, a] = await Promise.all([
      socialApi<SocialMe>('/api/social/me'),
      socialApi<{ items: NewsItem[] }>(`/api/social/news${publisherId ? `?publisherId=${encodeURIComponent(publisherId)}` : ''}`),
      socialApi<{ accounts: SocialAccountRow[] }>('/api/social/accounts'),
    ])
    if (!n.ok || !a.ok) setError((!n.ok ? n.error : !a.ok ? a.error : '') || 'Yüklenemedi')
    if (m.ok) setMe(m.data)
    if (n.ok) setNews(n.data.items)
    if (a.ok) setAccounts(a.data.accounts.filter((x) => x.canPublish))
    setLoading(false)
  }, [publisherId])

  useEffect(() => {
    void load()
  }, [load])

  const item = news.find((x) => x.newsId === newsId) ?? null
  const targets = useMemo(() => (accountFilter ? accounts.filter(accountFilter) : accounts), [accounts, accountFilter])
  const account = targets.find((a) => a.id === accountId) ?? null
  // Staff may still share external news they already judged manually (server re-checks scope).
  const itemSelectable = (x: NewsItem) => x.eligible || (x.code === 'needs_social_review' && !!me?.staff)

  useEffect(() => {
    setConfirmed(false)
    setResult(null)
  }, [newsId, accountId, format])
  useEffect(() => {
    if (account && format && !account.formats.includes(format)) setFormat('')
    if (account && !format && account.formats.length === 1) setFormat(account.formats[0])
  }, [account, format])

  const publish = async () => {
    if (!item || !account || !format || !confirmed) return
    setSending(true)
    const r = await socialApi<{ result: ShareResult }>('/api/social/share', { method: 'POST', body: JSON.stringify({ newsId: item.newsId, accountId: account.id, format }) })
    setSending(false)
    if (r.ok) {
      setResult({ ok: true, r: r.data.result })
      toast.success(r.data.result.status === 'published' ? 'Platform gönderiyi kabul etti.' : 'Bu haber bu hesapta zaten yayımlanmış.')
      return
    }
    const uncertain = r.status === 202
    setResult({
      ok: false,
      uncertain,
      text: uncertain ? 'Platformdan kesin yanıt alınamadı. Gönderi yayımlanmış olabilir; tekrar denemeyin — sonuç Paylaşım geçmişinde doğrulanacak.' : r.error,
      action: r.action,
    })
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-[rgb(var(--color-muted))]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Yükleniyor…
      </p>
    )
  }
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>

  return (
    <div className="space-y-3">
      <Step n={1} title="İçerik" done={!!item}>
        {news.length === 0 ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">Yayında haber bulunamadı.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-auto" aria-label="Haberler">
            {news.map((x) => {
              const ok = itemSelectable(x)
              return (
                <li key={x.newsId} className={cn('rounded-lg px-2 py-1.5', newsId === x.newsId && 'bg-blue-50 dark:bg-blue-950/30')}>
                  <div className="flex items-start gap-2">
                    <input type="radio" name="share-news" className="mt-1" checked={newsId === x.newsId} disabled={!ok} onChange={() => setNewsId(x.newsId)} aria-label={x.title} />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm', ok ? 'text-[rgb(var(--color-text))]' : 'text-[rgb(var(--color-muted))]')}>{x.title}</p>
                      {!x.eligible && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300">
                          {x.reason} — {x.action}
                          {ok ? ' (editör yetkinizle manuel paylaşabilirsiniz)' : ''}
                        </p>
                      )}
                    </div>
                    <button type="button" onClick={() => void shareLink(x.url, x.title)} className="shrink-0 rounded-md border border-[rgb(var(--color-border))] px-1.5 py-1 text-[11px]" title="Yalnızca haber bağlantısını paylaşır; hesabınızda gönderi oluşturmaz">
                      <Share2 className="inline h-3 w-3" aria-hidden /> Bağlantıyı paylaş
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Step>

      <Step n={2} title="Hesap" done={!!account}>
        {targets.length === 0 ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">Yayın yapabileceğiniz bağlı hesap yok. Önce «Hesaplarım» bölümünden platform girişiyle bir hesap bağlayın.</p>
        ) : (
          <ul className="space-y-1">
            {targets.map((a) => {
              const blocker = a.health.publishBlocker
              return (
                <li key={a.id}>
                  <label className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm', blocker ? 'opacity-60' : 'cursor-pointer hover:bg-[rgb(var(--color-surface))]')}>
                    <input type="radio" name="share-account" disabled={!!blocker} checked={accountId === a.id} onChange={() => setAccountId(a.id)} />
                    <span className="font-semibold">{a.displayName}</span>
                    <span className="text-xs text-[rgb(var(--color-muted))]">
                      {PLATFORM_LABEL[a.platform]}
                      {a.username ? ` · @${a.username}` : ''}
                    </span>
                    <span className={cn('ml-auto text-[11px]', blocker ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300')}>{blocker ? TARGET_BLOCKER_TEXT[blocker] : 'hazır'}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </Step>

      <Step n={3} title="Biçim" done={!!format}>
        {!account ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">Önce hesap seçin.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(['post', 'story'] as PublishFormat[]).map((f) => {
              const supported = account.formats.includes(f)
              return (
                <label key={f} className={cn('flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1.5 text-sm', !supported && 'opacity-50')}>
                  <input type="radio" name="share-format" disabled={!supported} checked={format === f} onChange={() => setFormat(f)} />
                  {FORMAT_LABEL[f]}
                  {!supported && <span className="text-[11px]">(bu hesapta desteklenmiyor)</span>}
                </label>
              )
            })}
            <span className="w-full text-[11px] text-[rgb(var(--color-muted))]">Reels/video ve kaydırmalı gönderi bu akışta henüz yok; doğrulanmış bir yayın bağdaştırıcısı olmadan gösterilmez.</span>
          </div>
        )}
      </Step>

      <Step n={4} title="Önizleme ve onay" done={!!result?.ok}>
        {!item || !account || !format ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">İçerik, hesap ve biçim seçildiğinde önizleme burada görünür.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt="" className={cn('shrink-0 rounded-lg object-cover', format === 'story' ? 'h-36 w-20' : 'h-24 w-24')} />
              ) : null}
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
                  Hedef: <b>{account.displayName}</b> · {PLATFORM_LABEL[account.platform]} · {FORMAT_LABEL[format]}
                </p>
                <p className="mt-1 text-[11px] text-[rgb(var(--color-muted))]">Metin NaHaber şablonuyla haber başlığından oluşturulur; yapay zekâ yeniden yazımı kapalıdır. Aynı haber bu hesapta ikinci kez yayımlanmaz.</p>
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
              <span>
                Bu haberi <b>{account.displayName}</b> ({PLATFORM_LABEL[account.platform]}) hesabında {FORMAT_LABEL[format].toLocaleLowerCase('tr-TR')} olarak yayımlamayı onaylıyorum.
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!confirmed || sending || !!result?.ok} onClick={() => void publish()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Hesabımda yayımla
              </button>
              <button type="button" onClick={() => void shareLink(item.url, item.title)} className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm">
                <Copy className="h-4 w-4" aria-hidden /> Bağlantıyı paylaş
              </button>
            </div>
          </div>
        )}
        {result && (
          <div role="status" className={cn('mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm', result.ok ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100')}>
            {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
            <div>
              {result.ok ? (
                <>
                  <p className="font-semibold">{result.r.status === 'published' ? 'Yayımlandı — platform gönderiyi kabul etti' : 'Zaten yayımlanmış — tekrar gönderilmedi'}</p>
                  <p className="text-xs">
                    {result.r.account} · {PLATFORM_LABEL[result.r.platform] ?? result.r.platform} · {FORMAT_LABEL[result.r.format]}
                    {result.r.platformId ? ` · gönderi kimliği ${result.r.platformId}` : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">{result.uncertain ? 'Sonuç belirsiz' : 'Yayımlanmadı'}</p>
                  <p className="text-xs">{result.text}</p>
                  {result.action && <p className="text-xs">Gerekli işlem: {result.action}</p>}
                </>
              )}
            </div>
          </div>
        )}
      </Step>
    </div>
  )
}

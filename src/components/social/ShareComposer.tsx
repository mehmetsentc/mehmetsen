'use client'

/**
 * «Hesabımda yayımla»: İçerik → biçim → hesaplar (ortak çoklu seçici) → onay →
 * hesap bazlı sonuç. Always explicit target accounts (never a silent fallback
 * to the legacy connection). Each account is published through /api/social/share
 * one after another (bounded), with its own server checks and ledger lock;
 * success is shown only with the platform's post id.
 * «Bağlantıyı paylaş» is a separate action: it only shares the news link from
 * the user's own device and never calls a platform API.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Loader2, RotateCcw, Send, Share2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { PublishFormat } from '@/lib/social/accounts/capabilities'
import { ComposerTargetPicker, EMPTY_TARGETS, selectedLabels, targetCount, type TargetOption, type TargetPlatform, type TargetSelection } from '@/components/admin/social/ComposerTargetPicker'
import { TargetResultList } from '@/components/admin/social/ManualShareFlow'
import { describeTargetRow, isSafelyRetryable, OVERALL_HEADLINE, overallShareState, rowAsResult, type TargetRowLike } from '@/lib/social/shareResultText'
import { showShareToast } from '@/lib/social/shareToast'
import { socialApi, type SocialAccountRow, type SocialMe } from './socialClient'

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
  const [format, setFormat] = useState<PublishFormat>('post')
  const [targets, setTargets] = useState<TargetSelection>(EMPTY_TARGETS)
  const [options, setOptions] = useState<TargetOption[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [sending, setSending] = useState(false)
  const [rows, setRows] = useState<TargetRowLike[]>([])
  const [retry, setRetry] = useState<string[]>([])

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
  const allowed = useMemo(() => new Set((accountFilter ? accounts.filter(accountFilter) : accounts).map((a) => a.id)), [accounts, accountFilter])
  const include = useCallback((o: TargetOption) => allowed.has(o.accountId), [allowed])
  // Staff may still share external news they already judged manually (server re-checks scope).
  const itemSelectable = (x: NewsItem) => x.eligible || (x.code === 'needs_social_review' && !!me?.staff)
  const effective: TargetSelection = format === 'story' ? { ...targets, threads: [] } : targets
  const count = targetCount(effective)

  useEffect(() => {
    setConfirmed(false)
  }, [newsId, format, targets])
  useEffect(() => {
    setTargets(EMPTY_TARGETS)
    setRows([])
  }, [newsId])

  /** One account at a time (bounded); each call is fully checked server-side and has its own ledger lock. */
  const publish = async (sel: TargetSelection) => {
    if (!item || targetCount(sel) === 0) return
    setSending(true)
    const out: TargetRowLike[] = []
    const byId = new Map(options.map((o) => [o.accountId, o]))
    for (const p of ['facebook', 'instagram', 'threads'] as TargetPlatform[]) {
      for (const accountId of sel[p]) {
        const r = await socialApi<{ result: ShareResult }>('/api/social/share', { method: 'POST', body: JSON.stringify({ newsId: item.newsId, accountId, format }) })
        const name = byId.get(accountId) ? `${byId.get(accountId)!.displayName}${byId.get(accountId)!.username ? ` (@${byId.get(accountId)!.username})` : ''}` : accountId
        // 202 = belirsiz (gövdede sonuç yok): yayımlanmış olabilir, otomatik tekrar yok.
        if (r.ok && !r.data?.result) {
          out.push({ platform: p, accountId, accountName: name, format, success: false, code: 'uncertain', error: 'Platformdan kesin yanıt alınamadı; otomatik tekrar yok', ledgerStatus: 'uncertain', externalPostId: null })
        } else if (r.ok) {
          const already = r.data.result.status === 'already_published'
          out.push({ platform: p, accountId, accountName: name, format, success: !already, code: already ? 'already_published' : null, error: null, ledgerStatus: 'succeeded', externalPostId: r.data.result.platformId })
        } else {
          const uncertain = r.status === 202
          out.push({ platform: p, accountId, accountName: name, format, success: false, code: uncertain ? 'uncertain' : (r.code ?? 'failed'), error: uncertain ? 'Platformdan kesin yanıt alınamadı; otomatik tekrar yok' : r.error, ledgerStatus: uncertain ? 'uncertain' : 'failed', externalPostId: null })
        }
        setRows([...out])
      }
    }
    setSending(false)
    setRetry([])
    setConfirmed(false)
    showShareToast(overallShareState(out.map(rowAsResult)), out.map(describeTargetRow))
  }

  const retrySelection = (): TargetSelection => {
    const sel: TargetSelection = { facebook: [], instagram: [], threads: [] }
    for (const r of rows) if (retry.includes(`${r.accountId}__${r.format}`) && isSafelyRetryable(r)) sel[r.platform as TargetPlatform].push(r.accountId)
    return sel
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-[rgb(var(--color-muted))]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Yükleniyor…
      </p>
    )
  }
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>

  const overall = rows.length ? overallShareState(rows.map(rowAsResult)) : null
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

      <Step n={2} title="Biçim" done={!!item}>
        <div className="flex flex-wrap gap-2">
          {(['post', 'story'] as PublishFormat[]).map((f) => (
            <label key={f} className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1.5 text-sm">
              <input type="radio" name="share-format" checked={format === f} onChange={() => setFormat(f)} />
              {FORMAT_LABEL[f]}
            </label>
          ))}
          <span className="w-full text-[11px] text-[rgb(var(--color-muted))]">Biçim değişince hesaplar yeniden değerlendirilir. Reels/video ve kaydırmalı gönderi bu akışta henüz yok.</span>
        </div>
      </Step>

      <Step n={3} title="Hesaplar" done={count > 0}>
        {!item ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">Önce içerik seçin.</p>
        ) : allowed.size === 0 ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">
            Yayın yapabileceğiniz bağlı hesap yok.{' '}
            <Link href="/settings/social?tab=accounts" className="font-semibold underline">
              Önce hesap bağla
            </Link>
          </p>
        ) : (
          <ComposerTargetPicker newsId={item.newsId} mode={format} value={targets} onChange={setTargets} onOptions={setOptions} include={include} />
        )}
      </Step>

      <Step n={4} title="Onay ve sonuç" done={overall === 'published'}>
        {!item || count === 0 ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">İçerik, biçim ve en az bir hesap seçildiğinde onay burada görünür.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt="" className={cn('shrink-0 rounded-lg object-cover', format === 'story' ? 'h-36 w-20' : 'h-24 w-24')} />
              ) : null}
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">Biçim: <b>{FORMAT_LABEL[format]}</b> · {count} hedef</p>
                <ul className="mt-1 list-disc pl-4 text-xs font-semibold">
                  {selectedLabels(effective, options).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-[rgb(var(--color-muted))]">Metin NaHaber şablonuyla haber başlığından oluşturulur; yapay zekâ yeniden yazımı kapalıdır. Her hesap ayrı yayımlanır; aynı haber bir hesapta ikinci kez yayımlanmaz.</p>
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
              <span>
                Bu haberi yukarıdaki <b>{count} hesapta</b> {FORMAT_LABEL[format].toLocaleLowerCase('tr-TR')} olarak yayımlamayı onaylıyorum.
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!confirmed || sending} onClick={() => void publish(effective)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} {count} hesapta yayımla
              </button>
              <button type="button" onClick={() => void shareLink(item.url, item.title)} className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm">
                <Copy className="h-4 w-4" aria-hidden /> Bağlantıyı paylaş
              </button>
            </div>
          </div>
        )}
        {rows.length > 0 && (
          <div role="status" className="mt-3 space-y-2">
            {overall && <p className={cn('text-sm font-bold', overall === 'published' ? 'text-emerald-700 dark:text-emerald-300' : overall === 'failed' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300')}>{OVERALL_HEADLINE[overall]}</p>}
            <TargetResultList rows={rows} retry={retry} onToggleRetry={(k) => setRetry((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))} />
            {rows.some(isSafelyRetryable) && (
              <button type="button" disabled={retry.length === 0 || sending} onClick={() => void publish(retrySelection())} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-600 px-3 py-1.5 text-xs font-bold text-blue-700 disabled:opacity-40 dark:text-blue-300">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Seçilen başarısız hedefleri yeniden dene ({retry.length})
              </button>
            )}
          </div>
        )}
      </Step>
    </div>
  )
}

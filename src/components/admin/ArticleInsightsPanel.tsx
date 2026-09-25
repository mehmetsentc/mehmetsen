'use client'

import { useCallback, useEffect, useState } from 'react'
import { Eye, Heart, MessageCircle, Bookmark, Share2, Clock, Monitor, RefreshCw } from 'lucide-react'
import { auth } from '@/lib/firebase/auth'
import { formatCount } from '@/lib/postUtils'
import { formatDurationCompact } from '@/lib/feed/articleEngagement'
import { cn } from '@/lib/utils'

type InsightsPayload = {
  articleId: string
  headline: string
  totals: {
    views: number
    likes: number
    comments: number
    saves: number
    shares: number
    contentDurationMs: number
    pageDurationMs: number
    watchSessionCount: number
    pageSessionCount: number
    avgContentDurationMs: number
    avgPageDurationMs: number
  }
  recentSessions: Array<{
    id: string
    surface: string
    actorLabel: string
    signedIn: boolean
    viewCounted: boolean
    contentDwellMs: number
    pageDwellMs: number
    lastAt: string
  }>
}

const SURFACE_LABEL: Record<string, string> = {
  feed: 'Feed',
  story: 'Hikâye',
  reader: 'Okuyucu',
  page: 'Sayfa',
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string
  hint?: string
  icon: typeof Eye
}) {
  return (
    <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--color-muted))]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 text-lg font-black tabular-nums text-[rgb(var(--color-text))]">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-[rgb(var(--color-muted))]">{hint}</p> : null}
    </div>
  )
}

export function ArticleInsightsPanel({ articleId }: { articleId: string }) {
  const [data, setData] = useState<InsightsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { ensureAuthReady } = await import('@/lib/firebase/auth')
      await ensureAuthReady()
      const token = await auth.currentUser?.getIdToken()
      if (!token) {
        setError('Oturum gerekli')
        setData(null)
        return
      }
      const res = await fetch(`/api/admin/news/${encodeURIComponent(articleId)}/insights`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? `Yükleme başarısız (${res.status})`)
        setData(null)
        return
      }
      setData((await res.json()) as InsightsPayload)
    } catch {
      setError('Insights yüklenemedi')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [articleId])

  useEffect(() => {
    void load()
  }, [load])

  const t = data?.totals

  return (
    <section
      className="mb-6 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-elevated))] p-4 md:p-5"
      data-testid="article-insights-panel"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-[rgb(var(--color-text))]">Haber Insights</h2>
          <p className="mt-0.5 text-xs text-[rgb(var(--color-muted))]">
            Süre ve ortalama yalnızca admin. Sitede sadece sayılar görünür.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1.5 text-xs font-semibold text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-nav-hover))]"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Yenile
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {t ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Görüntüleme" value={formatCount(t.views)} icon={Eye} />
            <StatCard label="Beğeni" value={formatCount(t.likes)} icon={Heart} />
            <StatCard label="Yorum" value={formatCount(t.comments)} icon={MessageCircle} />
            <StatCard label="Kaydet" value={formatCount(t.saves)} icon={Bookmark} />
            <StatCard label="Paylaş" value={formatCount(t.shares)} icon={Share2} />
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="İçerik süresi"
              value={formatDurationCompact(t.contentDurationMs)}
              hint={`${formatCount(t.watchSessionCount)} oturum`}
              icon={Clock}
            />
            <StatCard
              label="Ort. içerik"
              value={formatDurationCompact(t.avgContentDurationMs)}
              hint="süre / oturum"
              icon={Clock}
            />
            <StatCard
              label="Sayfa süresi"
              value={formatDurationCompact(t.pageDurationMs)}
              hint={`${formatCount(t.pageSessionCount)} sayfa oturumu`}
              icon={Monitor}
            />
            <StatCard
              label="Ort. sayfa durma"
              value={formatDurationCompact(t.avgPageDurationMs)}
              hint="sayfa süresi / sayfa oturumu"
              icon={Monitor}
            />
          </div>

          <h3 className="mt-5 mb-2 text-sm font-bold text-[rgb(var(--color-text))]">
            Son oturumlar
          </h3>
          {data.recentSessions.length === 0 ? (
            <p className="text-sm text-[rgb(var(--color-muted))]">Henüz kayıtlı oturum yok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="text-[rgb(var(--color-muted))]">
                  <tr>
                    <th className="pb-2 pr-3 font-medium">Kim</th>
                    <th className="pb-2 pr-3 font-medium">Yüzey</th>
                    <th className="pb-2 pr-3 font-medium">İçerik</th>
                    <th className="pb-2 pr-3 font-medium">Sayfa</th>
                    <th className="pb-2 font-medium">Son</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSessions.map((row) => (
                    <tr key={row.id} className="border-t border-[rgb(var(--color-border))]">
                      <td className="py-2 pr-3 font-medium text-[rgb(var(--color-text))]">
                        {row.actorLabel}
                        {row.viewCounted ? (
                          <span className="ml-1.5 text-[10px] font-normal text-[rgb(var(--color-muted))]">
                            görüntülendi
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">{SURFACE_LABEL[row.surface] ?? row.surface}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {formatDurationCompact(row.contentDwellMs)}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {formatDurationCompact(row.pageDwellMs)}
                      </td>
                      <td className="py-2 tabular-nums text-[rgb(var(--color-muted))]">
                        {new Date(row.lastAt).toLocaleString('tr-TR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : loading ? (
        <p className="text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</p>
      ) : null}
    </section>
  )
}

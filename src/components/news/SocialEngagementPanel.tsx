'use client'

/**
 * «Sosyal medyada» — platform counts and editor-approved comments of the
 * NaHaber posts made for this news item / video. Loaded lazily (when the block
 * scrolls into view or the video comment sheet opens) from a CDN-cached
 * endpoint; renders nothing when there is no social data. Platform numbers are
 * kept separate from NaHaber's own likes / views.
 */
import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Eye, Heart, MessageCircle, Repeat2 } from 'lucide-react'
import { formatCountTr, PLATFORM_TR, type EngagementMetrics, type PublicEngagement } from '@/lib/social/engagement/model'
import { cn } from '@/lib/utils'

const METRICS: Array<{ key: keyof EngagementMetrics; label: string; Icon: typeof Eye }> = [
  { key: 'views', label: 'görüntülenme', Icon: Eye },
  { key: 'likes', label: 'beğeni', Icon: Heart },
  { key: 'comments', label: 'yorum', Icon: MessageCircle },
  { key: 'shares', label: 'paylaşım', Icon: Repeat2 },
]

const ago = (t: number | null) => {
  if (!t) return ''
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 60) return `${Math.max(1, m)} dk önce`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} sa önce`
  return new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

function hasData(e: PublicEngagement | null): e is PublicEngagement {
  return !!e && (Object.keys(e.totals ?? {}).length > 0 || e.comments.length > 0)
}

export function SocialEngagementPanel({ newsId, slug, active = true, className }: { newsId: string; slug?: string | null; active?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [data, setData] = useState<PublicEngagement | null>(null)

  useEffect(() => {
    if (!active || visible) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true)
        io.disconnect()
      }
    }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [active, visible])

  useEffect(() => {
    if (!visible || !newsId) return
    let cancelled = false
    const q = slug ? `?slug=${encodeURIComponent(slug)}` : ''
    fetch(`/api/social-engagement/${encodeURIComponent(newsId)}${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { engagement?: PublicEngagement | null } | null) => {
        if (!cancelled) setData(b?.engagement ?? null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [visible, newsId, slug])

  if (!hasData(data)) return <div ref={ref} aria-hidden className="h-px" />

  const links = data.platforms.filter((p) => p.permalink)
  return (
    <section ref={ref} className={cn('space-y-3 rounded-2xl border border-[rgb(var(--color-border))] p-4', className)} aria-label="Sosyal medyada">
      <div className="space-y-1">
        <h2 className="text-sm font-black text-[rgb(var(--color-text))]">Sosyal medyada</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[rgb(var(--color-text))]">
          {METRICS.filter((m) => typeof data.totals[m.key] === 'number').map(({ key, label, Icon }) => (
            <span key={key} className="inline-flex items-center gap-1">
              <Icon className="h-4 w-4 text-[rgb(var(--color-muted))]" aria-hidden />
              <b>{formatCountTr(data.totals[key]!)}</b> {label}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-[rgb(var(--color-muted))]">
          {[...new Set(data.platforms.map((p) => PLATFORM_TR[p.platform]))].join(', ')} paylaşımlarından alınır; NaHaber’deki beğeni ve görüntülenmelerden ayrıdır.
        </p>
        {links.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {links.map((p) => (
              <a key={p.permalink!} href={p.permalink!} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--color-border))] px-2.5 py-1 text-xs font-semibold text-[rgb(var(--color-text))]">
                {PLATFORM_TR[p.platform]}
                {p.accountName ? ` · ${p.accountName}` : ''}
                {typeof p.metrics.comments === 'number' ? ` · ${formatCountTr(p.metrics.comments)} yorum` : ''}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            ))}
          </div>
        ) : null}
      </div>

      {data.comments.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Sosyal medyadan yorumlar</h3>
          <ul className="space-y-2">
            {data.comments.map((c) => (
              <li key={c.id} className="rounded-xl bg-[rgb(var(--color-surface))] px-3 py-2 text-sm">
                <p className="text-xs text-[rgb(var(--color-muted))]">
                  <b className="text-[rgb(var(--color-text))]">{c.author ? (c.platform === 'youtube' || c.platform === 'facebook' ? c.author : `@${c.author}`) : 'Kullanıcı'}</b> · {PLATFORM_TR[c.platform]}
                  {c.createdAt ? ` · ${ago(c.createdAt)}` : ''}
                </p>
                <p className="whitespace-pre-wrap break-words text-[rgb(var(--color-text))]">{c.text}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

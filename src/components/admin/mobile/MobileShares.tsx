'use client'

/**
 * MOBILE-ADMIN-1 Faz 3 — «Paylaşım» tab: what needs a decision (shares with an unknown
 * platform result), how to share, recent reels and the share history. Reuses the
 * desktop panels (same APIs, same permissions); heavy setup stays on desktop.
 */
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { Clapperboard, ChevronRight, Newspaper, Settings2 } from 'lucide-react'
import { UncertainPublishPanel } from '@/components/admin/social/UncertainPublishPanel'
import { ShareHistory } from '@/components/social/ShareHistory'
import { reelsCall } from '@/components/admin/social/reelsApi'
import { useCmsAuth } from '@/hooks/useCmsAuth'

type SavedReel = { newsId: string; headline: string; url: string; coverUrl: string | null; updatedAt: string | null }

function RecentReels() {
  const [items, setItems] = useState<SavedReel[] | null>(null)
  useEffect(() => {
    let alive = true
    void reelsCall<{ items: SavedReel[] }>('GET', '/api/admin/social/reels/library?limit=6').then((r) => {
      if (alive) setItems(r.ok ? r.data.items : [])
    })
    return () => {
      alive = false
    }
  }, [])
  if (!items || items.length === 0) return null
  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-0.5">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Son reels videoları</h2>
        <Link href="/admin/media-studio/reels" className="text-xs font-semibold text-[rgb(var(--color-brand))]">
          Stüdyo
        </Link>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 hide-scrollbar">
        {items.map((it) => (
          <a key={it.newsId} href={it.url} target="_blank" rel="noreferrer" className="w-28 shrink-0">
            <div className="aspect-[9/16] overflow-hidden rounded-xl bg-[rgb(var(--color-surface))]">
              {it.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-snug text-[rgb(var(--color-text))]">{it.headline}</p>
          </a>
        ))}
      </div>
    </section>
  )
}

function Row({ href, icon, title, desc }: { href: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 active:bg-[rgb(var(--color-surface))]">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[rgb(var(--color-text))]">{title}</span>
        <span className="block text-[11px] text-[rgb(var(--color-muted))]">{desc}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-[rgb(var(--color-muted))]" />
    </Link>
  )
}

export function MobileShares() {
  const { can } = useCmsAuth()
  // central social-account managers (same rule as the APIs: system:settings)
  const manager = can('system:settings')
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[rgb(var(--color-text))]">Paylaşım</h1>
        <p className="text-sm text-[rgb(var(--color-muted))]">Sosyal medya paylaşımları ve reels</p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] divide-y divide-[rgb(var(--color-border))]">
        <Row href="/admin/news?filter=published" icon={<Newspaper className="h-4 w-4" />} title="Haber paylaş" desc="Habere dokun → ⋯ → Post, Hikâye, Reels, Video hikâye" />
        {can('video:read') ? (
          <Row href="/admin/media-studio/reels" icon={<Clapperboard className="h-4 w-4" />} title="Reels stüdyosu" desc="Video üret, kapak ve sunucu seç" />
        ) : null}
        <Row href="/admin/social" icon={<Settings2 className="h-4 w-4" />} title="Hesaplar ve otomatik paylaşım" desc="Kurulum ayrıntıları büyük ekranda daha rahat" />
      </section>

      {manager ? <UncertainPublishPanel /> : null}

      {manager ? <RecentReels /> : null}

      <section>
        <h2 className="mb-2 px-0.5 text-[13px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Paylaşım geçmişi</h2>
        <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3">
          <Suspense fallback={null}>
            <ShareHistory />
          </Suspense>
        </div>
      </section>
    </div>
  )
}

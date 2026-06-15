'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Bell, Search, Plus, ExternalLink, ChevronDown } from 'lucide-react'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { cn } from '@/lib/utils'
import { db } from '@/lib/firebase/firestore'
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import type { CmsNotification } from '@/types/cms'
import { getSiteUrl } from '@/lib/seo'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'

const SEEN_KEY = 'cms_notif_seen_at'

const NOTIF_ICONS: Record<CmsNotification['type'], string> = {
  article_submitted: '📝',
  article_approved: '✅',
  article_rejected: '❌',
  cron_error: '🚨',
  user_reported: '🚩',
  breaking_news: '🔴',
}

function NotificationDropdown({ onClose }: { onClose: () => void }) {
  const [notifs, setNotifs] = useState<CmsNotification[]>([])

  useEffect(() => {
    // Simulated notifications from newsDrafts pending review
    const q = query(
      collection(db, 'newsDrafts'),
      where('draftStatus', '==', 'pending_review'),
      orderBy('createdAt', 'desc'),
      limit(8)
    )
    const unsub = onSnapshot(q, snap => {
      const items: CmsNotification[] = snap.docs.map(doc => {
        const d = doc.data()
        const createdAt = typeof d.createdAt === 'number'
          ? new Date(d.createdAt).toISOString()
          : (d.createdAt as string) ?? new Date().toISOString()
        return {
          id: doc.id,
          type: 'article_submitted',
          title: 'Yeni haber onay bekliyor',
          message: (d.title as string) ?? 'Başlık yok',
          href: '/admin/news?filter=pending',
          isRead: false,
          createdAt,
        }
      })
      setNotifs(items)
    }, () => setNotifs([]))

    return unsub
  }, [])

  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-4 py-3">
        <span className="text-sm font-bold text-[rgb(var(--color-text))]">Bildirimler</span>
        {notifs.length > 0 && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
            {notifs.length}
          </span>
        )}
      </div>
      {notifs.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-[rgb(var(--color-muted))]">
          Yeni bildirim yok
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto">
          {notifs.map(notif => (
            <Link
              key={notif.id}
              href={notif.href ?? '#'}
              onClick={onClose}
              className="flex gap-3 px-4 py-3 transition-colors hover:bg-[rgb(var(--color-surface))]"
            >
              <span className="mt-0.5 text-lg">{NOTIF_ICONS[notif.type]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[rgb(var(--color-text))]">{notif.title}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-[rgb(var(--color-muted))]">{notif.message}</p>
                <p className="mt-1 text-[10px] text-[rgb(var(--color-muted))]">
                  {formatDistanceToNow(new Date(notif.createdAt), { locale: tr, addSuffix: true })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
      <div className="border-t border-[rgb(var(--color-border))] px-4 py-2">
        <Link href="/admin/news?filter=pending" onClick={onClose} className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
          Tümünü gör →
        </Link>
      </div>
    </div>
  )
}

interface CMSHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function CMSHeader({ title, subtitle, actions }: CMSHeaderProps) {
  const { user, role, can } = useCmsAuth()
  const [notifOpen, setNotifOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [seenAt, setSeenAt] = useState<number>(0)

  // Load seen timestamp from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SEEN_KEY)
      if (stored) setSeenAt(Number(stored))
    } catch {}
  }, [])

  useEffect(() => {
    const q = query(
      collection(db, 'newsDrafts'),
      where('draftStatus', '==', 'pending_review'),
      limit(99)
    )
    const unsub = onSnapshot(q, snap => {
      // Only count items newer than last seen time
      const unseen = snap.docs.filter(doc => {
        const d = doc.data()
        const createdAt = typeof d.createdAt === 'number' ? d.createdAt : 0
        return createdAt > seenAt
      })
      setPendingCount(unseen.length)
    }, () => {})
    return unsub
  }, [seenAt])

  function openNotifications() {
    const now = Date.now()
    try { localStorage.setItem(SEEN_KEY, String(now)) } catch {}
    setSeenAt(now)
    setPendingCount(0)
    setNotifOpen(o => !o)
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))]/95 px-6 py-4 backdrop-blur-sm">
      {/* Page title */}
      <div className="min-w-0">
        <h1 className="truncate text-xl font-black tracking-tight text-[rgb(var(--color-text))]">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-sm text-[rgb(var(--color-muted))]">{subtitle}</p>
        )}
      </div>

      {/* Right actions */}
      <div className="flex shrink-0 items-center gap-2">
        {actions}

        {can('news:create') && (
          <Link
            href="/admin/news/create"
            className="hidden items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:flex"
          >
            <Plus className="h-4 w-4" />
            Yeni Haber
          </Link>
        )}

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={openNotifications}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))]"
          >
            <Bell className="h-4 w-4" />
            {pendingCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="z-50">
                <NotificationDropdown onClose={() => setNotifOpen(false)} />
              </div>
            </>
          )}
        </div>

        {/* Preview site */}
        <a
          href={getSiteUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))]"
          title="Siteyi Önizle"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </header>
  )
}

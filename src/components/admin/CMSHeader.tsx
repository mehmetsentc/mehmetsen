'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Bell, Search, Plus, ExternalLink, RefreshCw, HelpCircle } from 'lucide-react'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { cn } from '@/lib/utils'
import { db } from '@/lib/firebase/firestore'
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import type { CmsNotification } from '@/types/cms'
import { CMS_ROLE_COLORS } from '@/types/cms'
import { getSiteUrl } from '@/lib/seo'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { AdminCommandPalette, useAdminCommandHotkey } from '@/components/admin/AdminCommandPalette'
import { AdminThemeToggle } from '@/components/admin/AdminThemeToggle'
import { countVisiblePendingApprovals, isDuplicateNewsData } from '@/services/adminNewsService'

const SEEN_KEY = 'cms_notif_seen_at'

const NOTIF_ICONS: Record<CmsNotification['type'], string> = {
  article_submitted: '📝',
  article_approved: '✅',
  article_rejected: '❌',
  cron_error: '🚨',
  user_reported: '🚩',
  breaking_news: '🔴',
  approval: '⏳',
  factCheck: '🔍',
  agentError: '🤖',
  socialFailure: '📣',
  tokenExpiry: '🔑',
  systemError: '⚠️',
  algorithmProposal: '📈',
  learningProposal: '🧠',
  assignment: '📌',
  mention: '@',
}

function NotificationDropdown({ onClose }: { onClose: () => void }) {
  const [notifs, setNotifs] = useState<CmsNotification[]>([])

  useEffect(() => {
    const q = query(
      collection(db, 'newsDrafts'),
      where('draftStatus', '==', 'pending_review'),
      orderBy('createdAt', 'desc'),
      limit(8)
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: CmsNotification[] = snap.docs
          .filter((doc) => {
            const d = doc.data()
            return !isDuplicateNewsData(d)
          })
          .map((doc) => {
          const d = doc.data()
          const createdAt =
            typeof d.createdAt === 'number'
              ? new Date(d.createdAt).toISOString()
              : ((d.createdAt as string) ?? new Date().toISOString())
          return {
            id: doc.id,
            type: 'article_submitted' as const,
            title: 'Yeni haber onay bekliyor',
            message: (d.title as string) ?? 'Başlık yok',
            href: '/admin/news?filter=pending',
            isRead: false,
            createdAt,
          }
        })
        setNotifs(items)
      },
      () => setNotifs([])
    )
    return unsub
  }, [])

  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-4 py-3">
        <span className="text-sm font-bold text-[rgb(var(--color-text))]">Bildirimler</span>
        {notifs.length > 0 ? (
          <span className="rounded-full bg-[rgb(var(--color-brand))] px-2 py-0.5 text-[10px] font-bold text-white">
            {notifs.length}
          </span>
        ) : null}
      </div>
      {notifs.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-[rgb(var(--color-muted))]">Yeni bildirim yok</div>
      ) : (
        <div className="max-h-72 overflow-y-auto">
          {notifs.map((notif) => (
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
        <Link
          href="/admin/news?filter=pending"
          onClick={onClose}
          className="text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline"
        >
          Onay kuyruğunu aç →
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
  const { can, user, role, roleLabel } = useCmsAuth()
  const [notifOpen, setNotifOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [seenAt, setSeenAt] = useState(0)

  const openCommand = useCallback(() => setCmdOpen(true), [])
  useAdminCommandHotkey(openCommand)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SEEN_KEY)
      if (stored) setSeenAt(Number(stored))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const fetchCount = async () => {
      try {
        const n = await countVisiblePendingApprovals()
        if (!cancelled) setPendingCount(n)
      } catch {
        /* ignore */
      }
    }
    void fetchCount()
    const interval = setInterval(fetchCount, 2 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  function openNotifications() {
    const now = Date.now()
    try {
      localStorage.setItem(SEEN_KEY, String(now))
    } catch {
      /* ignore */
    }
    setSeenAt(now)
    setPendingCount(0)
    setNotifOpen((o) => !o)
  }

  const roleBadge = roleLabel || (role ? String(role) : 'Editör')

  return (
    <>
      <header className="sticky top-0 z-30 hidden items-center gap-3 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))]/95 px-4 py-3 backdrop-blur-md md:flex sm:px-6">
        <div className="min-w-0 shrink">
          <h1 className="truncate text-lg font-bold tracking-tight text-[rgb(var(--color-text))] sm:text-xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-xs text-[rgb(var(--color-muted))] sm:text-sm">{subtitle}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={openCommand}
          className="mx-auto hidden min-w-0 max-w-md flex-1 items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-left text-sm text-[rgb(var(--color-muted))] transition-colors hover:border-[rgb(var(--color-brand))]/30 hover:text-[rgb(var(--color-text))] md:flex"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Ara…</span>
          <kbd className="rounded border border-[rgb(var(--color-border))] px-1.5 py-0.5 text-[10px] font-semibold">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {actions}

          <AdminThemeToggle />

          <button
            type="button"
            onClick={openCommand}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] md:hidden"
            aria-label="Ara"
          >
            <Search className="h-4 w-4" />
          </button>

          {can('news:create') ? (
            <Link
              href="/admin/news/create"
              className="hidden items-center gap-1.5 rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 sm:flex"
            >
              <Plus className="h-4 w-4" />
              Yeni Haber
            </Link>
          ) : null}

          <div className="relative">
            <button
              type="button"
              onClick={openNotifications}
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))]"
              aria-label="Bildirimler"
            >
              <Bell className="h-4 w-4" />
              {pendingCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] px-0.5 text-[9px] font-bold text-white">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              ) : null}
            </button>
            {notifOpen ? (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                <NotificationDropdown onClose={() => setNotifOpen(false)} />
              </>
            ) : null}
          </div>

          <Link
            href="/admin/system-health"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))]"
            title="Yardım / Sistem"
          >
            <HelpCircle className="h-4 w-4" />
          </Link>

          <a
            href={getSiteUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))]"
            title="Siteyi Önizle"
          >
            <ExternalLink className="h-4 w-4" />
          </a>

          {user ? (
            <div className="ml-1 hidden items-center gap-2.5 border-l border-[rgb(var(--color-border))] pl-3 lg:flex">
              <div className="text-right">
                <p className="max-w-[140px] truncate text-xs font-semibold text-[rgb(var(--color-text))]">
                  {user.displayName || user.email || 'Editör'}
                </p>
                <span
                  className={cn(
                    'mt-0.5 inline-block rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide',
                    role ? CMS_ROLE_COLORS[role] : 'bg-violet-500/20 text-violet-700 dark:text-violet-300'
                  )}
                >
                  {roleBadge}
                </span>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] text-xs font-bold text-white">
                {(user.displayName?.[0] || user.email?.[0] || 'N').toUpperCase()}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <AdminCommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </>
  )
}

export function CMSRefreshButton({
  loading,
  onClick,
}: {
  loading?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))]"
    >
      <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
      <span className="hidden sm:inline">Yenile</span>
    </button>
  )
}

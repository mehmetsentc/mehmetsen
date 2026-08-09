'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { useNotifications } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'
import {
  CATEGORY_TO_TYPE,
  NOTIF_CATEGORIES,
  NotificationRow,
  type NotifCategory,
} from './notificationShared'

interface NotificationsContentProps {
  compact?: boolean
  onNavigate?: () => void
  markReadWhenVisible?: boolean
}

export function NotificationsContent({
  compact = false,
  onNavigate,
  markReadWhenVisible = true,
}: NotificationsContentProps) {
  const [active, setActive] = useState<NotifCategory>('all')
  const { notifications, loading, error, unreadCount, markAllAsRead } = useNotifications()

  useEffect(() => {
    if (!markReadWhenVisible || loading || unreadCount === 0) return
    void markAllAsRead()
  }, [markReadWhenVisible, loading, unreadCount, markAllAsRead])

  const filtered = useMemo(() => {
    if (active === 'all') return notifications
    const type = CATEGORY_TO_TYPE[active]
    return notifications.filter((n) => n.type === type)
  }, [notifications, active])

  return (
    <div className={cn('flex min-h-0 flex-col', compact ? 'gap-2' : 'gap-4')}>
      {!compact && (
        <div className="flex items-start justify-between gap-3 px-1">
          <div>
            <h2 className="text-lg font-bold text-[rgb(var(--color-text))]">Bildirimler</h2>
            <p className="text-sm text-[rgb(var(--color-muted))]">Etkileşimlerinizi takip edin</p>
          </div>
          {notifications.some((n) => !n.read) && (
            <button
              type="button"
              onClick={() => markAllAsRead()}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Tümünü okundu işaretle
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
        {NOTIF_CATEGORIES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            className={cn('filter-chip', active === id && 'filter-chip-active')}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className={cn(compact ? 'min-h-0 flex-1 overflow-y-auto' : 'surface-card')}>
        {loading ? (
          <ul className="-mx-1 divide-y divide-[rgb(var(--color-border))]/40">
            {[...Array(compact ? 4 : 6)].map((_, i) => (
              <li key={`notif-sk-${i}`} className="flex items-start gap-3 px-3 py-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </li>
            ))}
          </ul>
        ) : error ? (
          <div className={compact ? 'px-3 py-10 text-center' : 'empty-state'}>
            {!compact && (
              <div className="empty-state-icon">
                <Bell className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              </div>
            )}
            <p className={compact ? 'text-sm font-medium text-[rgb(var(--color-text))]' : 'empty-state-title'}>
              Bildirimler yüklenemedi
            </p>
            <p className={compact ? 'mt-1 text-xs text-[rgb(var(--color-muted))]' : 'empty-state-text'}>
              Lütfen daha sonra tekrar deneyin.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={compact ? 'px-3 py-10 text-center' : 'empty-state'}>
            {!compact && (
              <div className="empty-state-icon">
                <Bell className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              </div>
            )}
            <p className={compact ? 'text-sm font-medium text-[rgb(var(--color-text))]' : 'empty-state-title'}>
              Henüz bildirim yok
            </p>
            <p className={compact ? 'mt-1 text-xs text-[rgb(var(--color-muted))]' : 'empty-state-text'}>
              Beğeni, yorum ve takip bildirimleri burada görünecek.
            </p>
          </div>
        ) : (
          <ul className="-mx-1 divide-y divide-[rgb(var(--color-border))]/40">
            {filtered.map((n) => (
              <NotificationRow
                key={n.id}
                n={n}
                compact={compact}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

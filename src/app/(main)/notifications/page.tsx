'use client'

import { useEffect, useMemo } from 'react'
import { usePageState } from '@/hooks/usePageState'
import { PAGE_STATE_KEYS } from '@/lib/stateKeys'
import Link from 'next/link'
import {
  Heart,
  MessageCircle,
  UserPlus,
  AtSign,
  Bell,
  CheckCheck,
} from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Skeleton } from '@/components/ui/Skeleton'
import { useNotifications } from '@/hooks/useNotifications'
import { formatTimelineTime } from '@/lib/timelineUtils'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import type { Notification, NotificationType } from '@/types/notification'

type NotifCategory = 'all' | 'likes' | 'comments' | 'follows' | 'mentions' | 'system'

const CATEGORIES: { id: NotifCategory; label: string; icon: typeof Bell }[] = [
  { id: 'all', label: 'Tümü', icon: Bell },
  { id: 'likes', label: 'Beğeniler', icon: Heart },
  { id: 'comments', label: 'Yorumlar', icon: MessageCircle },
  { id: 'follows', label: 'Takip', icon: UserPlus },
  { id: 'mentions', label: 'Bahsetmeler', icon: AtSign },
  { id: 'system', label: 'Sistem', icon: Bell },
]

const CATEGORY_TO_TYPE: Record<Exclude<NotifCategory, 'all'>, NotificationType> = {
  likes: 'like',
  comments: 'comment',
  follows: 'follow',
  mentions: 'mention',
  system: 'system',
}

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  mention: AtSign,
  system: Bell,
}

const TYPE_ICON_STYLE: Record<NotificationType, string> = {
  like: 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400',
  comment: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  follow: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
  mention: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  system: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
}

function actorName(n: Notification): string {
  return n.actorDisplayName || n.actorUsername || 'Birisi'
}

function actionText(n: Notification): string {
  switch (n.type) {
    case 'like':
      return `${actorName(n)} gönderinizi beğendi`
    case 'comment':
      return `${actorName(n)} gönderinize yorum yaptı`
    case 'follow':
      return `${actorName(n)} sizi takip etti`
    case 'mention':
      return `${actorName(n)} sizden bahsetti`
    case 'system':
      return n.text || 'Sistem bildirimi'
  }
}

function notificationHref(n: Notification): string | null {
  if (n.type === 'follow' && n.actorUsername) {
    return ROUTES.PROFILE(n.actorUsername)
  }
  if (n.postId) {
    return ROUTES.POST_DETAIL(n.postId)
  }
  if (n.actorUsername) {
    return ROUTES.PROFILE(n.actorUsername)
  }
  return null
}

function NotificationRow({ n }: { n: Notification }) {
  const Icon = TYPE_ICON[n.type]
  const href = notificationHref(n)

  const body = (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl px-3 py-3 transition-colors',
        !n.read && 'bg-blue-50/60 dark:bg-blue-950/30',
        href && 'hover:bg-[rgb(var(--color-surface))]'
      )}
    >
      <div className="relative shrink-0">
        {n.actorId || n.actorUsername ? (
          <Avatar name={actorName(n)} src={n.actorPhotoURL} size="md" />
        ) : (
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full',
              TYPE_ICON_STYLE[n.type]
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
        <span
          className={cn(
            'absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-[rgb(var(--color-card))]',
            TYPE_ICON_STYLE[n.type]
          )}
        >
          <Icon className="h-3 w-3" />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-[rgb(var(--color-text))]">{actionText(n)}</p>
        {n.text && n.type !== 'system' && (
          <p className="mt-0.5 truncate text-sm text-[rgb(var(--color-muted))]">
            {n.text}
          </p>
        )}
        <p className="mt-0.5 text-xs text-[rgb(var(--color-muted))]">
          {formatTimelineTime(n.createdAt)}
        </p>
      </div>

      {!n.read && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden />
      )}
    </div>
  )

  if (href) {
    return (
      <li>
        <Link href={href}>{body}</Link>
      </li>
    )
  }
  return <li>{body}</li>
}

export default function NotificationsPage() {
  const [active, setActive] = usePageState<NotifCategory>(
    PAGE_STATE_KEYS.notifCategory,
    'all'
  )
  const { notifications, loading, error, unreadCount, markAllAsRead } = useNotifications()

  // Mark everything read once notifications are visible.
  useEffect(() => {
    if (!loading && unreadCount > 0) {
      markAllAsRead()
    }
    // Only react to the initial settle / new unread arrivals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, unreadCount])

  const filtered = useMemo(() => {
    if (active === 'all') return notifications
    const type = CATEGORY_TO_TYPE[active]
    return notifications.filter((n) => n.type === type)
  }, [notifications, active])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Bildirimler</h1>
          <p className="page-subtitle">Etkileşimlerinizi takip edin</p>
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

      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
        {CATEGORIES.map(({ id, label, icon: Icon }) => (
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

      <div className="surface-card">
        {loading ? (
          <ul className="-mx-1 divide-y divide-[rgb(var(--color-border))]/40">
            {[...Array(6)].map((_, i) => (
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
          <div className="empty-state">
            <div className="empty-state-icon">
              <Bell className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="empty-state-title">Bildirimler yüklenemedi</p>
            <p className="empty-state-text">Lütfen daha sonra tekrar deneyin.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Bell className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="empty-state-title">Henüz bildirim yok</p>
            <p className="empty-state-text">
              Beğeni, yorum ve takip bildirimleri burada görünecek.
            </p>
          </div>
        ) : (
          <ul className="-mx-1 divide-y divide-[rgb(var(--color-border))]/40">
            {filtered.map((n) => (
              <NotificationRow key={n.id} n={n} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import {
  Heart,
  MessageCircle,
  UserPlus,
  AtSign,
  Bell,
} from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { formatTimelineTime } from '@/lib/timelineUtils'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import type { Notification, NotificationType } from '@/types/notification'

export type NotifCategory = 'all' | 'likes' | 'comments' | 'follows' | 'mentions' | 'system'

export const NOTIF_CATEGORIES: { id: NotifCategory; label: string; icon: typeof Bell }[] = [
  { id: 'all', label: 'Tümü', icon: Bell },
  { id: 'likes', label: 'Beğeniler', icon: Heart },
  { id: 'comments', label: 'Yorumlar', icon: MessageCircle },
  { id: 'follows', label: 'Takip', icon: UserPlus },
  { id: 'mentions', label: 'Bahsetmeler', icon: AtSign },
  { id: 'system', label: 'Sistem', icon: Bell },
]

export const CATEGORY_TO_TYPE: Record<Exclude<NotifCategory, 'all'>, NotificationType> = {
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

export function notificationHref(n: Notification): string | null {
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

export function NotificationRow({
  n,
  compact,
  onNavigate,
}: {
  n: Notification
  compact?: boolean
  onNavigate?: () => void
}) {
  const Icon = TYPE_ICON[n.type]
  const href = notificationHref(n)

  const body = (
    <div
      className={cn(
        'flex items-start gap-3 transition-colors',
        compact ? 'px-3 py-2.5' : 'rounded-xl px-3 py-3',
        !n.read && 'bg-blue-50/60 dark:bg-blue-950/30',
        href && 'hover:bg-[rgb(var(--color-surface))]'
      )}
    >
      <div className="relative shrink-0">
        {n.actorId || n.actorUsername ? (
          <Avatar name={actorName(n)} src={n.actorPhotoURL} size={compact ? 'sm' : 'md'} />
        ) : (
          <div
            className={cn(
              'flex items-center justify-center rounded-full',
              compact ? 'h-8 w-8' : 'h-10 w-10',
              TYPE_ICON_STYLE[n.type]
            )}
          >
            <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
          </div>
        )}
        <span
          className={cn(
            'absolute -bottom-1 -right-1 flex items-center justify-center rounded-full ring-2 ring-[rgb(var(--color-card))]',
            compact ? 'h-4 w-4' : 'h-5 w-5',
            TYPE_ICON_STYLE[n.type]
          )}
        >
          <Icon className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn('text-[rgb(var(--color-text))]', compact ? 'text-[13px]' : 'text-sm')}>
          {actionText(n)}
        </p>
        {n.text && n.type !== 'system' && (
          <p className="mt-0.5 truncate text-sm text-[rgb(var(--color-muted))]">{n.text}</p>
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
        <Link href={href} onClick={onNavigate}>
          {body}
        </Link>
      </li>
    )
  }
  return <li>{body}</li>
}

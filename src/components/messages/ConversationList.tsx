'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageSquarePlus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useConversations } from '@/hooks/useConversations'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import { ConversationListItem } from './ConversationListItem'

interface ConversationListProps {
  className?: string
}

export function ConversationList({ className }: ConversationListProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const { conversations, loading } = useConversations(user?.uid)

  const activeId = pathname.startsWith('/messages/')
    ? pathname.split('/messages/')[1]?.split('/')[0]
    : null

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-4 py-4">
        <h1 className="text-lg font-bold text-[rgb(var(--color-text))]">Mesajlar</h1>
        <Link
          href={ROUTES.SEARCH}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-nav-hover))]"
          aria-label="Yeni mesaj"
          title="Kullanıcı ara"
        >
          <MessageSquarePlus className="h-5 w-5" />
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-1 p-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 rounded-xl px-3 py-3">
                <div className="skeleton h-12 w-12 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="skeleton h-3 w-24 rounded" />
                  <div className="skeleton h-3 w-full rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
              Gelen kutun boş
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
              Takip ettiğin kişilere veya arama ile bulduğun kullanıcılara mesaj gönderebilirsin.
            </p>
            <Link
              href={ROUTES.SEARCH}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Kullanıcı ara
            </Link>
          </div>
        ) : (
          <div className="p-2">
            {conversations.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                currentUserId={user!.uid}
                active={activeId === conversation.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { usePathname } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConversationList } from './ConversationList'

interface MessagesShellProps {
  children: React.ReactNode
}

export function MessagesShell({ children }: MessagesShellProps) {
  const pathname = usePathname()
  const inThread = pathname.startsWith('/messages/') && pathname !== '/messages'

  return (
    <div className="messages-shell surface-card overflow-hidden">
      <aside
        className={cn(
          'messages-sidebar border-r border-[rgb(var(--color-border))]',
          inThread ? 'hidden lg:flex' : 'flex'
        )}
      >
        <ConversationList className="w-full" />
      </aside>

      <main
        className={cn(
          'messages-main min-h-0',
          inThread ? 'flex' : 'hidden lg:flex'
        )}
      >
        {children}
      </main>
    </div>
  )
}

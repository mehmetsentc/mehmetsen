import type { Metadata } from 'next'
import { MessagesShell } from '@/components/messages/MessagesShell'

export const metadata: Metadata = {
  title: 'Mesajlar',
  robots: { index: false, follow: false },
}

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return <MessagesShell>{children}</MessagesShell>
}

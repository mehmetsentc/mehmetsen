'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { messageService } from '@/services/messageService'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import type { User } from '@/types/user'

interface MessageButtonProps {
  targetUser: User
  className?: string
}

export function MessageButton({ targetUser, className }: MessageButtonProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (!user) {
      router.push(ROUTES.LOGIN)
      return
    }

    setLoading(true)
    try {
      const conversation = await messageService.getOrCreateConversation(user, targetUser)
      router.push(ROUTES.MESSAGES_CONVERSATION(conversation.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mesaj açılamadı')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={loading}
      className={cn('profile-edit-btn inline-flex items-center gap-2', className)}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <MessageCircle className="h-4 w-4" />
      )}
      Mesaj
    </button>
  )
}

'use client'

import { useState } from 'react'
import { Loader2, SendHorizonal } from 'lucide-react'
import toast from 'react-hot-toast'
import { messageService } from '@/services/messageService'
import type { User } from '@/types/user'

interface MessageComposerProps {
  conversationId: string
  sender: User
  disabled?: boolean
}

export function MessageComposer({ conversationId, sender, disabled }: MessageComposerProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || sending || disabled) return

    setSending(true)
    try {
      await messageService.sendMessage(conversationId, sender, text)
      setText('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mesaj gönderilemedi')
    } finally {
      setSending(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="message-composer border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-3"
    >
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSubmit(e)
            }
          }}
          placeholder="Mesaj yaz…"
          rows={1}
          disabled={disabled || sending}
          className="message-composer-input max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending || disabled}
          aria-label="Gönder"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizonal className="h-4 w-4" />
          )}
        </button>
      </div>
    </form>
  )
}

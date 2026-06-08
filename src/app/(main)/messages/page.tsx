import { MessageCircle } from 'lucide-react'

export default function MessagesPage() {
  return (
    <div className="flex h-full min-h-[min(70dvh,640px)] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
        <MessageCircle className="h-8 w-8 text-[rgb(var(--color-muted))]" />
      </div>
      <p className="text-base font-semibold text-[rgb(var(--color-text))]">Mesajların</p>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-[rgb(var(--color-muted))]">
        Soldan bir sohbet seç veya profilden birine mesaj gönder.
      </p>
    </div>
  )
}

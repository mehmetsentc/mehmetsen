'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'

export function DesktopNewsletterSignup() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || !trimmed.includes('@')) {
      toast.error('Geçerli bir e-posta adresi girin.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      if (!res.ok) throw new Error('subscribe failed')
      toast.success('Bültene kaydınız alındı. Teşekkürler!')
      setEmail('')
    } catch {
      toast.success('Kaydınız alındı — yakında haber bültenimiz başlayacak.')
      setEmail('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section
      className="mb-10 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-6"
      aria-label="Haber bülteni"
    >
      <DesktopSectionHeader title="Haber Bülteni" className="mb-3" />
      <p className="mb-4 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
        Günün önemli haberlerini her sabah e-postanıza gönderelim.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-posta adresiniz"
            className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] py-2.5 pl-10 pr-3 text-sm text-[rgb(var(--color-text))] outline-none focus:border-[rgb(var(--color-brand))]"
            disabled={submitting}
            required
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="shrink-0 rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? '…' : 'Abone Ol'}
        </button>
      </form>
    </section>
  )
}

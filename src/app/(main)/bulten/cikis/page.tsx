'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from '@/components/ui/Toast'

export default function NewsletterUnsubscribePage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed.includes('@')) {
      toast.error('Geçerli bir e-posta girin.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/newsletter/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(data.error || 'İşlem başarısız')
        return
      }
      setDone(true)
      toast.success('Abonelik iptal edildi.')
    } catch {
      toast.error('Bağlantı hatası')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-black text-[rgb(var(--color-text))]">Bülten aboneliği</h1>
      <p className="mt-2 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
        NaHaber haber bülteni e-postalarını almak istemiyorsanız e-posta adresinizi girerek
        abonelikten çıkabilirsiniz.
      </p>

      {done ? (
        <div className="mt-8 space-y-3">
          <p className="text-sm font-medium text-[rgb(var(--color-text))]">
            Aboneliğiniz iptal edildi.
          </p>
          <Link href="/" className="text-sm font-semibold text-[rgb(var(--color-brand))] underline">
            Ana sayfaya dön
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-posta adresiniz"
            required
            autoComplete="email"
            className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2.5 text-sm outline-none focus:border-[rgb(var(--color-brand))]"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? '…' : 'Abonelikten çık'}
          </button>
        </form>
      )}
    </div>
  )
}

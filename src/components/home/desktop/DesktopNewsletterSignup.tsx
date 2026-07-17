'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { getConsent } from '@/lib/consent'

export function DesktopNewsletterSignup() {
  const [email, setEmail] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || !trimmed.includes('@')) {
      toast.error('Geçerli bir e-posta adresi girin.')
      return
    }
    if (!marketingConsent) {
      toast.error('Devam etmek için bülten iznini onaylayın.')
      return
    }

    // Prefer explicit checkbox; also accept prior marketing consent cookie.
    const stored = getConsent()
    const allowed = marketingConsent || stored?.categories.marketing === true
    if (!allowed) {
      toast.error('Pazarlama çerez izni olmadan bültene kayıt olunamaz.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, marketingConsent: true }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        alreadySubscribed?: boolean
      }
      if (!res.ok) {
        toast.error(data.error || 'Kayıt alınamadı. Lütfen tekrar deneyin.')
        return
      }
      toast.success(
        data.alreadySubscribed
          ? 'Bu e-posta zaten bültene kayıtlı.'
          : 'Bültene kaydınız alındı. Teşekkürler!'
      )
      setEmail('')
      setMarketingConsent(false)
    } catch {
      toast.error('Bağlantı hatası. Lütfen tekrar deneyin.')
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
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
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
              autoComplete="email"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="shrink-0 rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? '…' : 'Abone Ol'}
          </button>
        </div>
        <label className="flex items-start gap-2 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
          <input
            type="checkbox"
            checked={marketingConsent}
            onChange={(e) => setMarketingConsent(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-[rgb(var(--color-border))]"
            disabled={submitting}
          />
          <span>
            NaHaber haber bülteni ve pazarlama e-postalarını almak istiyorum. İstediğim zaman
            abonelikten çıkabilirim.
          </span>
        </label>
      </form>
    </section>
  )
}

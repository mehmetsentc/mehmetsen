'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

export type NewsletterSource =
  | 'desktop-home'
  | 'article'
  | 'article-prompt'
  | 'city-footer'
  | 'city-home'
  | 'bulten-page'

interface NewsletterSignupProps {
  source?: NewsletterSource
  /** card = section box, inline = article end, compact = footer strip */
  variant?: 'card' | 'inline' | 'compact'
  className?: string
  title?: string
  description?: string
  onSuccess?: () => void
}

const DEFAULT_TITLE = 'Güncel haberlere abone ol'
const DEFAULT_DESC =
  'Önemli gelişmeleri e-posta ile alın. İstediğiniz zaman abonelikten çıkabilirsiniz.'

export function NewsletterSignup({
  source = 'desktop-home',
  variant = 'card',
  className,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESC,
  onSuccess,
}: NewsletterSignupProps) {
  const [email, setEmail] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

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

    setSubmitting(true)
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          marketingConsent: true,
          source,
        }),
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
      setDone(true)
      onSuccess?.()
    } catch {
      toast.error('Bağlantı hatası. Lütfen tekrar deneyin.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done && variant !== 'card') {
    return (
      <p
        className={cn(
          'text-sm font-medium text-[rgb(var(--color-text))]',
          className
        )}
        role="status"
      >
        Aboneliğiniz alındı. Teşekkürler.
      </p>
    )
  }

  const form = (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className={cn('flex gap-2', variant === 'compact' && 'flex-col sm:flex-row')}>
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
            name="newsletter-email"
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
          required
        />
        <span>
          NaHaber haber bülteni e-postalarını almak istiyorum. Kişisel verilerimin KVKK
          kapsamında bülten gönderimi için işlenmesine açık rıza veriyorum. İstediğim zaman{' '}
          <a href="/bulten/cikis" className="underline hover:text-[rgb(var(--color-text))]">
            abonelikten çıkabilirim
          </a>
          .
        </span>
      </label>
    </form>
  )

  if (variant === 'compact') {
    return (
      <section className={cn('space-y-2', className)} aria-label="Haber bülteni">
        {title ? (
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{title}</p>
        ) : null}
        {description ? (
          <p className="text-xs leading-relaxed text-[rgb(var(--color-muted))]">{description}</p>
        ) : null}
        {form}
      </section>
    )
  }

  if (variant === 'inline') {
    return (
      <section
        className={cn(
          'mt-8 border-t border-[rgb(var(--color-border))] pt-6',
          className
        )}
        aria-label="Haber bülteni"
      >
        <div className="mb-1 text-base font-bold text-[rgb(var(--color-text))]">{title}</div>
        <p className="mb-4 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
          {description}
        </p>
        {form}
      </section>
    )
  }

  return (
    <section
      className={cn(
        'mb-10 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-6',
        className
      )}
      aria-label="Haber bülteni"
    >
      <div className="mb-1 text-sm font-bold uppercase tracking-wide text-[rgb(var(--color-text))]">
        {title}
      </div>
      <p className="mb-4 text-sm leading-relaxed text-[rgb(var(--color-muted))]">{description}</p>
      {form}
    </section>
  )
}

'use client'

import { useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { CONTACT_FORM_SUBJECTS } from '@/constants/siteLegalLinks'
import { cn } from '@/lib/utils'

interface ContactFormProps {
  className?: string
}

export function ContactForm({ className }: ContactFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('genel')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message, website }),
      })
      const data = (await res.json()) as { error?: string; ok?: boolean }
      if (!res.ok) {
        setError(data.error ?? 'Mesaj gönderilemedi.')
        return
      }
      setSent(true)
      setName('')
      setEmail('')
      setSubject('genel')
      setMessage('')
      setWebsite('')
    } catch {
      setError('Bağlantı hatası. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center',
          className
        )}
      >
        <p className="text-base font-semibold text-[rgb(var(--color-text))]">Mesajınız alındı</p>
        <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">
          En kısa sürede e-posta adresinize dönüş yapacağız.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-4 text-sm font-semibold text-[rgb(var(--color-brand))] hover:underline"
        >
          Yeni mesaj gönder
        </button>
      </div>
    )
  }

  return (
    <form
      id="iletisim-formu"
      onSubmit={onSubmit}
      className={cn(
        'rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5 sm:p-6',
        className
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-1">
          <span className="mb-1.5 block text-sm font-semibold text-[rgb(var(--color-text))]">Ad Soyad</span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] outline-none ring-[rgb(var(--color-brand))] focus:ring-2"
            autoComplete="name"
          />
        </label>

        <label className="block sm:col-span-1">
          <span className="mb-1.5 block text-sm font-semibold text-[rgb(var(--color-text))]">E-posta</span>
          <input
            type="email"
            required
            maxLength={200}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] outline-none ring-[rgb(var(--color-brand))] focus:ring-2"
            autoComplete="email"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-semibold text-[rgb(var(--color-text))]">Konu</span>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] outline-none ring-[rgb(var(--color-brand))] focus:ring-2"
          >
            {CONTACT_FORM_SUBJECTS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-semibold text-[rgb(var(--color-text))]">Mesajınız</span>
          <textarea
            required
            minLength={10}
            maxLength={4000}
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full resize-y rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-sm leading-relaxed text-[rgb(var(--color-text))] outline-none ring-[rgb(var(--color-brand))] focus:ring-2"
            placeholder="Mesajınızı buraya yazın..."
          />
        </label>
      </div>

      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />

      {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--color-brand))] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Gönder
      </button>
    </form>
  )
}

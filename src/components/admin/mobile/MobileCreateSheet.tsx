'use client'

import Link from 'next/link'
import { FileText, Zap, Bot, X, Sparkles } from 'lucide-react'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { useMobileAdmin } from './MobileAdminContext'

const OPTIONS = [
  {
    href: '/admin/news/create',
    label: 'Boş Haber',
    desc: 'Tam editör ile yeni haber',
    icon: FileText,
    perm: 'news:create' as const,
  },
  {
    href: '/admin/quick?mode=breaking',
    label: 'Son Dakika',
    desc: 'Hızlı kırılma haberi',
    icon: Zap,
    perm: 'news:create' as const,
    accent: true,
  },
  {
    href: '/admin/quick',
    label: 'Hızlı Haber',
    desc: 'Minimal alanlarla taslak',
    icon: Sparkles,
    perm: 'news:create' as const,
  },
  {
    href: '/admin/ai/news',
    label: 'AI ile Taslak',
    desc: 'AI Haber Asistanı',
    icon: Bot,
    perm: 'ai:use' as const,
  },
]

export function MobileCreateSheet() {
  const { createOpen, closeCreate } = useMobileAdmin()
  const { can } = useCmsAuth()

  if (!createOpen) return null

  const visible = OPTIONS.filter((o) => can(o.perm))

  return (
    <div className="fixed inset-0 z-[60] md:hidden">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Kapat" onClick={closeCreate} />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-2xl"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        role="dialog"
        aria-label="Yeni haber"
      >
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-[rgb(var(--color-border))]" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <h2 className="text-base font-bold text-[rgb(var(--color-text))]">Yeni Haber</h2>
          <button
            type="button"
            onClick={closeCreate}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[rgb(var(--color-muted))]"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-1 px-3 pb-3">
          {visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[rgb(var(--color-muted))]">
              Haber oluşturma yetkiniz yok.
            </p>
          ) : (
            visible.map((opt) => {
              const Icon = opt.icon
              return (
                <Link
                  key={opt.href + opt.label}
                  href={opt.href}
                  onClick={closeCreate}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-[rgb(var(--color-surface))] active:bg-[rgb(var(--color-surface))]"
                >
                  <span
                    className={
                      opt.accent
                        ? 'flex h-11 w-11 items-center justify-center rounded-xl bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]'
                        : 'flex h-11 w-11 items-center justify-center rounded-xl bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]'
                    }
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[rgb(var(--color-text))]">{opt.label}</span>
                    <span className="block text-xs text-[rgb(var(--color-muted))]">{opt.desc}</span>
                  </span>
                </Link>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

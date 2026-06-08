'use client'

import Link from 'next/link'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { FEED_CONTENT_POLICY } from '@/constants/legal'
import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/Button'

interface FeedGuestPolicyModalProps {
  open: boolean
  onAccept: () => void
  onDecline: () => void
}

export function FeedGuestPolicyModal({ open, onAccept, onDecline }: FeedGuestPolicyModalProps) {
  if (!open) return null

  const highlights = FEED_CONTENT_POLICY.sections
    .filter((section) => section.bullets && section.bullets.length > 0)
    .flatMap((section) => section.bullets ?? [])
    .slice(0, 8)

  return (
    <div className="feed-policy-overlay" role="dialog" aria-modal="true" aria-labelledby="feed-policy-title">
      <div className="feed-policy-modal">
        {/* Branded header */}
        <div className="feed-policy-header">
          <div className="feed-policy-icon-wrap">
            <ShieldCheck className="h-9 w-9 text-white" />
          </div>
          <p className="feed-policy-brand">NaHaber</p>
          <h2 id="feed-policy-title" className="feed-policy-title">
            İçerik Kuralları
          </h2>
        </div>

        {/* Scrollable body */}
        <div className="feed-policy-body">
          <p className="feed-policy-lead">
            NaHaber akışını görüntülemek üzeresiniz. Platformda yasadışı faaliyetler, bahis/kumar,
            müstehcen içerik ve benzeri yasaklı paylaşımlara izin verilmez.
          </p>

          <div className="feed-policy-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm leading-relaxed text-[rgb(var(--color-text))]">
              Kayıt olmadan devam ederek aşağıdaki kuralları okuduğunuzu ve kabul ettiğinizi onaylarsınız.
            </p>
          </div>

          <ul className="feed-policy-list">
            {highlights.map((item) => (
              <li key={item} className="feed-policy-list-item">
                <span className="feed-policy-list-dot" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <Link href={ROUTES.FEED_CONTENT_POLICY} className="feed-policy-link">
            Tüm içerik kurallarını oku →
          </Link>
        </div>

        {/* Footer actions */}
        <div className="feed-policy-footer">
          <div className="feed-policy-actions">
            <Button type="button" variant="secondary" onClick={onDecline} className="flex-1">
              Vazgeç
            </Button>
            <Button type="button" onClick={onAccept} className="flex-1">
              Kabul ediyorum
            </Button>
          </div>
          <p className="feed-policy-register">
            Hesabın yok mu?{' '}
            <Link href={ROUTES.REGISTER} className="font-semibold text-red-600 hover:underline">
              Kayıt ol
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

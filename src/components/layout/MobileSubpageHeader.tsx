'use client'

import type { ReactNode } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { BackNavButton } from '@/components/layout/BackNavButton'

interface MobileSubpageHeaderProps {
  title: string
  subtitle?: string
  onBack?: () => void
  onClose?: () => void
  fallbackHref?: string
  closeLabel?: string
  titleId?: string
  trailing?: ReactNode
}

/**
 * Canonical UI-V2 full-screen child header: visible Geri + title + optional close.
 * Modal flows pass onBack/onClose. Routed pages omit onBack and reuse BackNavButton.
 */
export function MobileSubpageHeader({
  title,
  subtitle,
  onBack,
  onClose,
  fallbackHref,
  closeLabel = 'Kapat',
  titleId,
  trailing,
}: MobileSubpageHeaderProps) {
  return (
    <header className="nah-subpage-header" data-testid="mobile-subpage-header">
      {onBack ? (
        <button
          type="button"
          className="nah-subpage-header__back"
          onClick={onBack}
          aria-label="Geri"
          data-testid="mobile-subpage-back"
        >
          <ArrowLeft strokeWidth={2.25} />
          <span>Geri</span>
        </button>
      ) : (
        <BackNavButton
          fallbackHref={fallbackHref}
          label="Geri"
          className="nah-subpage-header__back"
        />
      )}
      <div className="nah-subpage-header__titles">
        <h2 id={titleId}>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {trailing ? (
        trailing
      ) : onClose ? (
        <button
          type="button"
          className="nah-subpage-header__close"
          onClick={onClose}
          aria-label={closeLabel}
          data-testid="mobile-subpage-close"
        >
          <X strokeWidth={2.25} />
        </button>
      ) : (
        <span className="nah-subpage-header__spacer" aria-hidden />
      )}
    </header>
  )
}

'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Modal / Dialog — NaHaber 2026
 * Lightweight, dependency-yalın (radix yok), Framer Motion animasyonlu.
 *
 * Erişilebilirlik:
 *   - role="dialog" + aria-modal + aria-labelledby
 *   - ESC ile kapanır
 *   - Outside click ile kapanır (closeOnOverlay=false ile kapatılabilir)
 *   - Açıkken scroll-lock
 *   - İlk odaklanabilir element'e auto-focus
 *
 * Boyutlar: sm, md, lg, xl, full
 */
type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  size?: ModalSize
  closeOnOverlay?: boolean
  closeOnEsc?: boolean
  hideClose?: boolean
  className?: string
  children?: React.ReactNode
  footer?: React.ReactNode
}

const SIZE_CLS: Record<ModalSize, string> = {
  sm:   'max-w-sm',
  md:   'max-w-md',
  lg:   'max-w-lg',
  xl:   'max-w-2xl',
  full: 'max-w-[min(96vw,1100px)] h-[min(92vh,840px)]',
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  closeOnOverlay = true,
  closeOnEsc = true,
  hideClose = false,
  className,
  children,
  footer,
}: ModalProps) {
  const titleId = React.useId()
  const descId = React.useId()
  const panelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)

    // First focusable kazansın
    const first = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    first?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [open, closeOnEsc, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-modal isolate flex items-center justify-center p-3 sm:p-6">
          {/* Backdrop */}
          <motion.div
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={closeOnOverlay ? onClose : undefined}
            className="absolute inset-0 bg-[rgb(var(--bg-overlay)/0.55)] backdrop-blur-md"
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descId : undefined}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'relative w-full overflow-hidden rounded-2xl border border-border bg-bg-card shadow-2xl',
              SIZE_CLS[size],
              className
            )}
          >
            {(title || description || !hideClose) && (
              <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
                <div className="min-w-0 flex-1">
                  {title ? (
                    <h2
                      id={titleId}
                      className="text-base font-bold tracking-tight text-text-primary sm:text-lg"
                    >
                      {title}
                    </h2>
                  ) : null}
                  {description ? (
                    <p id={descId} className="mt-1 text-sm text-text-tertiary">
                      {description}
                    </p>
                  ) : null}
                </div>
                {!hideClose && (
                  <button
                    type="button"
                    aria-label="Kapat"
                    onClick={onClose}
                    className="shrink-0 rounded-full p-2 text-text-tertiary transition-colors hover:bg-bg-subtle hover:text-text-primary"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </header>
            )}

            <div className="px-5 py-5">{children}</div>

            {footer ? (
              <footer className="flex items-center justify-end gap-2 border-t border-border-subtle bg-bg-subtle/30 px-5 py-3">
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * BottomSheet — NaHaber 2026
 *
 * iOS UISheetPresentationController tarzı yarı-ekran sheet.
 * Drag-to-dismiss, snap-points, keyboard avoid, sticky handle.
 *
 * Eski 5+ inline modal'ın (`.post-more-sheet`, `.feed-policy-modal` vb.)
 * yerini kademeli olarak alacak.
 */
type SheetSize = 'sm' | 'md' | 'lg' | 'full'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  size?: SheetSize
  /** Kapanırken arka planı kararttır */
  withOverlay?: boolean
  /** Body içine 'reels' temalı dark stil uygula (post-more-sheet-reels) */
  variant?: 'default' | 'reels'
  hideHandle?: boolean
  className?: string
  children?: React.ReactNode
}

const HEIGHT_CLS: Record<SheetSize, string> = {
  sm:   'max-h-[40dvh]',
  md:   'max-h-[60dvh]',
  lg:   'max-h-[80dvh]',
  full: 'h-[92dvh]',
}

const DRAG_CLOSE_THRESHOLD_PX = 80
const DRAG_CLOSE_VELOCITY = 500

export function BottomSheet({
  open,
  onClose,
  title,
  size = 'md',
  withOverlay = true,
  variant = 'default',
  hideHandle = false,
  className,
  children,
}: BottomSheetProps) {
  React.useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DRAG_CLOSE_THRESHOLD_PX || info.velocity.y > DRAG_CLOSE_VELOCITY) {
      onClose()
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-sheet flex flex-col justify-end">
          {withOverlay && (
            <motion.div
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={onClose}
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            />
          )}

          <motion.aside
            role="dialog"
            aria-modal="true"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320, mass: 0.9 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.3 }}
            onDragEnd={handleDragEnd}
            className={cn(
              'relative z-10 w-full overflow-hidden rounded-t-3xl border-t border-border shadow-2xl',
              variant === 'reels'
                ? 'bg-[#1c1c1e] text-white'
                : 'bg-bg-card text-text-primary',
              HEIGHT_CLS[size],
              className
            )}
          >
            {!hideHandle && (
              <div className="flex justify-center pt-2 pb-1">
                <span
                  className={cn(
                    'h-1 w-10 rounded-full',
                    variant === 'reels' ? 'bg-white/30' : 'bg-border-strong/40'
                  )}
                />
              </div>
            )}

            {title ? (
              <header className="px-5 pt-1 pb-3 text-center">
                <h2 className="text-base font-bold tracking-tight">{title}</h2>
              </header>
            ) : null}

            <div
              className={cn(
                'overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-1',
                size === 'full' ? 'flex-1' : ''
              )}
              style={{ maxHeight: size === 'full' ? '100%' : '78dvh' }}
            >
              {children}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

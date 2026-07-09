'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getSwipeableFeedDestinations, getSwipeIndexFromPathname } from '@/constants/config'

const SWIPE_THRESHOLD_PX = 56
const HORIZONTAL_INTENT_PX = 14

function isSwipeBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return !!target.closest('[data-no-category-swipe]')
}

export function useCategorySwipe(enabled: boolean) {
  const pathname = usePathname()
  const router = useRouter()
  const startX = useRef(0)
  const startY = useRef(0)
  const tracking = useRef(false)
  const horizontalLock = useRef(false)

  const navigateByDelta = useCallback(
    (deltaX: number) => {
      const index = getSwipeIndexFromPathname(pathname)
      if (index < 0) return

      const destinations = getSwipeableFeedDestinations()
      const nextIndex = deltaX < 0 ? index + 1 : index - 1
      if (nextIndex < 0 || nextIndex >= destinations.length) return

      const next = destinations[nextIndex]
      if (!next) return
      router.push(next.href)
    },
    [pathname, router]
  )

  useEffect(() => {
    if (!enabled) return

    const destinations = getSwipeableFeedDestinations()
    const index = getSwipeIndexFromPathname(pathname)
    if (index >= 0) {
      if (index > 0) router.prefetch(destinations[index - 1]!.href)
      if (index < destinations.length - 1) router.prefetch(destinations[index + 1]!.href)
    }
  }, [enabled, pathname, router])

  useEffect(() => {
    if (!enabled) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      if (isSwipeBlockedTarget(e.target)) return
      if (window.scrollY > 2) return

      startX.current = e.touches[0]!.clientX
      startY.current = e.touches[0]!.clientY
      tracking.current = true
      horizontalLock.current = false
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking.current) return

      const dx = e.touches[0]!.clientX - startX.current
      const dy = e.touches[0]!.clientY - startY.current

      if (!horizontalLock.current) {
        if (Math.abs(dx) < HORIZONTAL_INTENT_PX && Math.abs(dy) < HORIZONTAL_INTENT_PX) return
        if (Math.abs(dx) > Math.abs(dy) * 1.2) {
          horizontalLock.current = true
        } else {
          tracking.current = false
          return
        }
      }

      if (horizontalLock.current && Math.abs(dx) > Math.abs(dy)) {
        window.dispatchEvent(new CustomEvent('nahaber:category-swipe-lock'))
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking.current) return

      const dx = e.changedTouches[0]!.clientX - startX.current
      const wasHorizontal = horizontalLock.current

      tracking.current = false
      horizontalLock.current = false

      if (!wasHorizontal) return
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return

      navigateByDelta(dx)
    }

    const onTouchCancel = () => {
      tracking.current = false
      horizontalLock.current = false
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchCancel, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [enabled, navigateByDelta])
}

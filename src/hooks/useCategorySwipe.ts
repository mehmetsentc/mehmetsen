'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getSwipeableFeedDestinations, getSwipeIndexFromPathname } from '@/constants/config'

const SWIPE_THRESHOLD_PX = 72
const HORIZONTAL_INTENT_PX = 18
/** Category change only from screen edges — mid-screen card/rail pans stay local. */
const EDGE_ZONE_PX = 28

function isHorizontallyScrollable(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false
  const style = window.getComputedStyle(el)
  const ox = style.overflowX
  if (ox !== 'auto' && ox !== 'scroll' && ox !== 'overlay') return false
  return el.scrollWidth > el.clientWidth + 4
}

function isSwipeBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  let node: Element | null = target
  while (node && node !== document.documentElement) {
    if (node.hasAttribute('data-no-category-swipe')) return true
    if (isHorizontallyScrollable(node)) return true
    node = node.parentElement
  }
  return false
}

function isEdgeStart(clientX: number): boolean {
  const w = window.innerWidth || 0
  return clientX <= EDGE_ZONE_PX || clientX >= w - EDGE_ZONE_PX
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
      // Finger moves left (negative dx) → next category; right → previous
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

      const x = e.touches[0]!.clientX
      // Only edge gestures change category — avoids fighting card / rail pans.
      if (!isEdgeStart(x)) return
      if (window.scrollY > 8) return

      startX.current = x
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
        // Require clearly horizontal intent (stricter than before).
        if (Math.abs(dx) > Math.abs(dy) * 1.6) {
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

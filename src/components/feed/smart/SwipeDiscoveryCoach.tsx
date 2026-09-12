'use client'

/**
 * LEFT "Haberi Aç" affordance (V10) — per-article session coach.
 * Only the chip button receives pointer events (min 44×44).
 * Does NOT cover the card with a transparent overlay.
 *
 * iOS: NEVER put CSS transform on the pointer-events:none root (incl. Tailwind
 * -translate-*). WebKit fails hit-testing pointer-events:auto children under it.
 * Travel + vertical centering live on the INNER motion shell only.
 *
 * Position: ~52–58% of usable chrome (media → copy transition), responsive.
 * Ownership: once per articleId in the current Feed session (not global learned).
 */

import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '@/lib/feed/reader/gestureArbitration'
import {
  isCoachPaintedInViewport,
  markFeedCoachHandledForArticle,
  publishSwipeCoachDebug,
  recordSwipeDiscoveryShown,
  shouldShowSwipeDiscoveryCoach,
  SWIPE_DISCOVERY_ANIM_MS,
  SWIPE_DISCOVERY_CARD_NUDGE_PX,
  SWIPE_DISCOVERY_HINT_MS,
  SWIPE_DISCOVERY_REPEAT_COUNT,
  SWIPE_DISCOVERY_SETTLE_MS,
  SWIPE_DISCOVERY_TRAVEL_PX,
  type SwipeDiscoveryPhase,
} from '@/lib/feed/reader/swipeDiscoveryCoach'

type Props = {
  active: boolean
  articleId: string
  suppressed?: boolean
  onCardNudge?: (px: number) => void
  /** Same authority as successful LEFT swipe → openReader. */
  onAffordanceActivate?: () => void
}

export function SwipeDiscoveryCoach({
  active,
  articleId,
  suppressed = false,
  onCardNudge,
  onAffordanceActivate,
}: Props) {
  const [visible, setVisible] = useState(false)
  const [travel, setTravel] = useState(0)
  const [reduced, setReduced] = useState(false)
  const [phase, setPhase] = useState<SwipeDiscoveryPhase>('idle')
  const rootRef = useRef<HTMLDivElement>(null)
  const recordedRef = useRef(false)
  const onCardNudgeRef = useRef(onCardNudge)
  onCardNudgeRef.current = onCardNudge

  useEffect(() => {
    setReduced(prefersReducedMotion())
  }, [])

  useEffect(() => {
    const eligible = shouldShowSwipeDiscoveryCoach({ articleId })
    publishSwipeCoachDebug({
      mounted: true,
      eligible,
      phase,
      leftCoachVisible: visible,
      activeArticleId: articleId,
      feedCoachEligible: eligible,
      feedCoachShown: !eligible,
    })
  }, [phase, visible, active, articleId])

  useEffect(() => {
    onCardNudgeRef.current?.(0)
    recordedRef.current = false
    if (!active || suppressed || !shouldShowSwipeDiscoveryCoach({ articleId })) {
      setVisible(false)
      setTravel(0)
      setPhase(suppressed ? 'suppressed' : !active ? 'idle' : 'ineligible')
      return
    }

    let cancelled = false
    const timers: number[] = []
    setPhase('waiting')

    const tryRecordVisiblePaint = () => {
      if (cancelled || recordedRef.current) return
      const el = rootRef.current
      if (!isCoachPaintedInViewport(el)) {
        timers.push(
          window.setTimeout(() => {
            requestAnimationFrame(tryRecordVisiblePaint)
          }, 80)
        )
        return
      }
      recordedRef.current = true
      markFeedCoachHandledForArticle(articleId)
      recordSwipeDiscoveryShown()
      publishSwipeCoachDebug({
        mounted: true,
        eligible: false,
        phase: 'visible',
        leftCoachVisible: true,
        activeArticleId: articleId,
        feedCoachEligible: false,
        feedCoachShown: true,
      })
    }

    const scheduleTravelCycle = (cycle: number) => {
      if (cancelled || reduced) return
      const base = 80 + cycle * (SWIPE_DISCOVERY_ANIM_MS + 280)
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setPhase('animating')
          setTravel(-SWIPE_DISCOVERY_TRAVEL_PX)
          onCardNudgeRef.current?.(SWIPE_DISCOVERY_CARD_NUDGE_PX)
        }, base)
      )
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setTravel(0)
          onCardNudgeRef.current?.(0)
        }, base + SWIPE_DISCOVERY_ANIM_MS)
      )
    }

    const runSettleShow = () => {
      if (cancelled) return
      if (!shouldShowSwipeDiscoveryCoach({ articleId })) {
        setPhase('ineligible')
        return
      }

      setVisible(true)
      setPhase('visible')
      requestAnimationFrame(() => {
        requestAnimationFrame(tryRecordVisiblePaint)
      })

      if (reduced) {
        setTravel(-Math.round(SWIPE_DISCOVERY_TRAVEL_PX * 0.45))
        timers.push(
          window.setTimeout(() => {
            if (cancelled) return
            setVisible(false)
            setPhase('done')
            onCardNudgeRef.current?.(0)
          }, SWIPE_DISCOVERY_HINT_MS)
        )
        return
      }

      setTravel(0)
      onCardNudgeRef.current?.(0)
      for (let i = 0; i < SWIPE_DISCOVERY_REPEAT_COUNT; i++) scheduleTravelCycle(i)
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setVisible(false)
          setPhase('done')
          setTravel(0)
          onCardNudgeRef.current?.(0)
        }, SWIPE_DISCOVERY_HINT_MS)
      )
    }

    const settle = window.setTimeout(runSettleShow, SWIPE_DISCOVERY_SETTLE_MS)

    const onReplay = () => {
      if (!active || suppressed) return
      cancelled = false
      recordedRef.current = false
      for (const t of timers) window.clearTimeout(t)
      timers.length = 0
      setPhase('waiting')
      runSettleShow()
    }
    window.addEventListener('nahaber-swipe-discovery-replay', onReplay)

    return () => {
      cancelled = true
      window.clearTimeout(settle)
      for (const t of timers) window.clearTimeout(t)
      window.removeEventListener('nahaber-swipe-discovery-replay', onReplay)
      onCardNudgeRef.current?.(0)
    }
  }, [active, suppressed, reduced, articleId])

  useEffect(() => {
    if (suppressed) {
      setVisible(false)
      setTravel(0)
      setPhase('suppressed')
      onCardNudgeRef.current?.(0)
    }
  }, [suppressed])

  useEffect(() => {
    return () => {
      publishSwipeCoachDebug({ mounted: false, phase: 'idle', leftCoachVisible: false })
    }
  }, [])

  if (!active) return null
  if (!visible) {
    return (
      <div
        ref={rootRef}
        data-testid="feed-swipe-discovery-coach-slot"
        data-swipe-discovery-phase={phase}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[40]"
      />
    )
  }

  const resting = phase === 'done'

  return (
    <div
      ref={rootRef}
      data-testid="feed-swipe-discovery-coach"
      data-swipe-discovery-v10="1"
      data-swipe-discovery-phase={phase}
      data-swipe-coach-article={articleId}
      className="pointer-events-none absolute inset-x-0 z-[40] flex justify-center pl-10"
      style={{
        /* Media → copy transition band (~52–58% of chrome). No transform on this root. */
        top: 'min(58%, max(48%, calc(var(--feed-v2-top-clearance) + var(--feed-v2-hero-min) * 0.92)))',
        opacity: resting ? 0 : 1,
        transition: 'opacity 280ms ease',
      }}
    >
      <div
        aria-hidden={false}
        data-testid="feed-swipe-discovery-motion-shell"
        style={{
          /* Y-center + travel on INNER shell only (iOS hit-test safe). */
          transform: `translate3d(${travel}px, -50%, 0)`,
          transition: reduced
            ? undefined
            : `transform ${SWIPE_DISCOVERY_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      >
        <button
          type="button"
          data-testid="feed-swipe-discovery-affordance"
          data-no-reader-gesture="1"
          aria-label="Haberi Aç — sola kaydır veya dokun"
          disabled={!onAffordanceActivate}
          onPointerUp={(e) => {
            // iOS Safari: prefer pointerup over click when parent trees use pointer capture.
            if (!onAffordanceActivate) return
            if (e.pointerType === 'mouse' && e.button !== 0) return
            e.preventDefault()
            e.stopPropagation()
            onAffordanceActivate()
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onAffordanceActivate?.()
          }}
          className="pointer-events-auto relative flex min-h-11 min-w-[11.5rem] touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-2xl px-5 py-3 text-white active:scale-[0.98] disabled:opacity-90 [-webkit-tap-highlight-color:transparent]"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(37,99,235,0.45) 0%, rgba(0,0,0,0.72) 62%, rgba(0,0,0,0.55) 100%)',
            boxShadow:
              '0 0 36px rgba(37,99,235,0.55), 0 12px 28px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(147,197,253,0.35)',
          }}
        >
          <span
            className="flex items-center gap-2"
            data-testid="feed-swipe-discovery-motion-row"
          >
            <span
              className="relative flex h-9 w-9 shrink-0 items-center justify-center"
              aria-hidden
              data-testid="feed-swipe-discovery-finger"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M8 11V7.5a1.5 1.5 0 0 1 3 0V11"
                  stroke="white"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
                <path
                  d="M11 10.5V6.75a1.5 1.5 0 0 1 3 0V11"
                  stroke="white"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
                <path
                  d="M14 11V8.5a1.5 1.5 0 0 1 3 0V14c0 2.8-1.7 5-5 5H10.5C8 19 6.5 17 6.5 14.5V12"
                  stroke="white"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="9.5" cy="5" r="1.35" fill="#93c5fd" />
              </svg>
            </span>
            <span
              className="flex items-center gap-0.5 text-[1.35rem] font-black leading-none tracking-[-0.12em] text-sky-300"
              aria-hidden
              data-testid="feed-swipe-discovery-chevrons"
            >
              <span>‹</span>
              <span>‹</span>
              <span>‹</span>
            </span>
          </span>
          <span className="text-[15px] font-extrabold tracking-[0.02em]" data-testid="feed-swipe-discovery-title">
            Haberi Aç
          </span>
          <span
            className="text-[11px] font-medium tracking-wide text-white/85"
            data-testid="feed-swipe-discovery-subtitle"
          >
            Sola kaydır — haberi aç
          </span>
        </button>
      </div>
    </div>
  )
}

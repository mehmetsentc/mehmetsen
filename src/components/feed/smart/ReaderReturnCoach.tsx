'use client'

/**
 * LEFT "Akışa Dön" affordance — visual cue + tappable close authority.
 * Only the chip button receives pointer events (min 44×44).
 */

import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '@/lib/feed/reader/gestureArbitration'
import { isCoachPaintedInViewport } from '@/lib/feed/reader/swipeDiscoveryCoach'
import {
  publishReaderReturnCoachDebug,
  recordReaderReturnCoachShown,
  READER_RETURN_COACH_ANIM_MS,
  READER_RETURN_COACH_HINT_MS,
  READER_RETURN_COACH_REPEAT_COUNT,
  READER_RETURN_COACH_SETTLE_MS,
  READER_RETURN_COACH_TRAVEL_PX,
  shouldShowReaderReturnCoach,
  type ReaderReturnCoachPhase,
} from '@/lib/feed/reader/readerReturnCoach'

type Props = {
  active: boolean
  suppressed?: boolean
  /** Same authority as successful LEFT swipe → closeReader. */
  onAffordanceActivate?: () => void
}

export function ReaderReturnCoach({ active, suppressed = false, onAffordanceActivate }: Props) {
  const [visible, setVisible] = useState(false)
  const [travel, setTravel] = useState(0)
  const [reduced, setReduced] = useState(false)
  const [phase, setPhase] = useState<ReaderReturnCoachPhase>('idle')
  const rootRef = useRef<HTMLDivElement>(null)
  const recordedRef = useRef(false)

  useEffect(() => {
    setReduced(prefersReducedMotion())
  }, [])

  useEffect(() => {
    publishReaderReturnCoachDebug({
      mounted: true,
      eligible: shouldShowReaderReturnCoach(),
      phase,
      rightCoachVisible: visible,
    })
  }, [phase, visible, active])

  useEffect(() => {
    recordedRef.current = false
    if (!active || suppressed || !shouldShowReaderReturnCoach()) {
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
      recordReaderReturnCoachShown()
      publishReaderReturnCoachDebug({
        mounted: true,
        eligible: true,
        phase: 'visible',
        rightCoachVisible: true,
      })
    }

    const scheduleTravelCycle = (cycle: number) => {
      if (cancelled || reduced) return
      const base = 80 + cycle * (READER_RETURN_COACH_ANIM_MS + 280)
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setPhase('animating')
          setTravel(-READER_RETURN_COACH_TRAVEL_PX)
        }, base)
      )
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setTravel(0)
        }, base + READER_RETURN_COACH_ANIM_MS)
      )
    }

    const runSettleShow = () => {
      if (cancelled) return
      if (!shouldShowReaderReturnCoach()) {
        setPhase('ineligible')
        return
      }

      setVisible(true)
      setPhase('visible')
      requestAnimationFrame(() => {
        requestAnimationFrame(tryRecordVisiblePaint)
      })

      if (reduced) {
        setTravel(-Math.round(READER_RETURN_COACH_TRAVEL_PX * 0.45))
        return
      }

      setTravel(0)
      for (let i = 0; i < READER_RETURN_COACH_REPEAT_COUNT; i++) scheduleTravelCycle(i)
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setVisible(false)
          setPhase('done')
        }, READER_RETURN_COACH_HINT_MS)
      )
    }

    const settle = window.setTimeout(runSettleShow, READER_RETURN_COACH_SETTLE_MS)

    const onReplay = () => {
      if (!active || suppressed) return
      cancelled = false
      recordedRef.current = false
      for (const t of timers) window.clearTimeout(t)
      timers.length = 0
      setPhase('waiting')
      runSettleShow()
    }
    window.addEventListener('nahaber-reader-return-coach-replay', onReplay)

    return () => {
      cancelled = true
      window.clearTimeout(settle)
      for (const t of timers) window.clearTimeout(t)
      window.removeEventListener('nahaber-reader-return-coach-replay', onReplay)
    }
  }, [active, suppressed, reduced])

  useEffect(() => {
    if (suppressed) {
      setVisible(false)
      setTravel(0)
      setPhase('suppressed')
    }
  }, [suppressed])

  useEffect(() => {
    return () => {
      publishReaderReturnCoachDebug({ mounted: false, phase: 'idle', rightCoachVisible: false })
    }
  }, [])

  if (!active) return null
  if (!visible) {
    return (
      <div
        ref={rootRef}
        data-testid="reader-return-coach-slot"
        data-reader-return-phase={phase}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[50]"
      />
    )
  }

  return (
    <div
      ref={rootRef}
      data-testid="reader-return-coach"
      data-reader-return-coach-v4="1"
      data-reader-return-phase={phase}
      className="pointer-events-none absolute left-1/2 top-[38%] z-[50] -translate-x-1/2 -translate-y-1/2"
      style={{
        transform: `translate3d(calc(-50% + ${travel}px), -50%, 0)`,
        transition: reduced
          ? undefined
          : `transform ${READER_RETURN_COACH_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease`,
        opacity: 1,
      }}
    >
      <button
        type="button"
        data-testid="reader-return-affordance"
        aria-label="Akışa Dön — sola kaydır veya dokun"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onAffordanceActivate?.()
        }}
        className="pointer-events-auto flex min-h-11 min-w-[11rem] touch-manipulation items-center justify-center gap-2 rounded-full bg-black/80 px-4 py-2.5 text-[14px] font-semibold tracking-wide text-white ring-1 ring-white/25 backdrop-blur-[6px] active:scale-[0.98]"
        style={{
          boxShadow: '0 12px 32px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(225,29,46,0.55)',
        }}
      >
        <span
          className="flex items-center gap-0.5 text-[16px] font-bold leading-none text-white"
          aria-hidden
          data-testid="reader-return-coach-chevrons"
        >
          <span className="text-[#e11d2e]">‹</span>
          <span>‹</span>
          <span>‹</span>
        </span>
        <span className="font-bold tracking-[0.04em]">Akışa Dön</span>
        <span
          className="relative ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center"
          aria-hidden
          data-testid="reader-return-coach-finger"
        >
          <span className="absolute h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_0_3px_rgba(225,29,46,0.75)]" />
        </span>
      </button>
    </div>
  )
}

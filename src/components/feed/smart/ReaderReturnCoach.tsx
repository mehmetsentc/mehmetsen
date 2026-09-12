'use client'

/**
 * RIGHT "Akışa Dön" affordance — visual cue + tappable close authority.
 * Only the chip button receives pointer events (min 44×44).
 *
 * iOS: never put CSS transform on the pointer-events:none root (incl. Tailwind
 * -translate-*). Travel lives on an INNER motion shell only.
 *
 * Ownership: once per Reader articleId+generation (not global learned).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { prefersReducedMotion } from '@/lib/feed/reader/gestureArbitration'
import { isCoachPaintedInViewport } from '@/lib/feed/reader/swipeDiscoveryCoach'
import {
  markReaderCoachHandledForScope,
  publishReaderReturnCoachDebug,
  readerCoachScopeKey,
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
  articleId: string
  generation?: number | null
  suppressed?: boolean
  /** Same authority as successful RIGHT swipe → closeReader. */
  onAffordanceActivate?: () => void
}

export function ReaderReturnCoach({
  active,
  articleId,
  generation = null,
  suppressed = false,
  onAffordanceActivate,
}: Props) {
  const [visible, setVisible] = useState(false)
  const [travel, setTravel] = useState(0)
  const [reduced, setReduced] = useState(false)
  const [phase, setPhase] = useState<ReaderReturnCoachPhase>('idle')
  const rootRef = useRef<HTMLDivElement>(null)
  const recordedRef = useRef(false)
  const scopeKey = useMemo(
    () => readerCoachScopeKey({ articleId, generation }),
    [articleId, generation]
  )

  useEffect(() => {
    setReduced(prefersReducedMotion())
  }, [])

  useEffect(() => {
    const eligible = shouldShowReaderReturnCoach({ scopeKey })
    publishReaderReturnCoachDebug({
      mounted: true,
      eligible,
      phase,
      rightCoachVisible: visible,
      readerGeneration: generation ?? null,
      readerCoachEligible: eligible,
      readerCoachShown: !eligible,
      scopeKey,
    })
  }, [phase, visible, active, scopeKey, generation])

  useEffect(() => {
    recordedRef.current = false
    if (!active || suppressed || !shouldShowReaderReturnCoach({ scopeKey })) {
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
      markReaderCoachHandledForScope(scopeKey)
      recordReaderReturnCoachShown()
      publishReaderReturnCoachDebug({
        mounted: true,
        eligible: false,
        phase: 'visible',
        rightCoachVisible: true,
        readerGeneration: generation ?? null,
        readerCoachEligible: false,
        readerCoachShown: true,
        scopeKey,
      })
    }

    const scheduleTravelCycle = (cycle: number) => {
      if (cancelled || reduced) return
      const base = 80 + cycle * (READER_RETURN_COACH_ANIM_MS + 280)
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setPhase('animating')
          setTravel(READER_RETURN_COACH_TRAVEL_PX)
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
      if (!shouldShowReaderReturnCoach({ scopeKey })) {
        setPhase('ineligible')
        return
      }

      setVisible(true)
      setPhase('visible')
      requestAnimationFrame(() => {
        requestAnimationFrame(tryRecordVisiblePaint)
      })

      if (reduced) {
        setTravel(Math.round(READER_RETURN_COACH_TRAVEL_PX * 0.45))
        timers.push(
          window.setTimeout(() => {
            if (cancelled) return
            setVisible(false)
            setPhase('done')
          }, READER_RETURN_COACH_HINT_MS)
        )
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
  }, [active, suppressed, reduced, scopeKey, generation])

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
      data-reader-return-coach-v6="1"
      data-reader-return-phase={phase}
      data-reader-coach-scope={scopeKey}
      className="pointer-events-none absolute inset-x-0 top-[38%] z-[50] flex justify-center"
      style={{ opacity: 1 }}
    >
      <div
        data-testid="reader-return-motion-shell"
        style={{
          transform: `translate3d(${travel}px, -50%, 0)`,
          transition: reduced
            ? undefined
            : `transform ${READER_RETURN_COACH_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      >
        <button
          type="button"
          data-testid="reader-return-affordance"
          data-no-reader-gesture="1"
          aria-label="Akışa Dön — sağa kaydır veya dokun"
          onPointerUp={(e) => {
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
          className="pointer-events-auto flex min-h-11 min-w-[11rem] touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl bg-black/80 px-4 py-2.5 text-white ring-1 ring-white/25 backdrop-blur-[6px] active:scale-[0.98] [-webkit-tap-highlight-color:transparent]"
          style={{
            boxShadow: '0 12px 32px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(225,29,46,0.55)',
          }}
        >
          <span
            className="flex items-center gap-2"
            data-testid="reader-return-coach-motion-row"
          >
            <span
              className="relative flex h-7 w-7 shrink-0 items-center justify-center"
              aria-hidden
              data-testid="reader-return-coach-finger"
            >
              <span className="absolute h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_0_3px_rgba(225,29,46,0.75)]" />
            </span>
            <span
              className="flex items-center gap-0.5 text-[16px] font-bold leading-none text-white"
              aria-hidden
              data-testid="reader-return-coach-chevrons"
            >
              <span className="text-[#e11d2e]">›</span>
              <span>›</span>
              <span>›</span>
            </span>
          </span>
          <span className="text-[14px] font-bold tracking-[0.04em]">Akışa Dön</span>
          <span
            className="text-[11px] font-medium tracking-wide text-white/85"
            data-testid="reader-return-coach-subtitle"
          >
            Akışa dönmek için sağa kaydır
          </span>
        </button>
      </div>
    </div>
  )
}

'use client'

/**
 * RIGHT-swipe return hint inside FeedArticleReader.
 * pointer-events: none — never intercepts gestures or history.
 */

import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '@/lib/feed/reader/gestureArbitration'
import { isCoachPaintedInViewport } from '@/lib/feed/reader/swipeDiscoveryCoach'
import {
  publishReaderReturnCoachDebug,
  recordReaderReturnCoachShown,
  READER_RETURN_COACH_ANIM_MS,
  READER_RETURN_COACH_HINT_MS,
  READER_RETURN_COACH_SETTLE_MS,
  READER_RETURN_COACH_TRAVEL_PX,
  shouldShowReaderReturnCoach,
  type ReaderReturnCoachPhase,
} from '@/lib/feed/reader/readerReturnCoach'

type Props = {
  active: boolean
  suppressed?: boolean
}

export function ReaderReturnCoach({ active, suppressed = false }: Props) {
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
          }, 50)
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
        setTravel(Math.round(READER_RETURN_COACH_TRAVEL_PX * 0.45))
        timers.push(
          window.setTimeout(() => {
            if (cancelled) return
            setVisible(false)
            setTravel(0)
            setPhase('done')
          }, READER_RETURN_COACH_HINT_MS)
        )
        return
      }

      setTravel(0)
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setPhase('animating')
          setTravel(READER_RETURN_COACH_TRAVEL_PX)
        }, 80)
      )
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setTravel(0)
        }, 80 + READER_RETURN_COACH_ANIM_MS)
      )
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
        className="pointer-events-none absolute inset-0 z-[40]"
      />
    )
  }

  return (
    <div
      ref={rootRef}
      data-testid="reader-return-coach"
      data-reader-return-coach-v1="1"
      data-reader-return-phase={phase}
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-[42%] z-[40] -translate-x-1/2 -translate-y-1/2"
      style={{
        transform: `translate3d(calc(-50% + ${travel}px), -50%, 0)`,
        transition: reduced
          ? undefined
          : `transform ${READER_RETURN_COACH_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease`,
        opacity: 1,
      }}
    >
      <div
        className="pointer-events-none flex items-center gap-2 rounded-full bg-black/72 px-3.5 py-2 text-[13px] font-semibold tracking-wide text-white ring-1 ring-white/20 backdrop-blur-[5px]"
        style={{
          boxShadow: '0 10px 28px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(225,29,46,0.4)',
        }}
      >
        <span
          className="relative mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center"
          aria-hidden
          data-testid="reader-return-coach-finger"
        >
          <span className="absolute h-3 w-3 rounded-full bg-white shadow-[0_0_0_2px_rgba(225,29,46,0.7)]" />
        </span>
        <span className="font-bold">Akışa Dön</span>
        <span
          className="flex items-center gap-0.5 text-[15px] font-bold leading-none text-white"
          aria-hidden
          data-testid="reader-return-coach-chevrons"
        >
          <span>›</span>
          <span className="text-[#e11d2e]">›</span>
        </span>
      </div>
    </div>
  )
}

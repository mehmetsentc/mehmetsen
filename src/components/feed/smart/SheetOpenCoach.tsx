'use client'

/**
 * Feed V3 — upward "Haberi Aç" sheet affordance (tap or cue for up-open).
 */

import { useEffect, useState } from 'react'

type Props = {
  active: boolean
  onActivate?: () => void
}

export function SheetOpenCoach({ active, onActivate }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }
    const t = window.setTimeout(() => setVisible(true), 450)
    return () => window.clearTimeout(t)
  }, [active])

  if (!active || !visible) return null

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-[40] flex justify-center"
      style={{ top: 'min(52%, max(42%, 12rem))' }}
      data-testid="feed-v3-sheet-open-coach"
    >
      <button
        type="button"
        data-testid="feed-v3-sheet-open-affordance"
        data-no-reader-gesture="1"
        aria-label="Haberi Aç — yukarı kaydır veya dokun"
        disabled={!onActivate}
        onPointerUp={(e) => {
          if (!onActivate) return
          if (e.pointerType === 'mouse' && e.button !== 0) return
          e.preventDefault()
          e.stopPropagation()
          onActivate()
        }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onActivate?.()
        }}
        className="pointer-events-auto flex min-h-11 min-w-[12rem] touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-2xl px-5 py-3 text-white active:scale-[0.98] disabled:opacity-90 [-webkit-tap-highlight-color:transparent]"
        style={{
          background: 'rgba(12,12,14,0.82)',
          boxShadow: '0 14px 36px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.14)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <span className="flex items-center gap-1 text-[18px] font-bold leading-none text-white" aria-hidden>
          <span className="text-[#e11d2e]">ˆ</span>
          <span>ˆ</span>
          <span>ˆ</span>
        </span>
        <span className="text-[15px] font-extrabold tracking-[0.02em]">Haberi Aç</span>
        <span className="text-[11px] font-medium tracking-wide text-white/85">
          Yukarı kaydır veya dokun
        </span>
      </button>
    </div>
  )
}

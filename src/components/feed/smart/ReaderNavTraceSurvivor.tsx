'use client'

/**
 * Pilot-only. Survives /feed-v2 → HOME so the nav trace can be copied.
 * Hidden unless this browser session enabled the trace (?readerDebug=1).
 * Does not use App Router search hooks — must not deopt the root layout.
 *
 * COLLAPSED (default): only a tiny TRACE button receives pointer events.
 * No large fixed overlay over Feed. Tracing continues in the background.
 */

import { useEffect, useState } from 'react'
import {
  formatReaderNavTraceExport,
  getReaderNavTrace,
  hasPilotNavTraceSession,
  hydrateReaderNavTraceFromSession,
  installReaderNavTraceHooks,
  recordReaderNavTrace,
  setReaderNavTraceEnabled,
} from '@/lib/feed/reader/navTrace'
import {
  readSwipeCoachDebug,
  resetSwipeDiscoveryPresentation,
} from '@/lib/feed/reader/swipeDiscoveryCoach'

const TRACE_TICK = 'nahaber-reader-nav-trace'
const PANEL_OPEN_KEY = 'nahaber.readerNavTrace.panelOpen'

export function dispatchReaderNavTraceTick(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(TRACE_TICK))
}

function readPanelOpenPreference(): boolean {
  try {
    return sessionStorage.getItem(PANEL_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function writePanelOpenPreference(open: boolean): void {
  try {
    if (open) sessionStorage.setItem(PANEL_OPEN_KEY, '1')
    else sessionStorage.removeItem(PANEL_OPEN_KEY)
  } catch {
    // ignore
  }
}

export function ReaderNavTraceSurvivor() {
  const [visible, setVisible] = useState(false)
  /** Default COLLAPSED — must not intercept Feed gestures. */
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [coachReplay, setCoachReplay] = useState(false)
  const [coachDebug, setCoachDebug] = useState(() => readSwipeCoachDebug())
  const [count, setCount] = useState(0)
  const [lastType, setLastType] = useState('')
  const [path, setPath] = useState('')

  useEffect(() => {
    const queryOn =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('readerDebug') === '1'
    const sessionOn = hasPilotNavTraceSession()
    if (!queryOn && !sessionOn) return
    hydrateReaderNavTraceFromSession()
    setReaderNavTraceEnabled(true)
    installReaderNavTraceHooks()
    setVisible(true)
    setOpen(readPanelOpenPreference())
    const sync = () => {
      const list = getReaderNavTrace()
      setCount(list.length)
      setLastType(list[list.length - 1]?.type ?? '')
      setPath(typeof window !== 'undefined' ? window.location.pathname : '')
    }
    sync()
    let lastPath = window.location.pathname
    const onPathMaybeChanged = () => {
      const next = window.location.pathname
      if (next !== lastPath) {
        lastPath = next
        recordReaderNavTrace({
          type: 'route_change',
          pathname: next,
          search: window.location.search,
          historyLength: window.history.length,
          readerOpenId: null,
          feedSessionId: null,
          readerMounted: false,
          feedMounted: Boolean(document.querySelector('[data-feed-mounted="1"]')),
          readerState: 'closed',
          source: 'route',
        })
      }
      sync()
    }
    window.addEventListener(TRACE_TICK, sync)
    window.addEventListener('popstate', onPathMaybeChanged)
    const onCoachDebug = () => setCoachDebug(readSwipeCoachDebug())
    window.addEventListener('nahaber-swipe-coach-debug', onCoachDebug)
    const id = window.setInterval(onPathMaybeChanged, 500)
    return () => {
      window.removeEventListener(TRACE_TICK, sync)
      window.removeEventListener('popstate', onPathMaybeChanged)
      window.removeEventListener('nahaber-swipe-coach-debug', onCoachDebug)
      window.clearInterval(id)
    }
  }, [])

  if (!visible) return null

  const copy = async () => {
    const text = formatReaderNavTraceExport()
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const replaySwipeCoach = () => {
    resetSwipeDiscoveryPresentation()
    setCoachReplay(true)
    window.setTimeout(() => setCoachReplay(false), 1500)
    // Soft remount signal for active card coach (presentation only).
    window.dispatchEvent(new Event('nahaber-swipe-discovery-replay'))
  }

  const toggleOpen = () => {
    setOpen((v) => {
      const next = !v
      writePanelOpenPreference(next)
      return next
    })
  }

  // Collapsed: wrapper is pointer-events-none; only the tiny TRACE chip is interactive.
  if (!open) {
    return (
      <div
        data-testid="reader-nav-trace-survivor"
        data-trace-collapsed="1"
        className="pointer-events-none fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] right-2 z-[220]"
      >
        <button
          type="button"
          data-testid="reader-nav-trace-toggle"
          className="pointer-events-auto rounded border-2 border-lime-400 bg-black/95 px-2 py-1 font-mono text-[10px] font-extrabold text-lime-300 shadow-[0_0_0_2px_rgba(0,0,0,0.85)]"
          onClick={toggleOpen}
          aria-expanded={false}
          aria-label="Open navigation trace"
        >
          TRACE
        </button>
      </div>
    )
  }

  return (
    <aside
      data-testid="reader-nav-trace-survivor"
      data-trace-collapsed="0"
      className="pointer-events-none fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] right-2 z-[220] w-[min(22rem,calc(100vw-1rem))]"
    >
      <div className="pointer-events-auto rounded-md border-2 border-lime-400 bg-black/95 p-2 font-mono text-[11px] leading-snug text-lime-200 shadow-[0_0_0_2px_rgba(0,0,0,0.85)]">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            data-testid="reader-nav-trace-toggle"
            className="font-extrabold text-lime-300"
            onClick={toggleOpen}
            aria-expanded={true}
          >
            TRACE ▾
          </button>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              data-testid="reader-nav-trace-replay-coach"
              className="rounded border border-lime-400 px-2 py-0.5 text-lime-100"
              onClick={replaySwipeCoach}
            >
              {coachReplay ? 'Coach reset' : 'Replay Swipe Coach'}
            </button>
            <button
              type="button"
              data-testid="reader-nav-trace-copy"
              className="rounded border border-lime-400 px-2 py-0.5 text-lime-100"
              onClick={() => void copy()}
            >
              {copied ? 'Copied' : 'Copy Navigation Trace'}
            </button>
          </div>
        </div>
        <div className="max-h-[28vh] overflow-auto whitespace-pre-wrap break-all">
          {`path: ${path}\nevents: ${count}\nlast: ${lastType}\ncoach: mounted=${coachDebug.mounted ? 1 : 0} eligible=${coachDebug.eligible ? 1 : 0} learned=${coachDebug.learned ? 1 : 0} shown=${coachDebug.shownCount} phase=${coachDebug.phase}\nCopy after escape. No identifiers.`}
        </div>
      </div>
    </aside>
  )
}

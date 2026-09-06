'use client'

/**
 * Pilot-only. Survives /feed-v2 → HOME so the nav trace can be copied.
 * Hidden unless this browser session enabled the trace (?readerDebug=1).
 * Does not use App Router search hooks — must not deopt the root layout.
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

const TRACE_TICK = 'nahaber-reader-nav-trace'

export function dispatchReaderNavTraceTick(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(TRACE_TICK))
}

export function ReaderNavTraceSurvivor() {
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)
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
    const id = window.setInterval(onPathMaybeChanged, 500)
    return () => {
      window.removeEventListener(TRACE_TICK, sync)
      window.removeEventListener('popstate', onPathMaybeChanged)
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

  return (
    <aside
      data-testid="reader-nav-trace-survivor"
      className="pointer-events-auto fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] right-2 z-[220] w-[min(22rem,calc(100vw-1rem))] rounded-md border-2 border-lime-400 bg-black/95 p-2 font-mono text-[11px] leading-snug text-lime-200 shadow-[0_0_0_2px_rgba(0,0,0,0.85)]"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <button type="button" className="font-extrabold text-lime-300" onClick={() => setOpen((v) => !v)}>
          NAV TRACE {open ? '▾' : '▸'}
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
      {open ? (
        <div className="max-h-[28vh] overflow-auto whitespace-pre-wrap break-all">
          {`path: ${path}\nevents: ${count}\nlast: ${lastType}\nCopy after HOME. No identifiers.`}
        </div>
      ) : null}
    </aside>
  )
}

'use client'

/**
 * PREVIEW-ONLY viewport / focus-zoom probe.
 *
 * Rendered by the root layout only when VERCEL_ENV === 'preview' (baked at
 * build time), so Production never mounts it. It records, on-device:
 *   build SHA, focused field + computed font-size, visualViewport
 *   scale/width/height/offsetLeft/offsetTop, innerWidth, clientWidth,
 *   scrollWidth, all viewport meta contents, html/body zoom + transform +
 *   inline style (scroll lock), navbar bounds and safe-area insets —
 * before focus, during focus (+700 ms, keyboard up) and after blur
 * (+800 ms, keyboard down). Nothing is sent anywhere: no fetch, no beacon,
 * no analytics. The panel is position:fixed, pointer-events:none (only the
 * small toggle is tappable) and contains no form controls, so it cannot
 * change form layout or trigger focus zoom itself.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

type Row = string

const MAX_ROWS = 200
const SHOWN_ROWS = 12

function r(n: number): number {
  return Math.round(n)
}

function fieldLabel(el: Element | null): string {
  if (!el || el === document.body) return '-'
  const tag = el.tagName.toLowerCase()
  const name = (el as HTMLInputElement).name || (el as HTMLInputElement).type || ''
  const cls = (el.getAttribute('class') || '').split(/\s+/)[0] || ''
  return [tag, name, cls].filter(Boolean).join('.').slice(0, 28)
}

function isTextEntry(el: Element | null): el is HTMLElement {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) {
    return !/^(checkbox|radio|range|color|file|hidden|button|submit|reset|image)$/.test(el.type)
  }
  return (el as HTMLElement).isContentEditable === true
}

export function PreviewViewportProbe({ sha }: { sha: string }) {
  const pathname = usePathname()
  const rowsRef = useRef<Row[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [open, setOpen] = useState(true)
  const [head, setHead] = useState('')
  const insetRef = useRef<HTMLDivElement | null>(null)

  const measure = useCallback(
    (tag: string) => {
      if (typeof window === 'undefined') return
      const d = document.documentElement
      const b = document.body
      const vv = window.visualViewport
      const active = document.activeElement
      const fs = isTextEntry(active) ? getComputedStyle(active).fontSize : '-'
      const nav = document.querySelector('.mobile-bottom-nav-pill')
      const nr = nav ? nav.getBoundingClientRect() : null
      const hcs = getComputedStyle(d)
      const bcs = getComputedStyle(b)
      const zoomOf = (cs: CSSStyleDeclaration) =>
        (cs as unknown as { zoom?: string }).zoom || '-'
      const inset = insetRef.current ? getComputedStyle(insetRef.current) : null
      const scale = vv ? vv.scale : 1
      const overflow = d.scrollWidth > d.clientWidth
      let culprit = ''
      if (overflow) {
        const limit = d.clientWidth + 1
        const hits: string[] = []
        const all = document.body.querySelectorAll<HTMLElement>('*')
        for (let i = 0; i < all.length && hits.length < 3; i++) {
          const el = all[i]
          if (el.closest('[data-preview-probe]')) continue
          const rect = el.getBoundingClientRect()
          if (rect.right > limit && rect.width > 0) hits.push(fieldLabel(el) + '@' + r(rect.right))
        }
        culprit = ' OVF:' + hits.join(',')
      }
      const verdict =
        (scale > 1.01 ? 'ZOOM' : scale < 0.99 ? 'ZOOM-OUT' : 'scale1') +
        (overflow ? '+TAŞMA' : '')
      const row = [
        new Date().toISOString().slice(14, 22),
        tag.padEnd(10),
        verdict,
        'el=' + fieldLabel(active),
        'fs=' + fs,
        'vv=' + (vv ? [scale.toFixed(3), r(vv.width), r(vv.height), r(vv.offsetLeft), r(vv.offsetTop)].join('/') : '-'),
        'iw=' + window.innerWidth + 'x' + window.innerHeight,
        'cw/sw=' + d.clientWidth + '/' + d.scrollWidth + '/' + b.scrollWidth,
        'nav=' + (nr ? [r(nr.left), r(nr.right), r(nr.bottom)].join(',') : '-'),
        'z=' + zoomOf(hcs) + '/' + zoomOf(bcs),
        'tf=' + (hcs.transform === 'none' ? '-' : hcs.transform) + '/' + (bcs.transform === 'none' ? '-' : bcs.transform),
        'inl=' + ((d.getAttribute('style') || '').replace(/\s+/g, '').slice(0, 40) || '-') + '|' + ((b.getAttribute('style') || '').replace(/\s+/g, '').slice(0, 30) || '-'),
        'sa=' + (inset ? [inset.paddingTop, inset.paddingBottom].join('/') : '-'),
        'p=' + window.location.pathname,
      ].join(' ') + culprit
      rowsRef.current = [...rowsRef.current, row].slice(-MAX_ROWS)
      setRows(rowsRef.current.slice(-SHOWN_ROWS))
    },
    []
  )

  // Static header: SHA, UA, standalone, all viewport metas (re-read on change).
  useEffect(() => {
    const readHead = () => {
      const metas = Array.from(document.querySelectorAll('meta[name="viewport"]'))
        .map((m, i) => `#${i + 1} ${m.getAttribute('content')}`)
        .join(' || ')
      const standalone =
        (navigator as unknown as { standalone?: boolean }).standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches
      const ua = navigator.userAgent.match(/(iPhone OS [\d_]+|Android [\d.]+|CriOS\/[\d.]+|Version\/[\d.]+|Chrome\/[\d.]+)/g)
      setHead(
        `SHA ${sha} | ${standalone ? 'PWA' : 'tarayıcı'} | ${ua ? ua.join(' ') : navigator.userAgent.slice(0, 60)} | dpr ${window.devicePixelRatio} | viewport(${document.querySelectorAll('meta[name="viewport"]').length}): ${metas}`
      )
    }
    readHead()
    const mo = new MutationObserver(() => {
      readHead()
      measure('vp-change')
    })
    mo.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] })
    return () => mo.disconnect()
  }, [sha, measure])

  // Before focus (start/route), during focus, after blur, keyboard/zoom resizes.
  useEffect(() => {
    const timers: number[] = []
    const later = (tag: string, ms: number) => {
      timers.push(window.setTimeout(() => measure(tag), ms))
    }
    const onFocusIn = (e: FocusEvent) => {
      if (!isTextEntry(e.target as Element)) return
      measure('focus')
      later('focus+700', 700)
    }
    const onFocusOut = (e: FocusEvent) => {
      if (!isTextEntry(e.target as Element)) return
      later('blur', 50)
      later('blur+800', 800)
    }
    let vvTimer = 0
    const onVv = () => {
      window.clearTimeout(vvTimer)
      vvTimer = window.setTimeout(() => measure('vv'), 250)
    }
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('focusout', onFocusOut, true)
    window.visualViewport?.addEventListener('resize', onVv)
    window.visualViewport?.addEventListener('scroll', onVv)
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      window.clearTimeout(vvTimer)
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('focusout', onFocusOut, true)
      window.visualViewport?.removeEventListener('resize', onVv)
      window.visualViewport?.removeEventListener('scroll', onVv)
    }
  }, [measure])

  useEffect(() => {
    const t = window.setTimeout(() => measure('route'), 600)
    return () => window.clearTimeout(t)
  }, [pathname, measure])

  return (
    <div
      data-preview-probe="1"
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: 4,
        right: 4,
        top: 'calc(env(safe-area-inset-top, 0px) + 4.5rem)',
        zIndex: 2147483000,
        pointerEvents: 'none',
        boxSizing: 'border-box',
        maxWidth: 'calc(100vw - 8px)',
        overflow: 'hidden',
        contain: 'layout paint',
      }}
    >
      {/* Inset sampler: reads env(safe-area-inset-*) without affecting layout. */}
      <div
        ref={insetRef}
        style={{
          position: 'fixed',
          width: 0,
          height: 0,
          visibility: 'hidden',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      />
      <span
        role="button"
        tabIndex={-1}
        onClick={() => setOpen((v) => !v)}
        style={{
          pointerEvents: 'auto',
          display: 'inline-block',
          background: '#b91c1c',
          color: '#fff',
          font: '700 10px/1 ui-monospace, Menlo, monospace',
          padding: '6px 8px',
          borderRadius: 6,
          userSelect: 'none',
        }}
      >
        ÖLÇÜM {sha} {open ? '▲ gizle' : '▼ göster'}
      </span>
      {open ? (
        <div
          style={{
            marginTop: 4,
            background: 'rgba(0,0,0,0.78)',
            color: '#7CFC8A',
            font: '9px/1.25 ui-monospace, Menlo, monospace',
            padding: 6,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            maxHeight: '42vh',
            overflow: 'hidden',
          }}
        >
          <div style={{ color: '#fde68a' }}>{head}</div>
          {rows.map((row, i) => (
            <div key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              {row}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

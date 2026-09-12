'use client'

/**
 * LP7R.2 Article Lift — ephemeral, same-tab client state for the
 * "exact-origin" lift/return animation and post-return focus restoration.
 *
 * This is a plain module singleton, not React context or app state, on
 * purpose: the clicking card (inside PublisherProfileClient, under
 * (main)/haber's sibling route `publisher/[slug]`) and the lifted article
 * (a completely separate component tree rendered through the `@modal`
 * parallel-route slot) have no shared React ancestor closer than the
 * `(main)` layout — and even if they did, this is pure transient UI
 * geometry for one click gesture, not data any component needs to react
 * to via re-renders, so a subscribed context would be the wrong tool.
 *
 * Nothing here is app data, nothing is persisted beyond the current tab,
 * and nothing here writes to Feed 2, telemetry, or any database.
 */

export interface LiftOriginGeometry {
  top: number
  left: number
  width: number
  height: number
}

/** Reader-origin scroll captured BEFORE Article Lift navigation. */
export interface LiftReaderOrigin {
  pathname: string
  scrollY: number
}

let originArticleId: string | null = null
let originGeometry: LiftOriginGeometry | null = null
let readerOrigin: LiftReaderOrigin | null = null

/**
 * Article Lift intercepts /haber/* on top of the already-mounted origin
 * page. That URL change is not a new reader destination — never treat an
 * article path as the return origin, and never invent "/".
 *
 * Feed2 / Feed3 are excluded so this primitive cannot change those
 * surfaces' scroll or ranking behavior.
 */
export function shouldCaptureLiftReaderOrigin(pathname: string): boolean {
  if (!pathname) return false
  if (pathname === '/haber' || pathname.startsWith('/haber/')) return false
  if (pathname === '/feed-v2' || pathname.startsWith('/feed-v2/')) return false
  if (pathname === '/feed-v3' || pathname.startsWith('/feed-v3/')) return false
  return true
}

function rectToGeometry(rect: DOMRect): LiftOriginGeometry {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

/** Called by a Publisher Newspaper card's onClick, just before the Link's
 * own navigation proceeds (this function never calls preventDefault — it
 * only records geometry alongside the normal navigation). */
export function setLiftOrigin(articleId: string, el: HTMLElement): void {
  originArticleId = articleId
  originGeometry = rectToGeometry(el.getBoundingClientRect())
}

/**
 * Read the origin geometry for this article, if any was recorded for it
 * (returns null for a direct visit, a refresh, or any case where the
 * lift wasn't triggered by clicking that specific card — callers must
 * treat null as "no reliable origin, use a generic transition" rather
 * than guessing).
 */
export function getLiftOrigin(articleId: string): LiftOriginGeometry | null {
  if (originArticleId !== articleId) return null
  return originGeometry
}

export function clearLiftOrigin(): void {
  originArticleId = null
  originGeometry = null
  readerOrigin = null
}

/**
 * Capture the reader origin route + window scrollY BEFORE intercept
 * navigation mutates the document (Next Link default scroll, PageStateEffects
 * treating /haber as a new page, overflow lock). Return destination is this
 * captured origin — never publisherSlug, never a hardcoded "/".
 */
export function captureLiftReaderOrigin(pathname: string, scrollY: number): LiftReaderOrigin | null {
  if (!shouldCaptureLiftReaderOrigin(pathname)) return null
  const next: LiftReaderOrigin = {
    pathname,
    scrollY: Math.max(0, scrollY),
  }
  readerOrigin = next
  return next
}

export function getLiftReaderOrigin(): LiftReaderOrigin | null {
  return readerOrigin
}

/**
 * Look up the CURRENT on-screen geometry of the origin card by DOM query
 * (data-article-lift-origin={articleId}, set on every card Link in
 * PublisherProfileClient) rather than trusting the geometry captured at
 * click time — the page may have scrolled or resized while the article
 * was open, and Article Return should resolve toward where the card is
 * NOW, not where it was seconds ago. Falls back to the click-time
 * geometry (getLiftOrigin) if the card is no longer mounted (e.g. it
 * scrolled out via a "load more" reflow), and to null if neither is
 * available.
 */
export function getCurrentLiftOrigin(articleId: string): LiftOriginGeometry | null {
  if (typeof document === 'undefined') return getLiftOrigin(articleId)
  const el = document.querySelector<HTMLElement>(
    `[data-article-lift-origin="${cssEscape(articleId)}"]`
  )
  if (el) return rectToGeometry(el.getBoundingClientRect())
  return getLiftOrigin(articleId)
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  // Minimal fallback for environments without CSS.escape (older Safari) -
  // article ids in this app are generated slugs/uuids (see
  // src/lib/publisher/id.ts / news id generation), never arbitrary user
  // text, so this simple escape is sufficient rather than a full CSS
  // selector escaper.
  return value.replace(/["\\]/g, '\\$&')
}

/**
 * Focus restoration (Task 13): remember the element that triggered the
 * lift so Article Return can move focus back to it. Stored as a module
 * ref (not just relying on document.activeElement at return time) because
 * the intercepted route unmounts the previous focus target's tab order
 * context; storing the article id lets Article Return re-query the DOM
 * for the origin card's Link (which is always focusable) even if the
 * exact clicked child element (e.g. an inner span) no longer exists.
 */
export function focusLiftOrigin(articleId: string): void {
  if (typeof document === 'undefined') return
  const el = document.querySelector<HTMLElement>(
    `[data-article-lift-origin="${cssEscape(articleId)}"]`
  )
  el?.focus({ preventScroll: true })
}

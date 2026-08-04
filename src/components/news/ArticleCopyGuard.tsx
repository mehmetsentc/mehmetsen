'use client'

import { useEffect } from 'react'

const PROTECTED_SELECTOR = [
  '.news-article-page .news-body',
  '.news-article-page .article-prose',
  '.news-article-page .news-lead',
  '.news-article-page .news-article-title',
  '.news-article-page .news-article-hero',
  '.news-article-page figure',
  '.news-article-page img',
].join(', ')

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false
  return Boolean(
    el.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]'
    )
  )
}

function isInteractiveChrome(el: Element): boolean {
  // Share / like / save / TOC / reader tools / comment actions — not article body text
  return Boolean(
    el.closest(
      'button, a[href], [role="dialog"], [data-share-root], [data-share-menu], .share-menu'
    )
  )
}

function isProtected(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false
  if (isEditable(el)) return false
  // Allow normal context menu on chrome controls, but still block on images inside the article
  if (el instanceof HTMLImageElement && el.closest('.news-article-page')) return true
  if (isInteractiveChrome(el)) return false
  return Boolean(el.closest(PROTECTED_SELECTOR))
}

function selectionTouchesProtected(): boolean {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  const node = range.commonAncestorContainer
  const el = node instanceof Element ? node : node.parentElement
  return isProtected(el)
}

/**
 * Soft anti-copy for public article reading UI only.
 * Does not block share clipboard APIs, admin editors, or comment inputs.
 */
export function ArticleCopyGuard() {
  useEffect(() => {
    const onContextMenu = (e: Event) => {
      if (isProtected(e.target)) e.preventDefault()
    }

    const onDragStart = (e: DragEvent) => {
      const t = e.target
      if (t instanceof HTMLImageElement && t.closest('.news-article-page') && !isEditable(t)) {
        e.preventDefault()
      }
    }

    const onCopyOrCut = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return
      if (isProtected(e.target) || selectionTouchesProtected()) {
        e.preventDefault()
      }
    }

    const onSelectStart = (e: Event) => {
      if (isProtected(e.target)) e.preventDefault()
    }

    document.addEventListener('contextmenu', onContextMenu, { capture: true })
    document.addEventListener('dragstart', onDragStart, { capture: true })
    document.addEventListener('copy', onCopyOrCut, { capture: true })
    document.addEventListener('cut', onCopyOrCut, { capture: true })
    document.addEventListener('selectstart', onSelectStart, { capture: true })

    return () => {
      document.removeEventListener('contextmenu', onContextMenu, { capture: true })
      document.removeEventListener('dragstart', onDragStart, { capture: true })
      document.removeEventListener('copy', onCopyOrCut, { capture: true })
      document.removeEventListener('cut', onCopyOrCut, { capture: true })
      document.removeEventListener('selectstart', onSelectStart, { capture: true })
    }
  }, [])

  return null
}

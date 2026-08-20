'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { EDITORIAL_STATUS_LABELS, crawlerStatusLabel } from '@/services/crawler/editorial/labels'

interface MediaRow {
  sourceUrl: string
  status: string
  isPrimary?: boolean
  discoveryMethod?: string
  imageSource?: string | null
  imageConfidence?: number | null
  altText?: string | null
}

interface ArticleDetail {
  id: string
  title: string | null
  sourceName: string
  originalUrl: string
  canonicalUrl: string | null
  publishedAt: string | Date | null
  fetchedAt: string | Date | null
  countryCode: string | null
  city: string | null
  district?: string | null
  wordCount: number | null
  extractionConfidence: number | null
  qualityStatus: string
  editorialStatus: keyof typeof EDITORIAL_STATUS_LABELS | string
  extractionMethod?: string | null
  mainImageUrl: string | null
  articleBodyText?: string | null
  description?: string | null
  clusterId: string | null
  editorialNewsId: string | null
  isExactDuplicate: boolean
  primaryImageMethod?: string | null
}

function fmtDate(value: string | Date | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('tr-TR')
}

/**
 * Ham Haberler detail drawer.
 * Single close path via `onClose` — parent owns selectedArticle=null.
 * Portaled to document.body so admin shell overflow/z-index cannot trap clicks.
 */
export function RawArticleDrawer({
  article,
  media,
  busy,
  onClose,
  onManual,
}: {
  article: ArticleDetail
  media: MediaRow[]
  busy?: boolean
  onClose: () => void
  onManual: () => void
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const [mounted, setMounted] = useState(false)

  onCloseRef.current = onClose

  const closeDrawer = useCallback(() => {
    onCloseRef.current()
  }, [])

  const accepted = media.filter((m) => m.status !== 'REJECTED')
  const primary = accepted.find((m) => m.isPrimary) || accepted[0]
  const extras = accepted.filter((m) => m !== primary)
  const sourceUrl = article.canonicalUrl || article.originalUrl
  const published = article.editorialStatus === 'PUBLISHED'

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    const prevPaddingRight = document.body.style.paddingRight
    const scrollbarGap = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarGap > 0) {
      document.body.style.paddingRight = `${scrollbarGap}px`
    }
    closeBtnRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeDrawer()
      }
    }
    // Capture phase so nested handlers cannot swallow ESC
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPaddingRight
      window.removeEventListener('keydown', onKey, true)
    }
  }, [closeDrawer, article.id])

  if (!mounted || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-modal isolate" role="presentation" data-raw-article-drawer="open">
      {/* Backdrop — only this layer closes on outside click */}
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/40"
        aria-label="Kapat"
        data-drawer-backdrop="true"
        onClick={closeDrawer}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-drawer-panel="true"
        className="absolute inset-y-0 right-0 flex h-full w-full max-w-xl flex-col bg-[rgb(var(--color-card))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative z-10 flex shrink-0 items-start justify-between gap-3 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
          <h2 id={titleId} className="min-w-0 flex-1 text-lg font-semibold leading-snug">
            {article.title || '(başlıksız)'}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="relative z-20 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]"
            aria-label="Kapat"
            title="Kapat"
            data-drawer-close="true"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              closeDrawer()
            }}
          >
            <X className="h-5 w-5" aria-hidden />
            <span className="sr-only">Kapat</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5" data-drawer-content="true">
          {primary?.sourceUrl || article.mainImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primary?.sourceUrl || article.mainImageUrl || ''}
              alt=""
              className="mb-3 max-h-56 w-full rounded object-cover"
            />
          ) : null}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <dt className="text-[rgb(var(--color-muted))]">Kaynak</dt>
            <dd>{article.sourceName}</dd>
            <dt className="text-[rgb(var(--color-muted))]">Kaynak URL</dt>
            <dd className="truncate">
              <a className="underline" href={sourceUrl} target="_blank" rel="noreferrer">
                {sourceUrl}
              </a>
            </dd>
            <dt className="text-[rgb(var(--color-muted))]">Yayın tarihi</dt>
            <dd>{fmtDate(article.publishedAt)}</dd>
            <dt className="text-[rgb(var(--color-muted))]">Scrape zamanı</dt>
            <dd>{fmtDate(article.fetchedAt)}</dd>
            <dt className="text-[rgb(var(--color-muted))]">Coğrafya</dt>
            <dd>{[article.countryCode, article.city, article.district].filter(Boolean).join(' / ') || '—'}</dd>
            <dt className="text-[rgb(var(--color-muted))]">Kelime</dt>
            <dd>{article.wordCount ?? '—'}</dd>
            <dt className="text-[rgb(var(--color-muted))]">Güven</dt>
            <dd>
              {article.extractionConfidence != null
                ? `${Math.round(article.extractionConfidence * 100)}%`
                : '—'}
            </dd>
            <dt className="text-[rgb(var(--color-muted))]">Extraction</dt>
            <dd>
              {crawlerStatusLabel(article)} {article.extractionMethod ? `· ${article.extractionMethod}` : ''}
            </dd>
            <dt className="text-[rgb(var(--color-muted))]">Editoryal</dt>
            <dd>
              {EDITORIAL_STATUS_LABELS[article.editorialStatus as keyof typeof EDITORIAL_STATUS_LABELS] ||
                article.editorialStatus}
            </dd>
            <dt className="text-[rgb(var(--color-muted))]">Provenance</dt>
            <dd>
              {primary?.imageSource || article.primaryImageMethod || '—'}
              {primary?.imageConfidence != null ? ` · ${Math.round(primary.imageConfidence * 100)}%` : ''}
            </dd>
          </dl>
          {extras.length ? (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase text-[rgb(var(--color-muted))]">Ek görseller</p>
              <div className="flex flex-wrap gap-2">
                {extras.map((m) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={m.sourceUrl}
                    src={m.sourceUrl}
                    alt={m.altText || ''}
                    className="h-16 w-20 rounded object-cover"
                  />
                ))}
              </div>
            </div>
          ) : null}
          <p className="mt-3 text-sm">{article.description}</p>
          <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-sm text-[rgb(var(--color-muted))]">
            {(article.articleBodyText || '').slice(0, 4000)}
            {(article.articleBodyText || '').length > 4000 ? '…' : ''}
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            {published && article.editorialNewsId ? (
              <a className="underline" href={`/admin/news/${article.editorialNewsId}/edit`}>
                Haberi Aç
              </a>
            ) : (
              <button type="button" className="underline" disabled={busy} onClick={onManual}>
                {busy ? 'Açılıyor…' : 'Manuel Düzenle'}
              </button>
            )}
            <a className="underline" href={sourceUrl} target="_blank" rel="noreferrer">
              Kaynağı Aç
            </a>
            {article.clusterId ? (
              <a className="underline" href={`/admin/crawler/clusters/${article.clusterId}`}>
                Olay Kümesini Gör
              </a>
            ) : null}
          </div>
        </div>
      </aside>
    </div>,
    document.body
  )
}

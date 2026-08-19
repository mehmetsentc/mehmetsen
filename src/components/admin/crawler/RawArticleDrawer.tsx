'use client'

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
  const accepted = media.filter((m) => m.status !== 'REJECTED')
  const primary = accepted.find((m) => m.isPrimary) || accepted[0]
  const extras = accepted.filter((m) => m !== primary)
  const sourceUrl = article.canonicalUrl || article.originalUrl
  const published = article.editorialStatus === 'PUBLISHED'

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Ham haber detayı">
      <button type="button" className="h-full flex-1 cursor-default" aria-label="Kapat" onClick={onClose} />
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-[rgb(var(--color-card))] p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{article.title || '(başlıksız)'}</h2>
          <button type="button" className="text-sm underline" onClick={onClose}>
            Kapat
          </button>
        </div>
        {primary?.sourceUrl || article.mainImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={primary?.sourceUrl || article.mainImageUrl || ''} alt="" className="mb-3 max-h-56 w-full rounded object-cover" />
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
          <dd>{article.extractionConfidence != null ? `${Math.round(article.extractionConfidence * 100)}%` : '—'}</dd>
          <dt className="text-[rgb(var(--color-muted))]">Extraction</dt>
          <dd>{crawlerStatusLabel(article)} {article.extractionMethod ? `· ${article.extractionMethod}` : ''}</dd>
          <dt className="text-[rgb(var(--color-muted))]">Editoryal</dt>
          <dd>{EDITORIAL_STATUS_LABELS[article.editorialStatus as keyof typeof EDITORIAL_STATUS_LABELS] || article.editorialStatus}</dd>
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
                <img key={m.sourceUrl} src={m.sourceUrl} alt={m.altText || ''} className="h-16 w-20 rounded object-cover" />
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
      </aside>
    </div>
  )
}

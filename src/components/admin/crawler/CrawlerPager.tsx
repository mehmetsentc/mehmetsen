'use client'

import { RAW_ARTICLE_PAGE_SIZES } from '@/services/crawler/editorial/query'

export function CrawlerPager({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPage: (page: number) => void
  onPageSize?: (size: number) => void
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[rgb(var(--color-muted))]">
        {total.toLocaleString('tr-TR')} kayıt · sayfa {page}/{totalPages}
      </span>
      <button type="button" className="underline disabled:no-underline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Önceki
      </button>
      <button
        type="button"
        className="underline disabled:no-underline"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Sonraki
      </button>
      {onPageSize ? (
        <select
          className="rounded border px-2 py-1"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
        >
          {RAW_ARTICLE_PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  )
}

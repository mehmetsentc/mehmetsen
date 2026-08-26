'use client'

import Link from 'next/link'
import { PublisherStudioShell, useStudioFetch } from '@/components/publisher/studio/PublisherStudioShell'
import { ROUTES } from '@/constants/routes'
import type { PublisherArticleItem, PublisherRecord } from '@/types/publisher'

export function PublisherStudioArticlesClient({
  slug,
  publisher,
}: {
  slug: string
  publisher: PublisherRecord
}) {
  const { data, loading } = useStudioFetch<{ items: PublisherArticleItem[] }>(
    `/api/publisher-studio/${publisher.id}/articles?limit=48`
  )

  const addToPage = (articleId: string) => {
    sessionStorage.setItem(
      `publisher-studio-add-article:${publisher.id}`,
      JSON.stringify({ articleId, at: Date.now() })
    )
    window.location.href = ROUTES.PUBLISHER_STUDIO.LAYOUT_EDIT(slug)
  }

  return (
    <PublisherStudioShell slug={slug} publisher={publisher}>
      <h1 className="text-2xl font-black">Haberler</h1>
      <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">Salt okunur — düzenleme yok.</p>
      {loading ? (
        <p className="mt-4 text-sm">Yükleniyor…</p>
      ) : (
        <ul className="mt-4 divide-y divide-[rgb(var(--color-border))]">
          {(data?.items ?? []).map((article) => (
            <li key={article.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{article.title}</p>
                <p className="text-xs text-[rgb(var(--color-muted))]">{article.sourceId}</p>
              </div>
              <button type="button" className="studio-btn shrink-0" onClick={() => addToPage(article.id)}>
                Sayfaya Ekle
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link href={ROUTES.PUBLISHER_STUDIO.LAYOUT_EDIT(slug)} className="studio-btn mt-4 inline-flex">
        Düzenleyiciye git
      </Link>
    </PublisherStudioShell>
  )
}

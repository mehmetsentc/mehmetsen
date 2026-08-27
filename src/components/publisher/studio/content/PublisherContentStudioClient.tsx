'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { PublisherStudioShell, useStudioFetch } from '@/components/publisher/studio/PublisherStudioShell'
import { ROUTES } from '@/constants/routes'
import { auth } from '@/lib/firebase/auth'
import type { PublisherRecord } from '@/types/publisher'
import {
  CONTENT_STATUS_LABELS,
  type PublisherContentItem,
  type PublisherContentStatus,
  type PublisherSourceArticleItem,
} from '@/types/publisherContent'

type TabId =
  | 'ALL'
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'ARCHIVED'
  | 'SOURCES'

const TABS: { id: TabId; label: string }[] = [
  { id: 'ALL', label: 'Tümü' },
  { id: 'DRAFT', label: 'Taslaklar' },
  { id: 'IN_REVIEW', label: 'İncelemede' },
  { id: 'CHANGES_REQUESTED', label: 'Değişiklik İstenenler' },
  { id: 'APPROVED', label: 'Onaylananlar' },
  { id: 'SCHEDULED', label: 'Planlananlar' },
  { id: 'PUBLISHED', label: 'Yayınlananlar' },
  { id: 'ARCHIVED', label: 'Arşiv' },
  { id: 'SOURCES', label: 'Kaynak Haberleri' },
]

async function authHeaders(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export function PublisherContentStudioClient({
  slug,
  publisher,
}: {
  slug: string
  publisher: PublisherRecord
}) {
  const [tab, setTab] = useState<TabId>('ALL')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [extraItems, setExtraItems] = useState<PublisherContentItem[]>([])
  const statusParam = tab === 'ALL' || tab === 'SOURCES' ? 'ALL' : tab
  const contentUrl =
    tab === 'SOURCES'
      ? null
      : `/api/publisher-studio/${publisher.id}/content?status=${encodeURIComponent(statusParam)}${
          search ? `&q=${encodeURIComponent(search)}` : ''
        }`
  const { data, loading, refetch } = useStudioFetch<{
    items: PublisherContentItem[]
    nextCursor?: string | null
  }>(contentUrl)
  const sources = useStudioFetch<{ items: PublisherSourceArticleItem[] }>(
    tab === 'SOURCES' ? `/api/publisher-studio/${publisher.id}/source-articles` : null
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const items = useMemo(() => {
    const base = data?.items ?? []
    return cursor ? [...base, ...extraItems] : base
  }, [data?.items, extraItems, cursor])

  const createDraft = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/publisher-studio/${publisher.id}/content`, {
        method: 'POST',
        headers: await authHeaders(),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Oluşturulamadı')
      window.location.href = ROUTES.PUBLISHER_STUDIO.ARTICLE_EDIT(slug, json.item.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata')
    } finally {
      setBusy(false)
    }
  }, [publisher.id, slug])

  const importSource = useCallback(
    async (rawArticleId: string) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(`/api/publisher-studio/${publisher.id}/content/import-source`, {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ rawArticleId }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'İçe aktarılamadı')
        window.location.href = ROUTES.PUBLISHER_STUDIO.ARTICLE_EDIT(slug, json.item.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Hata')
      } finally {
        setBusy(false)
      }
    },
    [publisher.id, slug]
  )

  const loadMore = async () => {
    const next = data?.nextCursor
    if (!next) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/publisher-studio/${publisher.id}/content?status=${encodeURIComponent(statusParam)}&cursor=${encodeURIComponent(next)}${
          search ? `&q=${encodeURIComponent(search)}` : ''
        }`,
        { headers: await authHeaders() }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi')
      setExtraItems((prev) => [...prev, ...(json.items ?? [])])
      setCursor(json.nextCursor ?? next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata')
    } finally {
      setBusy(false)
    }
  }

  const addToPage = (articleId: string) => {
    sessionStorage.setItem(
      `publisher-studio-add-article:${publisher.id}`,
      JSON.stringify({ articleId, at: Date.now() })
    )
    window.location.href = ROUTES.PUBLISHER_STUDIO.LAYOUT_EDIT(slug)
  }

  const switchTab = (id: TabId) => {
    setTab(id)
    setCursor(null)
    setExtraItems([])
  }

  return (
    <PublisherStudioShell slug={slug} publisher={publisher}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Haberler</h1>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            Taslak, inceleme, planlama ve manuel yayın.
          </p>
        </div>
        <button
          type="button"
          className="studio-btn-primary"
          disabled={busy}
          onClick={() => void createDraft()}
        >
          Yeni Haber
        </button>
      </div>

      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(q.trim())
          setCursor(null)
          setExtraItems([])
          refetch()
        }}
      >
        <input
          className="min-w-[200px] flex-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Başlık ara…"
          aria-label="Başlık ara"
        />
        <button type="submit" className="studio-btn">
          Ara
        </button>
      </form>

      <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTab(t.id)}
            className={
              tab === t.id
                ? 'shrink-0 rounded-lg bg-[rgb(var(--color-brand))]/10 px-3 py-1.5 text-sm font-bold text-[rgb(var(--color-brand))]'
                : 'shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {tab === 'SOURCES' ? (
        sources.loading ? (
          <p className="mt-4 text-sm">Yükleniyor…</p>
        ) : (
          <ul className="mt-4 divide-y divide-[rgb(var(--color-border))]">
            {(sources.data?.items ?? []).map((s) => (
              <li
                key={s.rawArticleId}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{s.title}</p>
                  <p className="text-xs text-[rgb(var(--color-muted))]">
                    {s.sourceId} · {s.relationshipType}
                    {s.publishedAt
                      ? ` · ${new Date(s.publishedAt).toLocaleDateString('tr-TR')}`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="studio-btn"
                    disabled={busy}
                    onClick={() => void importSource(s.rawArticleId)}
                  >
                    Taslağa Dönüştür
                  </button>
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="studio-btn inline-flex"
                    >
                      Kaynağı Gör
                    </a>
                  ) : null}
                  {s.clusterSlug || s.clusterId ? (
                    <Link
                      href={ROUTES.EVENT(s.clusterSlug || s.clusterId!)}
                      className="studio-btn inline-flex"
                    >
                      Olayı Gör
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : loading ? (
        <p className="mt-4 text-sm">Yükleniyor…</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-[rgb(var(--color-border))]">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={ROUTES.PUBLISHER_STUDIO.ARTICLE_EDIT(slug, item.id)}
                    className="truncate font-semibold hover:underline"
                  >
                    {item.title || 'Başlıksız'}
                  </Link>
                  <p className="text-xs text-[rgb(var(--color-muted))]">
                    {CONTENT_STATUS_LABELS[item.status as PublisherContentStatus] ?? item.status}
                    {item.sourceMode !== 'MANUAL' ? ` · ${item.sourceMode}` : ''}
                    {item.categoryId ? ` · ${item.categoryId}` : ''}
                    {item.publicationStatus === 'PARTIAL' || item.publicationStatus === 'FAILED'
                      ? ' · Yayınlama tamamlanamadı'
                      : ''}
                    {' · '}
                    {new Date(item.updatedAt).toLocaleString('tr-TR')}
                    {item.scheduledAt
                      ? ` · plan ${new Date(item.scheduledAt).toLocaleString('tr-TR')}`
                      : ''}
                    {item.publishedAt
                      ? ` · yayım ${new Date(item.publishedAt).toLocaleString('tr-TR')}`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={ROUTES.PUBLISHER_STUDIO.ARTICLE_EDIT(slug, item.id)}
                    className="studio-btn inline-flex"
                  >
                    Düzenle
                  </Link>
                  <Link
                    href={ROUTES.PUBLISHER_STUDIO.ARTICLE_PREVIEW(slug, item.id)}
                    className="studio-btn inline-flex"
                  >
                    Önizle
                  </Link>
                  {item.status === 'PUBLISHED' && item.publishedNewsId ? (
                    <>
                      <Link
                        href={ROUTES.NEWS_DETAIL(item.seoSlug || item.publishedNewsId)}
                        className="studio-btn inline-flex"
                      >
                        Haberi Gör
                      </Link>
                      <button
                        type="button"
                        className="studio-btn"
                        onClick={() => addToPage(item.publishedNewsId!)}
                      >
                        Sayfaya Ekle
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
            {!items.length ? (
              <li className="py-8 text-sm text-[rgb(var(--color-muted))]">Kayıt yok.</li>
            ) : null}
          </ul>
          {data?.nextCursor ? (
            <button
              type="button"
              className="studio-btn mt-4"
              disabled={busy}
              onClick={() => void loadMore()}
            >
              Daha fazla
            </button>
          ) : null}
        </>
      )}
    </PublisherStudioShell>
  )
}

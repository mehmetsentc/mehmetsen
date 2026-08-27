'use client'

import { useCallback, useEffect, useState } from 'react'
import { auth } from '@/lib/firebase/auth'
import { ArticleBlocksRenderer } from '@/components/news/ArticleBlocksRenderer'

interface PreviewPayload {
  title: string
  spot: string | null
  heroImageUrl: string | null
  bodyBlocks: unknown[] | null
  plain: string
  publisherName: string
}

/**
 * Authenticated content preview — fetches via studio API (content:read).
 * Never renders draft body from SSR without membership.
 */
export function PublisherContentPreviewClient({
  publisherId,
  contentId,
}: {
  publisherId: string
  contentId: string
}) {
  const [state, setState] = useState<'loading' | 'denied' | 'ready' | 'missing'>('loading')
  const [payload, setPayload] = useState<PreviewPayload | null>(null)

  const load = useCallback(async () => {
    setState('loading')
    try {
      const user = auth.currentUser
      if (!user) {
        setState('denied')
        return
      }
      const token = await user.getIdToken()
      const res = await fetch(`/api/publisher-studio/${publisherId}/content/${contentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401 || res.status === 403) {
        setState('denied')
        return
      }
      if (res.status === 404) {
        setState('missing')
        return
      }
      if (!res.ok) {
        setState('denied')
        return
      }
      const data = (await res.json()) as {
        item: {
          title: string
          spot: string | null
          heroImageUrl: string | null
          bodyBlocks: unknown[] | null
          bodyHtml: string | null
        }
      }
      const item = data.item
      const plain =
        (item.bodyBlocks ?? [])
          .map((b) =>
            b && typeof b === 'object' && 'text' in b && typeof (b as { text?: unknown }).text === 'string'
              ? (b as { text: string }).text
              : ''
          )
          .filter(Boolean)
          .join('\n\n') ||
        item.bodyHtml ||
        ''
      setPayload({
        title: item.title || 'Başlıksız',
        spot: item.spot,
        heroImageUrl: item.heroImageUrl,
        bodyBlocks: item.bodyBlocks,
        plain,
        publisherName: '',
      })
      setState('ready')
    } catch {
      setState('denied')
    }
  }, [publisherId, contentId])

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(() => {
      void load()
    })
    return () => unsub()
  }, [load])

  if (state === 'loading') {
    return (
      <p className="text-sm text-[rgb(var(--color-muted))]">Önizleme yükleniyor…</p>
    )
  }
  if (state === 'denied') {
    return (
      <div className="rounded-lg border border-[rgb(var(--color-border))] p-6 text-sm">
        <p className="font-bold">Erişim reddedildi</p>
        <p className="mt-2 text-[rgb(var(--color-muted))]">
          Bu önizleme yalnızca yayın üyeleri içindir (content:read). Giriş yapın ve üyelik
          yetkinizi kontrol edin.
        </p>
      </div>
    )
  }
  if (state === 'missing' || !payload) {
    return (
      <p className="text-sm text-[rgb(var(--color-muted))]">İçerik bulunamadı.</p>
    )
  }

  return (
    <article>
      <h1 className="text-3xl font-black text-[rgb(var(--color-text))]">{payload.title}</h1>
      {payload.spot ? (
        <p className="mt-3 text-lg font-medium text-[rgb(var(--color-text))]/90">{payload.spot}</p>
      ) : null}
      {payload.heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={payload.heroImageUrl}
          alt=""
          className="mt-6 w-full rounded-lg object-cover"
        />
      ) : null}
      <div className="prose prose-neutral mt-6 max-w-none dark:prose-invert">
        {payload.bodyBlocks?.length ? (
          <ArticleBlocksRenderer blocks={payload.bodyBlocks as never} title={payload.title} />
        ) : (
          <p className="whitespace-pre-wrap text-[rgb(var(--color-text))]">{payload.plain}</p>
        )}
      </div>
    </article>
  )
}

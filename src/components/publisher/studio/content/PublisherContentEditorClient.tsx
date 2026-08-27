'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { PublisherStudioShell } from '@/components/publisher/studio/PublisherStudioShell'
import { ArticleBlockEditor } from '@/components/admin/ArticleBlockEditor'
import { ROUTES } from '@/constants/routes'
import { auth } from '@/lib/firebase/auth'
import type { ArticleBlock } from '@/lib/articleBlocks'
import type { PublisherRecord } from '@/types/publisher'
import {
  CONTENT_STATUS_LABELS,
  type PublisherContentItem,
  type PublisherContentStatus,
} from '@/types/publisherContent'

async function authHeaders(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function PublisherContentEditorClient({
  slug,
  publisher,
  contentId,
}: {
  slug: string
  publisher: PublisherRecord
  contentId: string
}) {
  const [item, setItem] = useState<PublisherContentItem | null>(null)
  const [title, setTitle] = useState('')
  const [spot, setSpot] = useState('')
  const [summary, setSummary] = useState('')
  const [bodyBlocks, setBodyBlocks] = useState<ArticleBlock[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [citySlug, setCitySlug] = useState('')
  const [districtSlug, setDistrictSlug] = useState('')
  const [heroImageUrl, setHeroImageUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [tags, setTags] = useState('')
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [isBreaking, setIsBreaking] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const versionRef = useRef<number>(1)
  const updatedAtRef = useRef<string | null>(null)

  const applyItem = useCallback((next: PublisherContentItem) => {
    setItem(next)
    setTitle(next.title ?? '')
    setSpot(next.spot ?? '')
    setSummary(next.summary ?? '')
    setBodyBlocks(Array.isArray(next.bodyBlocks) ? next.bodyBlocks : [])
    setCategoryId(next.categoryId ?? '')
    setCitySlug(next.citySlug ?? '')
    setDistrictSlug(next.districtSlug ?? '')
    setHeroImageUrl(next.heroImageUrl ?? '')
    setVideoUrl(next.videoUrl ?? '')
    setTags((next.tags ?? []).join(', '))
    setSeoTitle(next.seoTitle ?? '')
    setSeoDescription(next.seoDescription ?? '')
    setIsBreaking(Boolean(next.isBreaking))
    versionRef.current = next.version
    updatedAtRef.current = typeof next.updatedAt === 'string' ? next.updatedAt : new Date(next.updatedAt).toISOString()
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/publisher-studio/${publisher.id}/content/${contentId}`, {
          headers: await authHeaders(),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Yüklenemedi')
        if (!cancelled) applyItem(json.item)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Hata')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [publisher.id, contentId, applyItem])

  const buildPayload = useCallback(
    (autosave: boolean) => ({
      title,
      spot,
      summary,
      bodyBlocks,
      categoryId: categoryId || null,
      citySlug: citySlug || null,
      districtSlug: districtSlug || null,
      heroImageUrl: heroImageUrl || null,
      videoUrl: videoUrl || null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      seoTitle: seoTitle || null,
      seoDescription: seoDescription || null,
      isBreaking,
      expectedVersion: versionRef.current,
      expectedUpdatedAt: updatedAtRef.current,
      autosave,
    }),
    [
      title,
      spot,
      summary,
      bodyBlocks,
      categoryId,
      citySlug,
      districtSlug,
      heroImageUrl,
      videoUrl,
      tags,
      seoTitle,
      seoDescription,
      isBreaking,
    ]
  )

  const save = useCallback(
    async (autosave: boolean) => {
      setSaveState('saving')
      setError(null)
      try {
        const res = await fetch(`/api/publisher-studio/${publisher.id}/content/${contentId}`, {
          method: 'PUT',
          headers: await authHeaders(),
          body: JSON.stringify(buildPayload(autosave)),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
        applyItem(json.item)
        setSaveState('saved')
      } catch (e) {
        setSaveState('error')
        setError(e instanceof Error ? e.message : 'Hata')
      }
    },
    [publisher.id, contentId, buildPayload, applyItem]
  )

  useEffect(() => {
    if (!item) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void save(true)
    }, 1200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [title, spot, summary, bodyBlocks, categoryId, citySlug, districtSlug, heroImageUrl, videoUrl, tags, seoTitle, seoDescription, isBreaking])

  const action = async (path: string, body?: unknown) => {
    setBusy(true)
    setError(null)
    try {
      await save(false)
      const res = await fetch(`/api/publisher-studio/${publisher.id}/content/${contentId}/${path}`, {
        method: 'POST',
        headers: await authHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'İşlem başarısız')
      applyItem(json.item)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata')
    } finally {
      setBusy(false)
    }
  }

  if (!item && !error) {
    return (
      <PublisherStudioShell slug={slug} publisher={publisher}>
        <p className="text-sm">Yükleniyor…</p>
      </PublisherStudioShell>
    )
  }

  const statusLabel = item
    ? CONTENT_STATUS_LABELS[item.status as PublisherContentStatus] ?? item.status
    : ''

  return (
    <PublisherStudioShell slug={slug} publisher={publisher}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={ROUTES.PUBLISHER_STUDIO.ARTICLES(slug)} className="text-xs font-bold text-[rgb(var(--color-muted))]">
            ← Content Studio
          </Link>
          <h1 className="mt-1 text-2xl font-black">Haber Editörü</h1>
          <p className="text-xs text-[rgb(var(--color-muted))]">
            {statusLabel}
            {saveState === 'saving'
              ? ' · Kaydediliyor…'
              : saveState === 'saved'
                ? ' · Kaydedildi'
                : saveState === 'error'
                  ? ' · Kayıt hatası'
                  : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="studio-btn" disabled={busy} onClick={() => void save(false)}>
            Kaydet
          </button>
          <Link
            href={ROUTES.PUBLISHER_STUDIO.ARTICLE_PREVIEW(slug, contentId)}
            className="studio-btn inline-flex"
          >
            Önizle
          </Link>
          <button type="button" className="studio-btn" disabled={busy} onClick={() => void action('submit')}>
            İncelemeye Gönder
          </button>
          <button type="button" className="studio-btn" disabled={busy} onClick={() => void action('approve')}>
            Onayla
          </button>
          <button
            type="button"
            className="studio-btn"
            disabled={busy}
            onClick={() => void action('request-changes', { reviewNote })}
          >
            Düzeltme İste
          </button>
          <button
            type="button"
            className="studio-btn-primary"
            disabled={busy}
            onClick={() => void action('publish', { fast: false })}
          >
            Yayınla
          </button>
          <button
            type="button"
            className="studio-btn"
            disabled={busy}
            onClick={() => void action('publish', { fast: true })}
          >
            Hızlı Yayın
          </button>
          <button
            type="button"
            className="studio-btn"
            disabled={busy || !scheduleAt}
            onClick={() => void action('schedule', { scheduledAt: new Date(scheduleAt).toISOString() })}
          >
            Planla
          </button>
          <button type="button" className="studio-btn" disabled={busy} onClick={() => void action('archive')}>
            Arşivle
          </button>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {item?.reviewNote ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Editör notu: {item.reviewNote}
        </p>
      ) : null}

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">Başlık</span>
          <input
            className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-lg font-bold"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">Spot</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
            rows={2}
            value={spot}
            onChange={(e) => setSpot(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">Özet</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>

        <div>
          <p className="mb-2 text-xs font-bold uppercase text-[rgb(var(--color-muted))]">Gövde</p>
          <ArticleBlockEditor
            value={bodyBlocks}
            onChange={setBodyBlocks}
            availableImages={heroImageUrl ? [{ url: heroImageUrl }] : []}
            sourceContent={summary}
            articleTitle={title}
            articleSummary={summary}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">Kategori ID</span>
            <input
              className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">Şehir slug</span>
            <input
              className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
              value={citySlug}
              onChange={(e) => setCitySlug(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">İlçe slug</span>
            <input
              className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
              value={districtSlug}
              onChange={(e) => setDistrictSlug(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">Hero görsel URL</span>
            <input
              className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
              value={heroImageUrl}
              onChange={(e) => setHeroImageUrl(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">Video URL</span>
            <input
              className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">Etiketler</span>
            <input
              className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="virgülle ayırın"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">SEO başlık</span>
            <input
              className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">SEO açıklama</span>
            <input
              className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">Planlanan zaman</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 pt-6 text-sm font-semibold">
            <input type="checkbox" checked={isBreaking} onChange={(e) => setIsBreaking(e.target.checked)} />
            Son dakika
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">Düzeltme notu</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
              rows={2}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />
          </label>
        </div>
      </div>
    </PublisherStudioShell>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { PublisherStudioShell } from '@/components/publisher/studio/PublisherStudioShell'
import { ArticleBlockEditor } from '@/components/admin/ArticleBlockEditor'
import { ROUTES } from '@/constants/routes'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { TURKISH_PROVINCES, getDistrictsForProvince } from '@/constants/cities'
import { auth } from '@/lib/firebase/auth'
import { roleHasPermission } from '@/lib/publisher/authorization'
import { PUBLISHER_CONTENT_AUTOSAVE_DEBOUNCE_MS } from '@/lib/publisher/contentStudioConfig'
import type { ArticleBlock } from '@/lib/articleBlocks'
import type { PublisherMemberRole, PublisherRecord } from '@/types/publisher'
import {
  CONTENT_STATUS_LABELS,
  type PublisherContentAuditRow,
  type PublisherContentItem,
  type PublisherContentMediaMeta,
  type PublisherContentRevision,
  type PublisherContentStatus,
} from '@/types/publisherContent'

async function authHeaders(json = true): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken()
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'

const AUDIT_LABELS: Record<string, string> = {
  CONTENT_CREATED: 'Oluşturuldu',
  CONTENT_SAVED: 'Kaydedildi',
  CONTENT_UPDATED: 'Güncellendi',
  CONTENT_SUBMITTED: 'İncelemeye gönderildi',
  CONTENT_CHANGES_REQUESTED: 'Değişiklik istendi',
  CHANGES_REQUESTED: 'Değişiklik istendi',
  CONTENT_APPROVED: 'Onaylandı',
  CONTENT_SCHEDULED: 'Planlandı',
  CONTENT_SCHEDULE_CANCELLED: 'Plan iptal edildi',
  CONTENT_PUBLISHED: 'Yayınlandı',
  CONTENT_FAST_PUBLISHED: 'Hızlı yayınlandı',
  CONTENT_ARCHIVED: 'Arşivlendi',
  CONTENT_REVISION_RESTORED: 'Sürüm geri yüklendi',
  SOURCE_IMPORTED: 'Kaynaktan içe aktarıldı',
  CONTENT_SOURCE_IMPORTED: 'Kaynaktan içe aktarıldı',
  PUBLISH_PARTIAL: 'Kısmi yayın',
  PUBLISH_FAILED: 'Yayın başarısız',
}

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
  const [role, setRole] = useState<PublisherMemberRole | null>(null)
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
  const [altText, setAltText] = useState('')
  const [credit, setCredit] = useState('')
  const [caption, setCaption] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [publishSuccess, setPublishSuccess] = useState<{ newsId: string } | null>(null)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [localCopy, setLocalCopy] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [audit, setAudit] = useState<PublisherContentAuditRow[]>([])
  const [revisions, setRevisions] = useState<PublisherContentRevision[]>([])
  const [sideTab, setSideTab] = useState<'activity' | 'revisions'>('activity')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const versionRef = useRef<number>(1)
  const updatedAtRef = useRef<string | null>(null)
  const savingRef = useRef(false)

  const districts = useMemo(
    () => (citySlug ? getDistrictsForProvince(citySlug) : []),
    [citySlug]
  )

  const can = useCallback(
    (perm: Parameters<typeof roleHasPermission>[1]) =>
      role ? roleHasPermission(role, perm) : false,
    [role]
  )

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
    const meta = next.mediaMeta
    setAltText(meta?.altText ?? '')
    setCredit(meta?.credit ?? '')
    setCaption(meta?.caption ?? '')
    versionRef.current = next.version
    updatedAtRef.current =
      typeof next.updatedAt === 'string' ? next.updatedAt : new Date(next.updatedAt).toISOString()
    setDirty(false)
    setHydrated(true)
  }, [])

  const loadSidePanels = useCallback(async () => {
    try {
      const headers = await authHeaders()
      const [aRes, rRes] = await Promise.all([
        fetch(`/api/publisher-studio/${publisher.id}/content/${contentId}/audit`, { headers }),
        fetch(`/api/publisher-studio/${publisher.id}/content/${contentId}/revisions`, { headers }),
      ])
      if (aRes.ok) {
        const j = await aRes.json()
        setAudit(j.events ?? j.items ?? j.audit ?? [])
      }
      if (rRes.ok) {
        const j = await rRes.json()
        setRevisions(j.revisions ?? [])
      }
    } catch {
      /* ignore panel errors */
    }
  }, [publisher.id, contentId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/publisher-studio/${publisher.id}/content/${contentId}`, {
          headers: await authHeaders(),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Yüklenemedi')
        if (!cancelled) {
          applyItem(json.item)
          if (json.role) setRole(json.role as PublisherMemberRole)
          void loadSidePanels()
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Hata')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [publisher.id, contentId, applyItem, loadSidePanels])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty && saveState !== 'saved') {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, saveState])

  const buildPayload = useCallback(
    (autosave: boolean) => {
      const city = TURKISH_PROVINCES.find((p) => p.slug === citySlug)
      const district = districts.find((d) => d.slug === districtSlug)
      const mediaMeta: PublisherContentMediaMeta | null = heroImageUrl
        ? {
            url: heroImageUrl,
            altText: altText || null,
            credit: credit || null,
            caption: caption || null,
            ...(item?.mediaMeta?.mime ? { mime: item.mediaMeta.mime } : {}),
            ...(item?.mediaMeta?.size != null ? { size: item.mediaMeta.size } : {}),
            ...(item?.mediaMeta?.storageProvider
              ? { storageProvider: item.mediaMeta.storageProvider }
              : {}),
          }
        : null
      return {
        title,
        spot,
        summary,
        bodyBlocks,
        categoryId: categoryId || null,
        citySlug: citySlug || null,
        districtSlug: districtSlug || null,
        cityName: city?.name ?? null,
        districtName: district?.name ?? null,
        heroImageUrl: heroImageUrl || null,
        videoUrl: videoUrl || null,
        mediaMeta,
        tags: [
          ...new Set(
            tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          ),
        ].slice(0, 40),
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
        isBreaking,
        expectedVersion: versionRef.current,
        expectedUpdatedAt: updatedAtRef.current,
        autosave,
      }
    },
    [
      title,
      spot,
      summary,
      bodyBlocks,
      categoryId,
      citySlug,
      districtSlug,
      districts,
      heroImageUrl,
      videoUrl,
      tags,
      seoTitle,
      seoDescription,
      isBreaking,
      altText,
      credit,
      caption,
      item?.mediaMeta,
    ]
  )

  const markDirty = useCallback(() => {
    if (!hydrated) return
    setDirty(true)
    setSaveState('dirty')
  }, [hydrated])

  const save = useCallback(
    async (autosave: boolean) => {
      if (savingRef.current) return
      savingRef.current = true
      setSaveState('saving')
      setError(null)
      try {
        const res = await fetch(`/api/publisher-studio/${publisher.id}/content/${contentId}`, {
          method: 'PUT',
          headers: await authHeaders(),
          body: JSON.stringify(buildPayload(autosave)),
        })
        const json = await res.json()
        if (res.status === 409 || json.error === 'CONTENT_VERSION_CONFLICT') {
          setSaveState('conflict')
          setConflictOpen(true)
          setLocalCopy(JSON.stringify(buildPayload(false), null, 2))
          return
        }
        if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
        applyItem(json.item)
        setSaveState('saved')
      } catch (e) {
        setSaveState('error')
        setError(e instanceof Error ? e.message : 'Hata')
      } finally {
        savingRef.current = false
      }
    },
    [publisher.id, contentId, buildPayload, applyItem]
  )

  useEffect(() => {
    if (!hydrated || !dirty) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void save(true)
    }, PUBLISHER_CONTENT_AUTOSAVE_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [
    hydrated,
    dirty,
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
    altText,
    credit,
    caption,
    save,
  ])

  const reloadServer = async () => {
    const res = await fetch(`/api/publisher-studio/${publisher.id}/content/${contentId}`, {
      headers: await authHeaders(),
    })
    const json = await res.json()
    if (res.ok) {
      applyItem(json.item)
      setConflictOpen(false)
      setSaveState('saved')
      setError(null)
    }
  }

  const copyLocal = async () => {
    try {
      await navigator.clipboard.writeText(localCopy || JSON.stringify(buildPayload(false), null, 2))
    } catch {
      /* ignore */
    }
  }

  const action = async (path: string, body?: unknown) => {
    setBusy(true)
    setError(null)
    setPublishSuccess(null)
    try {
      if (dirty) await save(false)
      const res = await fetch(`/api/publisher-studio/${publisher.id}/content/${contentId}/${path}`, {
        method: path === 'schedule' && (body as { cancel?: boolean })?.cancel ? 'DELETE' : 'POST',
        headers: await authHeaders(),
        body:
          path === 'schedule' && (body as { cancel?: boolean })?.cancel
            ? undefined
            : body !== undefined
              ? JSON.stringify(body)
              : undefined,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'İşlem başarısız')
      applyItem(json.item)
      void loadSidePanels()
      if (path === 'publish' && json.item?.publishedNewsId) {
        setPublishSuccess({ newsId: json.item.publishedNewsId })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata')
    } finally {
      setBusy(false)
    }
  }

  const uploadMedia = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (altText) fd.append('altText', altText)
      if (credit) fd.append('credit', credit)
      if (caption) fd.append('caption', caption)
      const res = await fetch(`/api/publisher-studio/${publisher.id}/content/${contentId}/media`, {
        method: 'POST',
        headers: await authHeaders(false),
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi')
      setHeroImageUrl(json.media.url)
      setAltText(json.media.altText ?? altText)
      setCredit(json.media.credit ?? credit)
      setCaption(json.media.caption ?? caption)
      markDirty()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Medya yükleme hatası')
    } finally {
      setBusy(false)
    }
  }

  const restoreRevision = async (revisionId: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/publisher-studio/${publisher.id}/content/${contentId}/revisions`,
        {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ revisionId }),
        }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Geri yüklenemedi')
      applyItem(json.item)
      void loadSidePanels()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata')
    } finally {
      setBusy(false)
    }
  }

  const addToPage = () => {
    if (!item?.publishedNewsId) return
    sessionStorage.setItem(
      `publisher-studio-add-article:${publisher.id}`,
      JSON.stringify({ articleId: item.publishedNewsId, at: Date.now() })
    )
    window.location.href = ROUTES.PUBLISHER_STUDIO.LAYOUT_EDIT(slug)
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
  const pubFailed =
    item &&
    (item.publicationStatus === 'PARTIAL' || item.publicationStatus === 'FAILED')
  const canRestore =
    item &&
    item.status !== 'PUBLISHED' &&
    !item.publishedNewsId &&
    item.publicationStatus !== 'PUBLISHED' &&
    item.publicationStatus !== 'PARTIAL' &&
    item.publicationStatus !== 'PUBLISHING'

  const showSubmit =
    can('content:submit') &&
    item &&
    (item.status === 'DRAFT' || item.status === 'CHANGES_REQUESTED')
  const showReview =
    can('content:review') && item && (item.status === 'IN_REVIEW' || item.status === 'CHANGES_REQUESTED')
  const showApprove = can('content:approve') && item && item.status === 'IN_REVIEW'
  const showPublish =
    can('content:publish') &&
    item &&
    (item.status === 'APPROVED' || item.status === 'SCHEDULED' || Boolean(pubFailed))
  const showFast =
    can('content:publish') &&
    role &&
    (role === 'OWNER' || role === 'ADMIN') &&
    item &&
    item.status !== 'PUBLISHED' &&
    item.status !== 'ARCHIVED'
  const showSchedule =
    can('content:schedule') &&
    item &&
    (item.status === 'APPROVED' || item.status === 'SCHEDULED')
  const showArchive = can('content:archive') && item && item.status !== 'ARCHIVED'

  return (
    <PublisherStudioShell slug={slug} publisher={publisher}>
      {conflictOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="conflict-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
        >
          <div className="w-full max-w-md rounded-xl bg-[rgb(var(--color-card))] p-5 shadow-lg">
            <h2 id="conflict-title" className="text-lg font-black">
              Sürüm çakışması
            </h2>
            <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">
              Bu haber başka bir ekip üyesi tarafından güncellendi. Sessiz üzerine yazma yapılmaz.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" className="studio-btn-primary" onClick={() => void reloadServer()}>
                Son Sürümü Yükle
              </button>
              <button type="button" className="studio-btn" onClick={() => void copyLocal()}>
                Benim Değişikliklerimi Kopyala
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pb-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href={ROUTES.PUBLISHER_STUDIO.ARTICLES(slug)}
              className="text-xs font-bold text-[rgb(var(--color-muted))]"
            >
              ← Content Studio
            </Link>
            <h1 className="mt-1 text-2xl font-black">Haber Editörü</h1>
            <p className="text-xs text-[rgb(var(--color-muted))]">
              {statusLabel}
              {saveState === 'dirty'
                ? ' · Değişiklik var'
                : saveState === 'saving'
                  ? ' · Kaydediliyor…'
                  : saveState === 'saved'
                    ? ' · Kaydedildi'
                    : saveState === 'conflict'
                      ? ' · Çakışma'
                      : saveState === 'error'
                        ? ' · Kayıt hatası'
                        : ''}
            </p>
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {item?.reviewNote ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Editör notu: {item.reviewNote}
          </p>
        ) : null}
        {pubFailed ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
            <p className="font-bold">Yayınlama tamamlanamadı</p>
            <p className="mt-1 text-red-800/80">Teknik detay yalnızca iç kayıtlarda tutulur.</p>
            {can('content:publish') ? (
              <button
                type="button"
                className="studio-btn mt-2"
                disabled={busy}
                onClick={() => void action('publish', { fast: false })}
              >
                Tekrar Dene
              </button>
            ) : null}
          </div>
        ) : null}
        {publishSuccess ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
            <p className="font-bold">Yayınlandı</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href={ROUTES.NEWS_DETAIL(item?.seoSlug || publishSuccess.newsId)} className="studio-btn-primary inline-flex">
                Haberi Gör
              </Link>
              <Link href={ROUTES.PUBLISHER(slug)} className="studio-btn inline-flex">
                Profile Git
              </Link>
              <button type="button" className="studio-btn" onClick={addToPage}>
                Sayfaya Ekle
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">Başlık</span>
              <input
                className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-lg font-bold"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  markDirty()
                }}
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">Spot</span>
              <textarea
                className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
                rows={2}
                value={spot}
                onChange={(e) => {
                  setSpot(e.target.value)
                  markDirty()
                }}
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">Özet</span>
              <textarea
                className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
                rows={2}
                value={summary}
                onChange={(e) => {
                  setSummary(e.target.value)
                  markDirty()
                }}
              />
            </label>

            <div>
              <p className="mb-2 text-xs font-bold uppercase text-[rgb(var(--color-muted))]">Gövde</p>
              <ArticleBlockEditor
                value={bodyBlocks}
                onChange={(blocks) => {
                  setBodyBlocks(blocks)
                  markDirty()
                }}
                availableImages={heroImageUrl ? [{ url: heroImageUrl, caption: caption || undefined }] : []}
                sourceContent={summary}
                articleTitle={title}
                articleSummary={summary}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">
                  Kategori
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value)
                    markDirty()
                  }}
                >
                  <option value="">Seçin</option>
                  {DEFAULT_CATEGORIES.filter((c) => !c.standalone).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">İl</span>
                <select
                  className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
                  value={citySlug}
                  onChange={(e) => {
                    setCitySlug(e.target.value)
                    setDistrictSlug('')
                    markDirty()
                  }}
                >
                  <option value="">Seçin</option>
                  {TURKISH_PROVINCES.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">İlçe</span>
                <select
                  className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
                  value={districtSlug}
                  disabled={!citySlug}
                  onChange={(e) => {
                    setDistrictSlug(e.target.value)
                    markDirty()
                  }}
                >
                  <option value="">Seçin</option>
                  {districts.map((d) => (
                    <option key={d.slug} value={d.slug}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">
                  Etiketler
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
                  value={tags}
                  onChange={(e) => {
                    setTags(e.target.value)
                    markDirty()
                  }}
                  placeholder="virgülle ayırın (en fazla 40)"
                />
              </label>

              <div className="sm:col-span-2 space-y-2 rounded-lg border border-[rgb(var(--color-border))] p-3">
                <p className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">
                  Hero görsel
                </p>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="block w-full text-sm"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void uploadMedia(f)
                  }}
                />
                <input
                  className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
                  value={heroImageUrl}
                  onChange={(e) => {
                    setHeroImageUrl(e.target.value)
                    markDirty()
                  }}
                  placeholder="veya görsel URL"
                  aria-label="Hero görsel URL"
                />
                <input
                  className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
                  value={altText}
                  onChange={(e) => {
                    setAltText(e.target.value)
                    markDirty()
                  }}
                  placeholder="Alt metin (AI yok)"
                  aria-label="Görsel alt metin"
                />
                <input
                  className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
                  value={credit}
                  onChange={(e) => {
                    setCredit(e.target.value)
                    markDirty()
                  }}
                  placeholder="Kredi / kaynak"
                  aria-label="Görsel kredisi"
                />
                <input
                  className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
                  value={caption}
                  onChange={(e) => {
                    setCaption(e.target.value)
                    markDirty()
                  }}
                  placeholder="Caption"
                  aria-label="Görsel caption"
                />
              </div>

              <label className="block">
                <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">
                  Video URL
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
                  value={videoUrl}
                  onChange={(e) => {
                    setVideoUrl(e.target.value)
                    markDirty()
                  }}
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">
                  SEO başlık
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
                  value={seoTitle}
                  onChange={(e) => {
                    setSeoTitle(e.target.value)
                    markDirty()
                  }}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">
                  SEO açıklama
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
                  value={seoDescription}
                  onChange={(e) => {
                    setSeoDescription(e.target.value)
                    markDirty()
                  }}
                />
              </label>
              {showSchedule ? (
                <label className="block sm:col-span-2">
                  <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">
                    Planlanan zaman (Europe/Istanbul)
                  </span>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                  />
                </label>
              ) : null}
              {can('content:breaking') ? (
                <label className="flex items-center gap-2 pt-6 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={isBreaking}
                    onChange={(e) => {
                      setIsBreaking(e.target.checked)
                      markDirty()
                    }}
                  />
                  Son dakika
                </label>
              ) : null}
              {showReview || showApprove ? (
                <label className="block sm:col-span-2">
                  <span className="text-xs font-bold uppercase text-[rgb(var(--color-muted))]">
                    Düzeltme notu (iç — yayına sızmaz)
                  </span>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
                    rows={2}
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                  />
                </label>
              ) : null}
            </div>
          </div>

          <aside className="space-y-3">
            <div className="flex gap-1">
              <button
                type="button"
                className={
                  sideTab === 'activity'
                    ? 'rounded-lg bg-[rgb(var(--color-brand))]/10 px-2 py-1 text-xs font-bold'
                    : 'rounded-lg px-2 py-1 text-xs font-semibold text-[rgb(var(--color-muted))]'
                }
                onClick={() => setSideTab('activity')}
              >
                Aktivite
              </button>
              <button
                type="button"
                className={
                  sideTab === 'revisions'
                    ? 'rounded-lg bg-[rgb(var(--color-brand))]/10 px-2 py-1 text-xs font-bold'
                    : 'rounded-lg px-2 py-1 text-xs font-semibold text-[rgb(var(--color-muted))]'
                }
                onClick={() => setSideTab('revisions')}
              >
                Sürüm Geçmişi
              </button>
            </div>
            {sideTab === 'activity' ? (
              <ul className="max-h-96 space-y-2 overflow-y-auto text-xs">
                {audit.map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded-lg border border-[rgb(var(--color-border))] px-2 py-2"
                  >
                    <p className="font-bold">
                      {AUDIT_LABELS[ev.eventType] ?? ev.eventType}
                    </p>
                    <p className="text-[rgb(var(--color-muted))]">
                      {new Date(ev.createdAt).toLocaleString('tr-TR')}
                    </p>
                  </li>
                ))}
                {!audit.length ? (
                  <li className="text-[rgb(var(--color-muted))]">Henüz kayıt yok</li>
                ) : null}
              </ul>
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto text-xs">
                {revisions.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-[rgb(var(--color-border))] px-2 py-2"
                  >
                    <p className="font-bold">
                      #{r.revisionNumber} · {r.changeKind}
                    </p>
                    <p className="text-[rgb(var(--color-muted))]">
                      {new Date(r.createdAt).toLocaleString('tr-TR')}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[rgb(var(--color-muted))]">
                      {typeof r.snapshot?.title === 'string' ? r.snapshot.title : '—'}
                    </p>
                    {canRestore ? (
                      <button
                        type="button"
                        className="studio-btn mt-2 !px-2 !py-1 !text-xs"
                        disabled={busy}
                        onClick={() => void restoreRevision(r.id)}
                      >
                        Bu sürümü geri yükle
                      </button>
                    ) : (
                      <p className="mt-1 text-[rgb(var(--color-muted))]">Salt okunur</p>
                    )}
                  </li>
                ))}
                {!revisions.length ? (
                  <li className="text-[rgb(var(--color-muted))]">Sürüm yok</li>
                ) : null}
              </ul>
            )}
          </aside>
        </div>
      </div>

      {/* Mobile sticky actions */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-[rgb(var(--color-card))]/80">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-2">
          <button
            type="button"
            className="studio-btn"
            disabled={busy}
            aria-label="Kaydet"
            onClick={() => void save(false)}
          >
            Kaydet
          </button>
          <Link
            href={ROUTES.PUBLISHER_STUDIO.ARTICLE_PREVIEW(slug, contentId)}
            className="studio-btn inline-flex"
          >
            Önizle
          </Link>
          {showSubmit ? (
            <button
              type="button"
              className="studio-btn"
              disabled={busy}
              onClick={() => void action('submit')}
            >
              İncelemeye Gönder
            </button>
          ) : null}
          {showReview ? (
            <button
              type="button"
              className="studio-btn"
              disabled={busy}
              onClick={() => void action('request-changes', { reviewNote })}
            >
              Değişiklik İste
            </button>
          ) : null}
          {showApprove ? (
            <button
              type="button"
              className="studio-btn"
              disabled={busy}
              onClick={() => void action('approve')}
            >
              Onayla
            </button>
          ) : null}
          {showPublish ? (
            <button
              type="button"
              className="studio-btn-primary"
              disabled={busy}
              onClick={() => void action('publish', { fast: false })}
            >
              Yayınla
            </button>
          ) : null}
          {showFast ? (
            <button
              type="button"
              className="studio-btn"
              disabled={busy}
              onClick={() => void action('publish', { fast: true })}
            >
              Hızlı Yayın
            </button>
          ) : null}
          {showSchedule ? (
            <>
              <button
                type="button"
                className="studio-btn"
                disabled={busy || !scheduleAt}
                onClick={() =>
                  void action('schedule', {
                    scheduledAt: new Date(scheduleAt).toISOString(),
                    timezone: 'Europe/Istanbul',
                  })
                }
              >
                Planla
              </button>
              {item?.status === 'SCHEDULED' ? (
                <button
                  type="button"
                  className="studio-btn"
                  disabled={busy}
                  onClick={() => void action('schedule', { cancel: true })}
                >
                  Planı İptal Et
                </button>
              ) : null}
            </>
          ) : null}
          {showArchive ? (
            <button
              type="button"
              className="studio-btn"
              disabled={busy}
              onClick={() => void action('archive')}
            >
              Arşivle
            </button>
          ) : null}
        </div>
      </div>
    </PublisherStudioShell>
  )
}

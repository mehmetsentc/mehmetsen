'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, X, Pencil, MoreHorizontal } from 'lucide-react'
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'
import { adminNewsService, type AdminNewsSource } from '@/services/adminNewsService'
import { getMobileCategoryLabel, updateNewsCategory } from '@/lib/mobileAdminCategory'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { cn } from '@/lib/utils'
import { MobileCategorySheet } from './MobileCategorySheet'

interface ReviewDoc {
  id: string
  title: string
  summary: string
  content: string
  source: string
  categoryId: string
  image?: string
  isBreaking?: boolean
  confidenceScore?: number
  seoTitle?: string
  seoDescription?: string
  slug?: string
}

export function MobileApprovalReview({ id }: { id: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sourceParam = searchParams.get('source')
  const source: AdminNewsSource = sourceParam === 'news' ? 'news' : sourceParam === 'newsQueue' ? 'newsQueue' : 'newsDrafts'
  const rapid = searchParams.get('mode') === 'rapid'
  const { can } = useCmsAuth()

  const [docData, setDocData] = useState<ReviewDoc | null>(null)
  const [queueIds, setQueueIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categorySaving, setCategorySaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        if (source === 'newsQueue') {
          const snap = await getDoc(doc(db, Collections.NEWS_QUEUE, id))
          if (!snap.exists() || cancelled) {
            if (!cancelled) setDocData(null)
            return
          }
          const data = snap.data()
          const input = (data.input ?? {}) as Record<string, unknown>
          setDocData({
            id: snap.id,
            title: String(input.originalTitle ?? '').trim() || 'Başlıksız',
            summary: String(input.originalSummary ?? '').trim(),
            content: String(input.originalContent ?? '').trim(),
            source: String(input.sourceLabel ?? data.workerId ?? ''),
            categoryId: String(input.forcedCategoryId ?? ''),
            image: String(input.imageUrl ?? ''),
            isBreaking: Boolean(input.isBreaking),
            confidenceScore: undefined,
            seoTitle: '',
            seoDescription: '',
            slug: '',
          })
        } else {
          const col = source === 'newsDrafts' ? 'newsDrafts' : Collections.NEWS
          const snap = await getDoc(doc(db, col, id))
          if (!snap.exists() || cancelled) {
            if (!cancelled) setDocData(null)
            return
          }
          const data = snap.data()
          setDocData({
            id: snap.id,
            title: (data.title as string) ?? '',
            summary: (data.summary as string) || (data.spot as string) || '',
            content: (data.content as string) || (data.description as string) || '',
            source: (data.source as string) ?? '',
            categoryId: (data.categoryId as string) || (data.category as string) || '',
            image: (data.imageUrl as string) || (data.thumbnail as string) || (data.coverImageUrl as string) || '',
            isBreaking: Boolean(data.isBreaking),
            confidenceScore: data.confidenceScore as number | undefined,
            seoTitle: (data.seoTitle as string) || '',
            seoDescription: (data.seoDescription as string) || '',
            slug: (data.slug as string) || '',
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id, source])

  useEffect(() => {
    if (!rapid && source !== 'newsDrafts') return
    void getDocs(
      query(
        collection(db, 'newsDrafts'),
        where('draftStatus', '==', 'pending_review'),
        orderBy('createdAt', 'desc'),
        limit(80)
      )
    ).then((snap) => setQueueIds(snap.docs.map((d) => d.id)))
  }, [rapid, source])

  const progress = useMemo(() => {
    const idx = queueIds.indexOf(id)
    if (idx < 0) return null
    return { current: idx + 1, total: queueIds.length, nextId: queueIds[idx + 1] ?? null }
  }, [queueIds, id])

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1800)
  }

  async function goNextOrList() {
    if (progress?.nextId) {
      router.replace(`/admin/approvals/${progress.nextId}?source=newsDrafts${rapid ? '&mode=rapid' : ''}`)
      return
    }
    router.replace('/admin/approvals')
  }

  async function onApprove() {
    if (!can('news:publish') && !can('news:edit')) {
      flash('Onay yetkiniz yok')
      return
    }
    setBusy(true)
    try {
      await adminNewsService.approve(id, source)
      flash('Haber onaylandı')
      await goNextOrList()
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Onay başarısız')
    } finally {
      setBusy(false)
    }
  }

  async function onCategorySelect(categoryId: string) {
    if (!docData || categoryId === docData.categoryId) {
      setCategoryOpen(false)
      return
    }
    const prev = docData.categoryId
    setCategorySaving(true)
    setDocData({ ...docData, categoryId })
    try {
      await updateNewsCategory(id, categoryId)
      flash('Kategori güncellendi')
      setCategoryOpen(false)
    } catch (e) {
      setDocData((d) => (d ? { ...d, categoryId: prev } : d))
      flash(e instanceof Error ? e.message : 'Kategori güncellenemedi')
    } finally {
      setCategorySaving(false)
    }
  }

  async function onReject(reason?: string) {
    setBusy(true)
    setRejectOpen(false)
    try {
      await adminNewsService.reject(id, source, reason)
      flash('Haber reddedildi')
      await goNextOrList()
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Red başarısız')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="p-4"><div className="h-64 animate-pulse rounded-2xl bg-[rgb(var(--color-border))]" /></div>
  }

  if (!docData) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-sm text-[rgb(var(--color-muted))]">Haber bulunamadı.</p>
        <Link href="/admin/approvals" className="mt-3 inline-block text-sm font-semibold text-[rgb(var(--color-brand))]">
          Kuyruğa dön
        </Link>
      </div>
    )
  }

  const seoOk = Boolean(docData.seoTitle || docData.title)
  const descOk = Boolean(docData.seoDescription || docData.summary)
  const imageOk = Boolean(docData.image)

  return (
    <div className="flex min-h-full flex-col">
      <header
        className="sticky top-0 z-20 flex items-center gap-2 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/95 px-2 py-2 backdrop-blur"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          onClick={() => router.push('/admin/approvals')}
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          aria-label="Geri"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[rgb(var(--color-text))]">Onay inceleme</p>
          {progress ? (
            <p className="text-[11px] text-[rgb(var(--color-muted))]">
              {progress.current} / {progress.total}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          aria-label="Diğer"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 px-4 pb-28 pt-3">
        {docData.image ? (
          <div className="mb-4 overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={docData.image} alt="" className="aspect-[16/10] w-full object-cover" />
          </div>
        ) : null}

        <div className="mb-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryOpen(true)}
            disabled={categorySaving}
            className="flex min-h-11 items-center rounded-md bg-[rgb(var(--color-brand))]/10 px-3 py-2 text-[10px] font-bold uppercase text-[rgb(var(--color-brand))] disabled:opacity-60"
          >
            {getMobileCategoryLabel(docData.categoryId) || 'Kategori'} ›
          </button>
          {docData.isBreaking ? (
            <span className="rounded-md bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase text-red-600">
              Son Dakika
            </span>
          ) : null}
        </div>

        <h1 className="text-[1.45rem] font-extrabold leading-tight tracking-tight text-[rgb(var(--color-text))]">
          {docData.title}
        </h1>
        {docData.summary ? (
          <p className="mt-3 text-[15px] leading-relaxed text-[rgb(var(--color-muted))]">{docData.summary}</p>
        ) : null}

        <section className="mt-5 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Haber</h2>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[rgb(var(--color-text))]">
            {(docData.content || '').slice(0, 2500)}
            {(docData.content || '').length > 2500 ? '…' : ''}
          </p>
        </section>

        <section className="mt-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Kaynak</h2>
          <p className="mt-1 text-sm font-semibold text-[rgb(var(--color-text))]">{docData.source || '—'}</p>
        </section>

        <section className="mt-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">SEO / Medya</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            <Flag ok={seoOk} label="Başlık" />
            <Flag ok={descOk} label="Açıklama" />
            <Flag ok={Boolean(docData.slug)} label="Slug" />
            <Flag ok={imageOk} label="Görsel" />
          </div>
        </section>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/95 px-2 pt-2 backdrop-blur"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-lg gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => setRejectOpen(true)}
            className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl border border-red-300 text-sm font-semibold text-red-600 disabled:opacity-60"
          >
            <X className="h-4 w-4 shrink-0" />
            Reddet
          </button>
          <Link
            href={`/admin/news/${id}/edit`}
            className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl border border-[rgb(var(--color-border))] text-sm font-semibold text-[rgb(var(--color-text))]"
          >
            <Pencil className="h-4 w-4 shrink-0" />
            Düzenle
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onApprove()}
            className="flex min-h-11 min-w-0 flex-[1.2] items-center justify-center gap-1 rounded-xl bg-[rgb(var(--color-brand))] text-sm font-bold text-white disabled:opacity-60"
          >
            <Check className="h-4 w-4 shrink-0" />
            Onayla
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-40">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-[rgb(var(--color-card))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              className="flex min-h-12 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-red-600"
              onClick={() => {
                setMenuOpen(false)
                setRejectOpen(true)
              }}
            >
              <X className="h-4 w-4" />
              Reddet
            </button>
            {progress?.nextId ? (
              <button
                type="button"
                className="flex min-h-12 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-[rgb(var(--color-text))]"
                onClick={() => {
                  setMenuOpen(false)
                  router.replace(`/admin/approvals/${progress.nextId}?source=newsDrafts${rapid ? '&mode=rapid' : ''}`)
                }}
              >
                Atla / Sonraki
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {rejectOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-black/45" onClick={() => setRejectOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 space-y-2 rounded-t-2xl bg-[rgb(var(--color-card))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="text-sm font-bold text-[rgb(var(--color-text))]">Reddetme nedeni</p>
            {['Kaynak yetersiz', 'Tekrar haber', 'İçerik hatalı', 'Görsel uygun değil', 'Diğer'].map((reason) => (
              <button
                key={reason}
                type="button"
                disabled={busy}
                onClick={() => void onReject(reason)}
                className="flex min-h-11 w-full items-center rounded-xl border border-[rgb(var(--color-border))] px-3 text-left text-sm font-medium text-[rgb(var(--color-text))]"
              >
                {reason}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <MobileCategorySheet
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        categoryId={docData.categoryId}
        onSelect={onCategorySelect}
        saving={categorySaving}
        title="Kategori değiştir"
      />

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4">
          <div className="rounded-full bg-[rgb(var(--color-text))] px-4 py-2 text-xs font-semibold text-[rgb(var(--color-card))] shadow-lg">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('rounded-md px-2 py-1', ok ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700')}>
      {label} {ok ? '✓' : '⚠'}
    </span>
  )
}

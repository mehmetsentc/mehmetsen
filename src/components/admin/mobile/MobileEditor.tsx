'use client'

/**
 * MOBILE-ADMIN-1 Faz 2 — 3-step mobile editor (create + light edit).
 *   1 · Fotoğraf + başlık   2 · Metin (spot + paragraflar)   3 · Yayın (kategori, şehir/ilçe,
 *   son dakika, önizleme, Taslak / Onaya gönder / Yayınla)
 * Uses the same APIs as the desktop editor (POST /api/admin/news, PUT /api/admin/news/[id]).
 * Slug, SEO title/description are filled by the server as before ("Gelişmiş" = desktop editor).
 * Edit mode never rewrites a body that holds images / headings / lists — that stays a
 * desktop-editor job (the text box is locked with a link).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, Check, ChevronRight, ImagePlus, Loader2, MapPin, X } from 'lucide-react'
import { auth } from '@/lib/firebase/auth'
import { storageService } from '@/services/storageService'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { getMobileCategoryLabel } from '@/lib/mobileAdminCategory'
import { filterProvincesByQuery, getCityCategoryName, getDistrictsForProvince } from '@/constants/cities'
import { bodyToBlocks, isPlainParagraphBody } from '@/lib/mobileAdminRules'
import type { ArticleBlock } from '@/lib/articleBlocks'
import type { Post } from '@/types/post'
import { cn } from '@/lib/utils'
import { MobileCategorySheet } from './MobileCategorySheet'

const DRAFT_KEY = 'nh:mobile-editor-draft:v1'
const TITLE_MAX = 70
const STEPS = ['Fotoğraf ve başlık', 'Metin', 'Yayın'] as const

type Draft = {
  title: string
  spot: string
  body: string
  imageUrl: string
  categoryId: string
  isBreaking: boolean
  citySlug: string
  districtSlug: string
}

function emptyDraft(breaking: boolean): Draft {
  return { title: '', spot: '', body: '', imageUrl: '', categoryId: 'gundem', isBreaking: breaking, citySlug: '', districtSlug: '' }
}

function initialBody(post: { bodyBlocks?: ArticleBlock[]; content?: string }): string {
  const blocks = post.bodyBlocks ?? []
  if (blocks.length) return blocks.map((b) => (b.type === 'paragraph' ? b.text : '')).filter(Boolean).join('\n\n')
  return (post.content ?? '').replace(/<\/p>\s*<p[^>]*>/gi, '\n\n').replace(/<[^>]+>/g, '').trim()
}

function readDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}
function writeDraft(d: Draft | null) {
  try {
    if (d) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    else window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    // private mode: no autosave
  }
}

function newRequestId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `m-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

export function MobileEditor({ mode, post, breakingDefault = false }: { mode: 'create' | 'edit'; post?: Post | null; breakingDefault?: boolean }) {
  const router = useRouter()
  const { user, can } = useCmsAuth()
  const canPublish = can('news:publish')

  const original: Draft = useMemo(
    () =>
      post
        ? {
            title: post.title ?? '',
            spot: post.spot ?? '',
            body: initialBody(post),
            imageUrl: post.coverImageUrl ?? '',
            categoryId: post.categoryId ?? 'gundem',
            isBreaking: post.isBreaking === true,
            citySlug: post.citySlug ?? '',
            districtSlug: post.districtSlug ?? '',
          }
        : emptyDraft(breakingDefault),
    [post, breakingDefault]
  )
  // Edit: read the stored body blocks from the API (the list mapping can drop them for
  // queue drafts). Until they are known the text box stays locked — never risk wiping
  // images / headings by saving plain paragraphs over them.
  const [stored, setStored] = useState<{ blocks: ArticleBlock[] | null; content: string } | undefined>(undefined)
  useEffect(() => {
    if (mode !== 'edit' || !post) return
    let alive = true
    void (async () => {
      try {
        const token = (await auth.currentUser?.getIdToken()) ?? ''
        const res = await fetch(`/api/admin/news/${encodeURIComponent(post.id)}`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error(String(res.status))
        const body = (await res.json()) as { data?: { bodyBlocks?: unknown; content?: unknown; description?: unknown } }
        const blocks = Array.isArray(body.data?.bodyBlocks) ? (body.data!.bodyBlocks as ArticleBlock[]) : null
        const content = typeof body.data?.content === 'string' ? body.data.content : typeof body.data?.description === 'string' ? body.data.description : ''
        if (alive) setStored({ blocks, content })
      } catch {
        if (alive) setStored({ blocks: [{ id: 'x', type: 'divider' }], content: '' }) // unknown → locked
      }
    })()
    return () => {
      alive = false
    }
  }, [mode, post])
  const bodyLocked =
    mode === 'edit' && (!stored || !isPlainParagraphBody({ bodyBlocks: stored.blocks, content: stored.content }))

  const [d, setD] = useState<Draft>(original)
  const [restored, setRestored] = useState(false)
  const [step, setStep] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState<null | 'draft' | 'pending' | 'published' | 'save'>(null)
  const [error, setError] = useState<string | null>(null)
  const [catOpen, setCatOpen] = useState(false)
  const [cityQuery, setCityQuery] = useState('')
  const requestId = useRef(newRequestId())

  // create: restore the phone's unsent draft once, then autosave
  useEffect(() => {
    if (mode !== 'create') return
    const saved = readDraft()
    if (saved && (saved.title || saved.body || saved.spot)) {
      setD({ ...emptyDraft(breakingDefault), ...saved })
      setRestored(true)
    }
  }, [mode, breakingDefault])
  useEffect(() => {
    if (mode !== 'create') return
    const id = window.setTimeout(() => writeDraft(d.title || d.body || d.spot || d.imageUrl ? d : null), 400)
    return () => window.clearTimeout(id)
  }, [d, mode])

  useEffect(() => {
    if (!stored || bodyLocked) return
    const fromStored = initialBody({ bodyBlocks: stored.blocks ?? undefined, content: stored.content })
    if (fromStored && fromStored !== original.body) {
      original.body = fromStored
      setD((cur) => (cur.body === '' || cur.body === initialBody(post ?? {}) ? { ...cur, body: fromStored } : cur))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored, bodyLocked])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }))
  const districts = useMemo(() => (d.citySlug ? getDistrictsForProvince(d.citySlug) : []), [d.citySlug])
  const cityMatches = useMemo(() => (cityQuery.trim() ? filterProvincesByQuery(cityQuery, 6) : []), [cityQuery])

  async function onPickImage(file: File | null) {
    if (!file || !user) return
    setUploading(true)
    setError(null)
    try {
      const url = await storageService.uploadPostImage(file, user.uid, `mobile-${Date.now()}`)
      set('imageUrl', url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Görsel yüklenemedi')
    } finally {
      setUploading(false)
    }
  }

  function geoFields(x: Draft) {
    const district = districts.find((t) => t.slug === x.districtSlug)
    return {
      city: x.citySlug ? getCityCategoryName(x.citySlug) : '',
      citySlug: x.citySlug,
      district: district?.name ?? '',
      districtSlug: x.districtSlug,
    }
  }

  async function submit(action: 'draft' | 'pending' | 'published' | 'save') {
    if (!d.title.trim()) {
      setStep(0)
      setError('Başlık gerekli')
      return
    }
    if (action === 'published' && !canPublish) {
      setError('Doğrudan yayınlama yetkiniz yok — onaya gönderin')
      return
    }
    if (action === 'published' && !window.confirm('Haber şimdi yayınlanacak. Emin misiniz?')) return
    const current = auth.currentUser
    if (!current) {
      setError('Giriş gerekli')
      return
    }
    setBusy(action)
    setError(null)
    try {
      const token = await current.getIdToken()
      const blocks = bodyToBlocks(d.body)
      const firstPara = blocks[0]?.type === 'paragraph' ? blocks[0].text : ''
      let res: Response
      if (mode === 'create') {
        res = await fetch('/api/admin/news', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: d.title.trim(),
            spot: d.spot.trim(),
            summary: (d.spot.trim() || firstPara || d.title.trim()).slice(0, 280),
            ...(blocks.length ? { bodyBlocks: blocks } : { content: d.spot.trim() || d.title.trim() }),
            categoryId: d.categoryId,
            status: action === 'save' ? 'draft' : action,
            isBreaking: d.isBreaking,
            thumbnail: d.imageUrl || undefined,
            ...geoFields(d),
            createRequestId: requestId.current,
          }),
        })
      } else {
        // only what changed
        const patch: Record<string, unknown> = {}
        if (d.title !== original.title) patch.title = d.title.trim()
        if (d.spot !== original.spot) patch.spot = d.spot.trim()
        if (!bodyLocked && d.body !== original.body && blocks.length) patch.bodyBlocks = blocks
        if (d.imageUrl && d.imageUrl !== original.imageUrl) patch.thumbnail = d.imageUrl
        if (d.categoryId !== original.categoryId) patch.categoryId = d.categoryId
        if (d.isBreaking !== original.isBreaking) patch.isBreaking = d.isBreaking
        if (d.citySlug !== original.citySlug || d.districtSlug !== original.districtSlug) Object.assign(patch, geoFields(d))
        if (action !== 'save') patch.status = action
        if (Object.keys(patch).length === 0) {
          router.back()
          return
        }
        res = await fetch(`/api/admin/news/${encodeURIComponent(post!.id)}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
      }
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'Kayıt başarısız')
      if (mode === 'create') writeDraft(null)
      const status = action === 'save' ? (mode === 'edit' ? post?.status : 'draft') : action
      router.replace(`/admin/news?filter=${status === 'published' ? 'published' : status === 'pending' ? 'pending' : status === 'draft' ? 'draft' : 'all'}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setBusy(null)
    }
  }

  const titleLen = d.title.trim().length
  const titleHint =
    titleLen === 0 ? null : titleLen > TITLE_MAX ? 'Google’da kesilebilir — 70 karakterin altında tutun' : titleLen < 25 ? 'Biraz kısa — haberi tam anlatıyor mu?' : null
  const canNext = step === 0 ? titleLen > 0 : true
  const fullHref = mode === 'edit' && post ? `/admin/news/${post.id}/edit?full=1` : `/admin/news/create?full=1`

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col">
      <header
        className="sticky top-0 z-20 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]"
        style={{ paddingTop: 'max(0.25rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-1 px-2 py-1.5">
          <button
            type="button"
            onClick={() => (step > 0 ? setStep(step - 1) : router.back())}
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            aria-label={step > 0 ? 'Önceki adım' : 'Kapat'}
          >
            {step > 0 ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-[rgb(var(--color-text))]">
              {mode === 'edit' ? 'Haberi düzenle' : d.isBreaking ? 'Son dakika' : 'Yeni haber'}
            </p>
            <p className="text-[11px] text-[rgb(var(--color-muted))]">
              Adım {step + 1}/3 · {STEPS[step]}
            </p>
          </div>
          <Link href={fullHref} className="rounded-lg px-2 py-2 text-[11px] font-semibold text-[rgb(var(--color-muted))]">
            Tam editör
          </Link>
        </div>
        <div className="flex gap-1 px-3 pb-2">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Adım ${i + 1}`}
              onClick={() => (i <= step || titleLen > 0 ? setStep(i) : null)}
              className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-[rgb(var(--color-brand))]' : 'bg-[rgb(var(--color-border))]')}
            />
          ))}
        </div>
      </header>

      <div className="flex-1 space-y-4 px-4 py-4 pb-40">
        {restored && step === 0 ? (
          <div className="flex items-center justify-between rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <span>Gönderilmemiş taslağınız geri yüklendi.</span>
            <button
              type="button"
              className="font-bold underline"
              onClick={() => {
                writeDraft(null)
                setD(emptyDraft(breakingDefault))
                setRestored(false)
              }}
            >
              Temizle
            </button>
          </div>
        ) : null}

        {step === 0 ? (
          <>
            <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
              {d.imageUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.imageUrl} alt="" className="aspect-video w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-lg bg-black/60 px-2.5 py-1.5 text-xs font-semibold text-white"
                    onClick={() => set('imageUrl', '')}
                  >
                    Değiştir
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 p-3">
                  <label className="flex min-h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-surface))] text-sm font-semibold text-[rgb(var(--color-text))]">
                    <Camera className="h-5 w-5" />
                    Fotoğraf çek
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)} />
                  </label>
                  <label className="flex min-h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-surface))] text-sm font-semibold text-[rgb(var(--color-text))]">
                    <ImagePlus className="h-5 w-5" />
                    Galeriden seç
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
              )}
              {uploading ? (
                <p className="flex items-center justify-center gap-2 pb-3 text-xs text-[rgb(var(--color-muted))]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fotoğraf yükleniyor…
                </p>
              ) : null}
            </div>
            {!d.imageUrl && !uploading ? (
              <p className="text-[11px] text-[rgb(var(--color-muted))]">Fotoğrafsız haber sosyal medyada görselle paylaşılamaz; marka arka planı kullanılır.</p>
            ) : null}

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Başlık</span>
              <textarea
                value={d.title}
                onChange={(e) => set('title', e.target.value)}
                rows={3}
                placeholder="Haberi doğru ve net anlatan başlık…"
                className="mt-1.5 w-full resize-none rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-3 text-[1.3rem] font-bold leading-snug text-[rgb(var(--color-text))] outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/30"
              />
              <span className="mt-1 flex justify-between gap-2 text-[11px]">
                <span className={titleLen > TITLE_MAX ? 'text-red-600' : 'text-amber-700 dark:text-amber-300'}>{titleHint}</span>
                <span className={cn('shrink-0', titleLen > TITLE_MAX ? 'font-bold text-red-600' : 'text-[rgb(var(--color-muted))]')}>
                  {titleLen} / {TITLE_MAX}
                </span>
              </span>
            </label>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Spot</span>
              <textarea
                value={d.spot}
                onChange={(e) => set('spot', e.target.value)}
                rows={3}
                placeholder="Haberin özü, 1–2 cümle…"
                className="mt-1.5 w-full resize-none rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-3 text-[15px] leading-relaxed text-[rgb(var(--color-text))] outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/30"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Haber metni</span>
              {bodyLocked && mode === 'edit' && !stored ? (
                <p className="mt-1.5 flex items-center gap-2 rounded-2xl border border-[rgb(var(--color-border))] p-4 text-sm text-[rgb(var(--color-muted))]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Metin yükleniyor…
                </p>
              ) : bodyLocked ? (
                <div className="mt-1.5 rounded-2xl border border-dashed border-[rgb(var(--color-border))] p-4 text-sm text-[rgb(var(--color-muted))]">
                  Bu haberin metninde görsel, ara başlık veya liste var; telefonda değiştirilirse bunlar kaybolur.{' '}
                  <Link href={fullHref} className="font-semibold text-[rgb(var(--color-brand))] underline">
                    Metni tam editörde düzenle
                  </Link>
                </div>
              ) : (
                <>
                  <textarea
                    value={d.body}
                    onChange={(e) => set('body', e.target.value)}
                    rows={12}
                    placeholder={'Haberin metni. Paragraflar arasında bir satır boşluk bırakın.'}
                    className="mt-1.5 w-full rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-3 text-[15px] leading-relaxed text-[rgb(var(--color-text))] outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/30"
                  />
                  <span className="mt-1 block text-right text-[11px] text-[rgb(var(--color-muted))]">
                    {bodyToBlocks(d.body).length} paragraf · {d.body.trim() ? d.body.trim().split(/\s+/).length : 0} kelime
                  </span>
                </>
              )}
            </label>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <button
              type="button"
              onClick={() => setCatOpen(true)}
              className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 text-left"
            >
              <span>
                <span className="block text-[11px] font-bold uppercase text-[rgb(var(--color-muted))]">Kategori</span>
                <span className="text-sm font-semibold text-[rgb(var(--color-text))]">{getMobileCategoryLabel(d.categoryId) || 'Kategori seç'}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-[rgb(var(--color-muted))]" />
            </button>

            <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase text-[rgb(var(--color-muted))]">
                <MapPin className="h-3.5 w-3.5" /> Şehir / ilçe (yerel haber)
              </p>
              {d.citySlug ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[rgb(var(--color-text))]">{getCityCategoryName(d.citySlug)}</span>
                  <button type="button" className="text-xs font-semibold text-[rgb(var(--color-brand))]" onClick={() => setD((c) => ({ ...c, citySlug: '', districtSlug: '' }))}>
                    Kaldır
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={cityQuery}
                    onChange={(e) => setCityQuery(e.target.value)}
                    placeholder="İl ara (ör. Çanakkale)"
                    className="h-11 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 text-sm outline-none"
                  />
                  {cityMatches.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {cityMatches.map((c) => (
                        <button
                          key={c.slug}
                          type="button"
                          onClick={() => {
                            setD((cur) => ({ ...cur, citySlug: c.slug, districtSlug: '' }))
                            setCityQuery('')
                          }}
                          className="min-h-10 rounded-full border border-[rgb(var(--color-border))] px-3 text-sm font-medium"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
              {districts.length ? (
                <select
                  value={d.districtSlug}
                  onChange={(e) => set('districtSlug', e.target.value)}
                  className="mt-3 h-11 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 text-sm"
                >
                  <option value="">İlçe (isteğe bağlı)</option>
                  {districts.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-[rgb(var(--color-text))]">Son dakika</span>
                <span className="text-[11px] text-[rgb(var(--color-muted))]">Son dakika bandında gösterilir</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={d.isBreaking}
                onClick={() => set('isBreaking', !d.isBreaking)}
                className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', d.isBreaking ? 'bg-[rgb(var(--color-brand))]' : 'bg-[rgb(var(--color-border))]')}
              >
                <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform', d.isBreaking ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-bold uppercase text-[rgb(var(--color-muted))]">Önizleme</p>
              <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
                {d.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.imageUrl} alt="" className="aspect-video w-full object-cover" />
                ) : null}
                <div className="p-3.5">
                  <p className="text-[10px] font-bold uppercase text-[rgb(var(--color-brand))]">
                    {d.isBreaking ? 'Son dakika · ' : ''}
                    {getMobileCategoryLabel(d.categoryId)}
                    {d.citySlug ? ` · ${getCityCategoryName(d.citySlug)}` : ''}
                  </p>
                  <p className="mt-1 text-[17px] font-bold leading-snug text-[rgb(var(--color-text))]">{d.title || 'Başlık'}</p>
                  {d.spot ? <p className="mt-1.5 line-clamp-3 text-sm text-[rgb(var(--color-muted))]">{d.spot}</p> : null}
                </div>
              </div>
            </div>
          </>
        ) : null}

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 pt-2"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-2xl gap-2">
          {step < 2 ? (
            <button
              type="button"
              disabled={!canNext || uploading}
              onClick={() => setStep(step + 1)}
              className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[rgb(var(--color-brand))] text-sm font-bold text-white disabled:opacity-50"
            >
              Devam <ChevronRight className="h-4 w-4" />
            </button>
          ) : mode === 'edit' ? (
            <>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void submit('save')}
                className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[rgb(var(--color-brand))] text-sm font-bold text-white disabled:opacity-60"
              >
                {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Kaydet
              </button>
              {post?.status !== 'published' && canPublish ? (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void submit('published')}
                  className="min-h-12 flex-1 rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-60"
                >
                  Yayınla
                </button>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void submit('draft')}
                className="min-h-12 flex-1 rounded-xl border border-[rgb(var(--color-border))] text-sm font-semibold disabled:opacity-60"
              >
                Taslak
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void submit('pending')}
                className="min-h-12 flex-[1.3] rounded-xl bg-[rgb(var(--color-brand))] text-sm font-bold text-white disabled:opacity-60"
              >
                {busy === 'pending' ? 'Gönderiliyor…' : 'Onaya gönder'}
              </button>
              {canPublish ? (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void submit('published')}
                  className="min-h-12 flex-1 rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-60"
                >
                  {busy === 'published' ? '…' : 'Yayınla'}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      <MobileCategorySheet
        open={catOpen}
        onClose={() => setCatOpen(false)}
        categoryId={d.categoryId}
        onSelect={(id) => {
          setD((cur) => ({ ...cur, categoryId: id, isBreaking: id === 'son-dakika' ? true : cur.isBreaking }))
          setCatOpen(false)
        }}
      />
    </div>
  )
}

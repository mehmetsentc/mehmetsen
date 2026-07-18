'use client'

import { useId, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  Pencil, X, Save, Loader2, Zap, Hash, Search as SearchIcon, Wand2, Plus,
} from 'lucide-react'
import { EditMediaSection, type AdditionalImageItem } from '@/components/admin/EditMediaSection'
import { ArticleBlockEditor } from '@/components/admin/ArticleBlockEditor'
import { getAdminCategoryGroups } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { TURKISH_PROVINCES, getDistrictsForProvince } from '@/constants/cities'
import { WORLD_COUNTRIES, findCountryBySlug, resolveCountrySlug } from '@/constants/countries'
import { auth } from '@/lib/firebase/auth'
import type { Post } from '@/types/post'
import type { ArticleBlock } from '@/lib/articleBlocks'
import type { AdminNewsItem } from '@/services/adminNewsService'

export type AdminNewsEditorMode = 'create' | 'edit'
export type AdminNewsEditorVariant = 'drawer' | 'page'

export interface AdminNewsEditorProps {
  mode: AdminNewsEditorMode
  variant: AdminNewsEditorVariant
  post?: Post | AdminNewsItem
  userId: string
  username: string
  onClose?: () => void
  onSaved?: (updated: Partial<AdminNewsItem>) => void
}

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-')
}

function parseTagInput(raw: string): string[] {
  return raw.split(/[,;]+/).map(normalizeTag).filter(Boolean)
}

function mergeTags(existing: string[], incoming: string[]): string[] {
  const set = new Set(existing.map(normalizeTag).filter(Boolean))
  for (const tag of incoming) set.add(tag)
  return [...set]
}

const fieldInputCls =
  'w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500'
const fieldCardInputCls =
  'w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-emerald-500'

export function AdminNewsEditor({
  mode,
  variant,
  post,
  userId,
  username: _username,
  onClose,
  onSaved,
}: AdminNewsEditorProps) {
  const router = useRouter()
  const reactId = useId()
  const mediaPostId = post?.id ?? `draft-${reactId.replace(/:/g, '')}`

  const [title, setTitle] = useState(post?.title ?? '')
  const [slug, setSlug] = useState((post as (Post & { slug?: string }) | undefined)?.slug ?? '')
  const [summary, setSummary] = useState(post?.summary ?? '')
  const [content, setContent] = useState(post?.content ?? '')
  const [bodyBlocks, setBodyBlocks] = useState<ArticleBlock[]>(post?.bodyBlocks ?? [])
  const [articleLayout, setArticleLayout] = useState<'standard' | 'longform'>(
    post?.articleLayout === 'longform' ? 'longform' : 'standard'
  )
  const [spot, setSpot] = useState(post?.spot ?? '')
  const [categoryId, setCategoryId] = useState(post?.categoryId ?? '')
  const [status, setStatus] = useState<string>(post?.status ?? (mode === 'create' ? 'pending' : 'draft'))
  const [citySlug, setCitySlug] = useState((post as (Post & { citySlug?: string }) | undefined)?.citySlug ?? '')
  const [districtSlug, setDistrictSlug] = useState((post as (Post & { districtSlug?: string }) | undefined)?.districtSlug ?? '')
  const [countrySlug, setCountrySlug] = useState(() =>
    resolveCountrySlug(
      (post as (Post & { countrySlug?: string }) | undefined)?.countrySlug,
      (post as (Post & { country?: string; location?: { country?: string } }) | undefined)?.country
        ?? (post as (Post & { location?: { country?: string } }) | undefined)?.location?.country
    )
  )
  const isWorldCategory = categoryId === 'dunya'
  const availableDistricts = useMemo(() => getDistrictsForProvince(citySlug), [citySlug])
  const [thumbnail, setThumbnail] = useState(post?.coverImageUrl ?? '')
  const [imageCaption, setImageCaption] = useState(post?.imageCaption?.trim() || '')
  const [videoUrl, setVideoUrl] = useState(post?.mediaItems?.find((m) => m.type === 'video')?.url ?? '')
  const [additionalImages, setAdditionalImages] = useState<AdditionalImageItem[]>(
    (post as (Post & { additionalImages?: AdditionalImageItem[] }) | undefined)?.additionalImages ?? []
  )
  const [tags, setTags] = useState<string[]>(post?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const storedSeoTitle = post?.seoTitle?.trim() ?? ''
  const storedSeoDescription = post?.seoDescription?.trim() ?? ''
  const [seoTitle, setSeoTitle] = useState(storedSeoTitle || post?.title?.trim() || '')
  const [seoDescription, setSeoDescription] = useState(
    storedSeoDescription || post?.summary?.trim() || post?.spot?.trim() || ''
  )
  const [seoKeywords, setSeoKeywords] = useState<string[]>(
    (post as (Post & { seoKeywords?: string[] }) | undefined)?.seoKeywords ?? []
  )
  const [seoKeywordInput, setSeoKeywordInput] = useState('')
  const [aiKwLoading, setAiKwLoading] = useState(false)
  const seoTitleUsesFallback = mode === 'edit' && !storedSeoTitle
  const seoDescriptionUsesFallback = mode === 'edit' && !storedSeoDescription
  const [isBreaking, setIsBreaking] = useState<boolean>(post?.isBreaking ?? false)
  const [isLiveBlog, setIsLiveBlog] = useState<boolean>(post?.isLiveBlog ?? false)
  const [liveUpdateDraft, setLiveUpdateDraft] = useState('')
  const [liveUpdates, setLiveUpdates] = useState(
    () =>
      (post?.liveUpdates ?? []).map((u, i) => ({
        id: u.id || `u-${i + 1}`,
        content: u.content,
        timestamp: u.timestamp || new Date().toISOString(),
        author: u.author,
      }))
  )
  const [mediaUploading, setMediaUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const headerTitle = mode === 'create' ? 'Yeni Haber' : 'Haberi Düzenle'
  const saveLabel = mode === 'create' ? 'Yayınla' : 'Kaydet'

  const addTagsFromInput = () => {
    const parsed = parseTagInput(tagInput)
    if (parsed.length === 0) return
    setTags((prev) => mergeTags(prev, parsed))
    setTagInput('')
  }

  const generateAiKeywords = async () => {
    setAiKwLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken() ?? ''
      const input = [title, content || summary].filter(Boolean).join('\n\n').slice(0, 2000)
      const res = await fetch('/api/admin/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: 'keywords', input }),
      })
      const data = await res.json() as { keywords?: string[] }
      if (Array.isArray(data.keywords) && data.keywords.length > 0) {
        setSeoKeywords((prev) => [
          ...new Set([...prev, ...data.keywords!.map((k: string) => k.trim().toLowerCase()).filter(Boolean)]),
        ])
        toast.success(`${data.keywords.length} anahtar kelime eklendi`)
      } else {
        toast.error('AI anahtar kelime üretemedi')
      }
    } catch {
      toast.error('AI isteği başarısız')
    } finally {
      setAiKwLoading(false)
    }
  }

  const buildPayload = () => {
    const country = countrySlug ? findCountryBySlug(countrySlug) : undefined
    const payloadTags =
      isWorldCategory && country
        ? mergeTags(tags, [country.slug, normalizeTag(country.name)])
        : tags

    return {
    title,
    slug: slug.trim() || undefined,
    summary,
    content,
    bodyBlocks,
    articleLayout,
    spot,
    categoryId,
    status,
    thumbnail,
    imageCaption,
    videoUrl,
    additionalImages,
    tags: payloadTags,
    seoTitle,
    seoDescription,
    seoKeywords,
    isBreaking,
    isLiveBlog,
    liveUpdates: isLiveBlog ? liveUpdates : [],
    ...(isWorldCategory && countrySlug
      ? {
          countrySlug,
          country: country?.name ?? countrySlug,
          location: {
            country: country?.name ?? countrySlug,
            city: '',
            lat: 0,
            lng: 0,
          },
        }
      : citySlug
        ? {
            citySlug,
            city: TURKISH_PROVINCES.find((p) => p.slug === citySlug)?.name ?? citySlug,
            country: 'Türkiye',
            ...(districtSlug ? { districtSlug } : {}),
          }
        : {}),
  }
  }

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Başlık boş olamaz')
      return
    }
    if (mediaUploading) {
      toast.error('Medya yüklemesi devam ediyor')
      return
    }
    setSaving(true)
    try {
      const currentUser = auth.currentUser
      if (!currentUser) {
        toast.error('Oturumunuz sona ermiş, lütfen sayfayı yenileyip tekrar giriş yapın')
        return
      }
      const token = await currentUser.getIdToken(true)
      const payload = buildPayload()

      if (mode === 'create') {
        const res = await fetch('/api/admin/news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...payload, draftId: mediaPostId }),
        })
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error ?? `Kayıt başarısız (${res.status})`)
        }
        toast.success('Haber oluşturuldu')
        if (variant === 'drawer') {
          onClose?.()
        } else {
          router.push(ROUTES.ADMIN.NEWS)
        }
        return
      }

      if (!post?.id) throw new Error('Haber bulunamadı')

      const res = await fetch(`/api/admin/news/${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? `Kayıt başarısız (${res.status})`)
      }

      toast.success('Haber güncellendi')
      const updated = {
        title,
        summary,
        content,
        bodyBlocks,
        articleLayout,
        spot,
        categoryId,
        status: status as AdminNewsItem['status'],
        coverImageUrl: thumbnail || post.coverImageUrl,
        tags,
        seoTitle,
        seoDescription,
        seoKeywords,
        isBreaking,
      }

      if (variant === 'drawer') {
        onSaved?.(updated)
        onClose?.()
      } else {
        router.push(ROUTES.ADMIN.NEWS)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata oluştu')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (variant === 'drawer') {
      onClose?.()
    } else {
      router.back()
    }
  }

  const formFields = (
  <div className="flex-1 overflow-y-auto space-y-4 p-5">
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">Başlık</label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={fieldInputCls}
        placeholder="Haber başlığı..."
      />
    </div>

    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-semibold text-[rgb(var(--color-muted))]">Slug (URL)</label>
        <span className="text-[10px] text-amber-600 dark:text-amber-400">⚠ Değiştirmek mevcut URL&apos;yi bozabilir</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] text-[rgb(var(--color-muted))]">nahaber.com/haber/</span>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
          className="flex-1 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm font-mono text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="haber-slug..."
        />
      </div>
    </div>

    <div>
      <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">Spot (girizgah)</label>
      <textarea
        value={spot}
        onChange={(e) => setSpot(e.target.value)}
        rows={2}
        className={`${fieldInputCls} resize-none`}
        placeholder="2-4 cümlelik haber girişi..."
      />
    </div>

    <div>
      <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">Özet</label>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={2}
        className={`${fieldInputCls} resize-none`}
        placeholder="Kısa özet..."
      />
    </div>

    <div>
      <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">İçerik</label>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={10}
        className={`${fieldInputCls} resize-y font-mono`}
        placeholder="Haber metni..."
      />
      <p className="mt-1 text-[10px] text-[rgb(var(--color-muted))]">
        Zengin gövde blokları varsa bu alan geriye dönük düz metin özeti olarak saklanır.
      </p>
    </div>

    <div>
      <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">Görsel / Video</label>
      <EditMediaSection
        postId={mediaPostId}
        userId={userId}
        thumbnail={thumbnail}
        thumbnailCaption={imageCaption}
        videoUrl={videoUrl}
        additionalImages={additionalImages}
        articleTitle={title}
        articleContent={content}
        articleSummary={summary}
        onThumbnailChange={setThumbnail}
        onThumbnailCaptionChange={setImageCaption}
        onVideoUrlChange={setVideoUrl}
        onAdditionalImagesChange={setAdditionalImages}
        onUploadingChange={setMediaUploading}
      />
    </div>

    <ArticleBlockEditor
      value={bodyBlocks}
      onChange={setBodyBlocks}
      sourceContent={content}
      articleTitle={title}
      articleSummary={summary}
      availableImages={[
        ...(thumbnail ? [{ url: thumbnail, caption: imageCaption }] : []),
        ...additionalImages,
      ]}
    />

    <div>
      <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">
        Makale görünümü
      </label>
      <select
        value={articleLayout}
        onChange={(event) => setArticleLayout(event.target.value === 'longform' ? 'longform' : 'standard')}
        className={fieldInputCls}
      >
        <option value="standard">Standart haber</option>
        <option value="longform">Gezi / longform (geniş ve ferah)</option>
      </select>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">Kategori</label>
        <select
          value={categoryId}
          onChange={(e) => {
            const next = e.target.value
            setCategoryId(next)
            if (next === 'dunya') {
              setCitySlug('')
              setDistrictSlug('')
            } else {
              setCountrySlug('')
            }
          }}
          className={fieldInputCls}
        >
          <option value="">— seçin —</option>
          {getAdminCategoryGroups().map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.parentId ? `↳ ${cat.name}` : cat.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">Durum</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={fieldInputCls}
        >
          <option value="draft">Taslak</option>
          <option value="pending">Onay Bekliyor</option>
          <option value="published">Yayında</option>
          <option value="archived">Arşiv</option>
        </select>
      </div>
    </div>

    <div className="space-y-2">
      {isWorldCategory ? (
        <>
          <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">
            Ülke
            <span className="ml-1 font-normal">(dünya haberleri için)</span>
          </label>
          <select
            value={countrySlug}
            onChange={(e) => setCountrySlug(e.target.value)}
            className={`${fieldInputCls} focus:ring-emerald-500`}
          >
            <option value="">— Ülke seçin —</option>
            {WORLD_COUNTRIES.map((country) => (
              <option key={country.slug} value={country.slug}>
                {country.name}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">
            Şehir
            <span className="ml-1 text-[rgb(var(--color-muted))] font-normal">(isteğe bağlı · yerel akışta da görünür)</span>
          </label>
          <select
            value={citySlug}
            onChange={(e) => {
              setCitySlug(e.target.value)
              setDistrictSlug('')
            }}
            className={`${fieldInputCls} focus:ring-emerald-500`}
          >
            <option value="">— Şehir seçin (isteğe bağlı) —</option>
            {TURKISH_PROVINCES.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>
          {citySlug && availableDistricts.length > 0 && (
            <select
              value={districtSlug}
              onChange={(e) => setDistrictSlug(e.target.value)}
              className={`${fieldInputCls} focus:ring-emerald-500`}
            >
              <option value="">— İlçe seçin (isteğe bağlı) —</option>
              {availableDistricts.map((d) => (
                <option key={d.slug} value={d.slug}>{d.name}</option>
              ))}
            </select>
          )}
        </>
      )}
    </div>

    <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3">
      <div className="flex items-center gap-2">
        <Zap className={`h-4 w-4 ${isBreaking ? 'text-red-500' : 'text-[rgb(var(--color-muted))]'}`} />
        <div>
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Son Dakika</p>
          <p className="text-[11px] text-[rgb(var(--color-muted))]">Ana sayfada ve son dakika şeridinde öne çıkar</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setIsBreaking((v) => !v)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          isBreaking ? 'bg-red-500' : 'bg-[rgb(var(--color-border))]'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            isBreaking ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>

    <div className="space-y-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Canlı Blog</p>
          <p className="text-[11px] text-[rgb(var(--color-muted))]">
            Açıkken /canli/{'{slug}'} sayfasında güncelleme akışı gösterilir
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsLiveBlog((v) => !v)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            isLiveBlog ? 'bg-emerald-500' : 'bg-[rgb(var(--color-border))]'
          }`}
          aria-pressed={isLiveBlog}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              isLiveBlog ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      {isLiveBlog ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={liveUpdateDraft}
              onChange={(e) => setLiveUpdateDraft(e.target.value)}
              placeholder="Yeni canlı güncelleme ekle..."
              className={`${fieldInputCls} flex-1`}
            />
            <button
              type="button"
              onClick={() => {
                const content = liveUpdateDraft.trim()
                if (!content) return
                setLiveUpdates((prev) => [
                  {
                    id: `u-${Date.now()}`,
                    content,
                    timestamp: new Date().toISOString(),
                    author: 'Editör',
                  },
                  ...prev,
                ])
                setLiveUpdateDraft('')
              }}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              Ekle
            </button>
          </div>
          {liveUpdates.length > 0 ? (
            <ul className="max-h-48 space-y-2 overflow-y-auto text-xs text-[rgb(var(--color-text))]">
              {liveUpdates.map((u) => (
                <li
                  key={u.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2"
                >
                  <span className="min-w-0 flex-1">{u.content}</span>
                  <button
                    type="button"
                    onClick={() => setLiveUpdates((prev) => prev.filter((x) => x.id !== u.id))}
                    className="shrink-0 text-[rgb(var(--color-muted))] hover:text-red-500"
                    aria-label="Güncellemeyi sil"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-[rgb(var(--color-muted))]">Henüz güncelleme yok.</p>
          )}
        </div>
      ) : null}
    </div>

    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[rgb(var(--color-muted))]">
        <Hash className="h-3.5 w-3.5" />
        Etiketler
      </label>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {tags.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900 dark:text-blue-300"
          >
            #{tag}
            <button
              type="button"
              onClick={() => setTags(tags.filter((_, j) => j !== i))}
              className="ml-0.5 rounded-full transition-colors hover:text-red-500"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-xs text-[rgb(var(--color-muted))]">Henüz etiket yok</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
              e.preventDefault()
              addTagsFromInput()
            }
          }}
          placeholder="Etiket yaz veya virgülle ayırarak toplu ekle (NATO, CHP, ...)"
          className="flex-1 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={addTagsFromInput}
          disabled={!tagInput.trim()}
          className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          Ekle
        </button>
      </div>
    </div>

    <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4 space-y-3">
      <p className="flex items-center gap-1.5 text-xs font-bold text-[rgb(var(--color-text))]">
        <SearchIcon className="h-3.5 w-3.5 text-emerald-500" />
        SEO Ayarları
      </p>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-semibold text-[rgb(var(--color-muted))]">SEO Başlık</label>
          <span className={`text-[10px] font-mono ${seoTitle.length > 65 ? 'text-red-500' : 'text-[rgb(var(--color-muted))]'}`}>
            {seoTitle.length}/65
          </span>
        </div>
        <input
          type="text"
          value={seoTitle}
          onChange={(e) => setSeoTitle(e.target.value)}
          maxLength={80}
          placeholder="Arama motorları için optimize başlık (55-65 karakter)..."
          className={fieldCardInputCls}
        />
        {!seoTitle && (
          <p className="mt-1 text-[10px] text-[rgb(var(--color-muted))]">Boş bırakılırsa haber başlığı kullanılır</p>
        )}
        {seoTitleUsesFallback && seoTitle && (
          <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
            Kayıtlı SEO başlığı yok — haber başlığı otomatik dolduruldu
          </p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-semibold text-[rgb(var(--color-muted))]">SEO Açıklama (Meta Description)</label>
          <span className={`text-[10px] font-mono ${seoDescription.length > 165 ? 'text-red-500' : 'text-[rgb(var(--color-muted))]'}`}>
            {seoDescription.length}/165
          </span>
        </div>
        <textarea
          value={seoDescription}
          onChange={(e) => setSeoDescription(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder="Google SERP snippet açıklaması (145-165 karakter)..."
          className={`${fieldCardInputCls} resize-none`}
        />
        {!seoDescription && (
          <p className="mt-1 text-[10px] text-[rgb(var(--color-muted))]">Boş bırakılırsa özet kullanılır</p>
        )}
        {seoDescriptionUsesFallback && seoDescription && (
          <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
            Kayıtlı SEO açıklaması yok — özet/spot otomatik dolduruldu
          </p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-semibold text-[rgb(var(--color-muted))]">🔑 SEO Anahtar Kelimeler</label>
          <button
            type="button"
            onClick={generateAiKeywords}
            disabled={aiKwLoading}
            className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {aiKwLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
            {aiKwLoading ? 'Üretiliyor...' : '✨ AI Üret'}
          </button>
        </div>
        {seoKeywords.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {seoKeywords.map((kw) => (
              <span
                key={kw}
                className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
              >
                {kw}
                <button
                  type="button"
                  onClick={() => setSeoKeywords((prev) => prev.filter((k) => k !== kw))}
                  className="ml-0.5 text-emerald-600 hover:text-red-500"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={seoKeywordInput}
            onChange={(e) => setSeoKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                const kws = seoKeywordInput.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean)
                if (kws.length) {
                  setSeoKeywords((prev) => [...new Set([...prev, ...kws])])
                  setSeoKeywordInput('')
                }
              }
            }}
            placeholder="kelime1, kelime2... (virgülle ayır)"
            className="flex-1 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => {
              const kws = seoKeywordInput.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean)
              if (kws.length) {
                setSeoKeywords((prev) => [...new Set([...prev, ...kws])])
                setSeoKeywordInput('')
              }
            }}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Ekle
          </button>
        </div>
        <p className="mt-1 text-[10px] text-[rgb(var(--color-muted))]">
          Google meta keywords — virgülle ayırarak veya Enter ile ekle ({seoKeywords.length} kelime)
        </p>
      </div>
    </div>
  </div>
  )

  const footer = (
    <div className="flex items-center justify-end gap-2 border-t border-[rgb(var(--color-border))] px-5 py-3">
      <button
        type="button"
        onClick={handleCancel}
        className="rounded-xl border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]"
      >
        İptal
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mode === 'create' ? <Plus className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
        {saving ? 'Kaydediliyor...' : saveLabel}
      </button>
    </div>
  )

  if (variant === 'drawer') {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
        <div
          className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-[rgb(var(--color-card))] shadow-2xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-4">
            <div className="flex items-center gap-2">
              {mode === 'create' ? <Plus className="h-4 w-4 text-blue-500" /> : <Pencil className="h-4 w-4 text-blue-500" />}
              <span className="text-sm font-bold text-[rgb(var(--color-text))]">{headerTitle}</span>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-[rgb(var(--color-surface))]">
              <X className="h-4 w-4 text-[rgb(var(--color-muted))]" />
            </button>
          </div>
          {formFields}
          {footer}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm">
      <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-4">
        <div className="flex items-center gap-2">
          {mode === 'create' ? <Plus className="h-4 w-4 text-blue-500" /> : <Pencil className="h-4 w-4 text-blue-500" />}
          <span className="text-sm font-bold text-[rgb(var(--color-text))]">{headerTitle}</span>
        </div>
      </div>
      {formFields}
      {footer}
    </div>
  )
}

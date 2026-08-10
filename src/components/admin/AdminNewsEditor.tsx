'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  Pencil, X, Save, Loader2, Zap, Hash, Search as SearchIcon, Wand2, Plus, Eye, Star, Sparkles,
} from 'lucide-react'
import { EditMediaSection, type AdditionalImageItem } from '@/components/admin/EditMediaSection'
import { ArticleBlockEditor } from '@/components/admin/ArticleBlockEditor'
import { ArticleBlocksRenderer } from '@/components/news/ArticleBlocksRenderer'
import { filterBodyBlocksForArticleDisplay } from '@/lib/articleBlocksFromAi'
import { articleBlocksToPlainText } from '@/lib/articleBlocks'
import { deriveSeoKeywords, extractSeoKeywordsFromAiPayload } from '@/lib/seoKeywords'
import {
  getAdminCategoryGroups,
  getSubcategories,
  YEREL_HABER_CATEGORY_ID,
  isYerelCategoryTree,
  resolveYerelCategoryParts,
  composeYerelCategoryId,
} from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { TURKISH_PROVINCES, getDistrictsForProvince } from '@/constants/cities'
import { WORLD_COUNTRIES, findCountryBySlug, resolveCountrySlug } from '@/constants/countries'
import { auth } from '@/lib/firebase/auth'
import type { Post } from '@/types/post'
import type { ArticleBlock } from '@/lib/articleBlocks'
import type { AdminNewsItem } from '@/services/adminNewsService'
import { stripHtmlToNewsPlainText } from '@/lib/stripHtmlToNewsPlainText'

/** {"caption":"..."} formatındaki bozuk değerleri temizler */
function sanitizeCaptionValue(v: string | undefined | null): string {
  const s = v?.trim() ?? ''
  if (!s.startsWith('{')) return s
  try {
    const obj = JSON.parse(s) as Record<string, unknown>
    if (typeof obj.caption === 'string' && obj.caption.trim()) return obj.caption.trim()
  } catch {
    const m = s.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*?)(?:"|$)/)
    if (m?.[1]?.trim()) return m[1].trim()
  }
  return s
}

interface ProfessionalAiResult {
  title?: string
  spot?: string
  summary?: string
  content?: string
  bodyBlocks?: ArticleBlock[]
  seoTitle?: string
  seoDescription?: string
  categoryId?: string
  tags?: string[]
  seoKeywords?: string[]
  imageOrder?: string[]
  imageCaption?: string
  additionalImages?: AdditionalImageItem[]
  qualityScore?: number
  gateDecision?: 'publish' | 'review'
  researchSources?: Array<{ title: string; url: string }>
  liveResearchUsed?: boolean
  editorName?: string | null
  editorSlug?: string | null
  aiEditorId?: string | null
  routeConfidence?: number | null
  routeReason?: string | null
  secondaryEditorSlug?: string | null
  suggestedCitySlug?: string | null
  suggestedDistrictSlug?: string | null
  suggestedCountrySlug?: string | null
  error?: string
}

const AI_EDITOR_AUTO = '__auto__'

type AiEditorOption = {
  id: string
  name: string
  slug: string
  title: string
  desk?: string
  personaType?: string
  assignableForNews?: boolean
  primarySpecialization?: string
}

function aiEditorGroupLabel(editor: AiEditorOption): string {
  if (editor.personaType === 'columnist') return 'AI KÖŞE YAZARLARI'
  if (editor.personaType === 'local_editor') return 'YEREL'
  if (editor.personaType === 'breaking_editor') return 'SON DAKİKA'
  if (editor.personaType === 'senior_editor') return 'GENEL'
  if (
    editor.personaType === 'seo_editor' ||
    editor.personaType === 'copy_editor' ||
    editor.personaType === 'verification_editor'
  ) {
    return 'İÇ AJANLAR'
  }
  return (editor.desk || editor.primarySpecialization || 'MASA').toLocaleUpperCase('tr-TR')
}

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

function clampSeoTitle(text: string, max = 65): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return sp > max * 0.6 ? cut.slice(0, sp) : cut
}

function clampSeoDescription(text: string, max = 165): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const ends = [cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! ')]
  const best = Math.max(...ends)
  if (best > max * 0.55) return cut.slice(0, best + 1)
  const sp = cut.lastIndexOf(' ')
  return sp > max * 0.6 ? cut.slice(0, sp) : cut
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
  const [content, setContent] = useState(() => stripHtmlToNewsPlainText(post?.content ?? ''))
  const [bodyBlocks, setBodyBlocks] = useState<ArticleBlock[]>(post?.bodyBlocks ?? [])
  const [articleLayout, setArticleLayout] = useState<'standard' | 'longform'>(
    post?.articleLayout === 'longform' ? 'longform' : 'standard'
  )
  const [articleFormat, setArticleFormat] = useState<'standard' | 'column' | 'analysis'>(
    post?.articleFormat === 'column' || post?.articleFormat === 'analysis'
      ? post.articleFormat
      : 'standard'
  )
  const [aiEditorId, setAiEditorId] = useState(
    post?.aiEditorId?.trim() ? post.aiEditorId.trim() : AI_EDITOR_AUTO
  )
  const [aiEditors, setAiEditors] = useState<AiEditorOption[]>([])
  const [routedEditorLabel, setRoutedEditorLabel] = useState<string | null>(null)
  const [spot, setSpot] = useState(post?.spot ?? '')
  const [categoryId, setCategoryId] = useState(post?.categoryId ?? '')
  const [status, setStatus] = useState<string>(post?.status ?? (mode === 'create' ? 'pending' : 'draft'))
  const [citySlug, setCitySlug] = useState((post as (Post & { citySlug?: string }) | undefined)?.citySlug?.trim() ?? '')
  const [districtSlug, setDistrictSlug] = useState(post?.districtSlug?.trim() ?? '')
  const [countrySlug, setCountrySlug] = useState(() => {
    // Domestic articles store citySlug for location; don't resolve country from 'Türkiye'
    // — doing so makes countrySlug truthy and hides the city dropdown on re-edit.
    const existingCitySlug = (post as (Post & { citySlug?: string }) | undefined)?.citySlug?.trim()
    if (existingCitySlug) return ''
    return resolveCountrySlug(
      (post as (Post & { countrySlug?: string }) | undefined)?.countrySlug,
      (post as (Post & { country?: string; location?: { country?: string } }) | undefined)?.country
        ?? (post as (Post & { location?: { country?: string } }) | undefined)?.location?.country
    )
  })
  const isWorldCategory = categoryId === 'dunya'
  const yerelCategoryParts = useMemo(() => resolveYerelCategoryParts(categoryId), [categoryId])
  const yerelSubcategories = useMemo(
    () => getSubcategories(YEREL_HABER_CATEGORY_ID),
    []
  )
  const mainCategoryValue = isYerelCategoryTree(categoryId)
    ? YEREL_HABER_CATEGORY_ID
    : categoryId
  const availableDistricts = useMemo(() => getDistrictsForProvince(citySlug), [citySlug])
  const [thumbnail, setThumbnail] = useState(post?.coverImageUrl ?? '')
  const [imageCaption, setImageCaption] = useState(sanitizeCaptionValue(post?.imageCaption) || '')
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
  const autoKwAttemptedRef = useRef(false)
  const seoTitleUsesFallback = mode === 'edit' && !storedSeoTitle
  const seoDescriptionUsesFallback = mode === 'edit' && !storedSeoDescription
  const [isBreaking, setIsBreaking] = useState<boolean>(post?.isBreaking ?? false)
  const [featured, setFeatured] = useState<boolean>(
    post?.featured === true || post?.isEditorPick === true
  )
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
  const [aiPreparing, setAiPreparing] = useState(false)
  const [aiQualityScore, setAiQualityScore] = useState<number | null>(null)
  const [aiResearchSources, setAiResearchSources] = useState<
    Array<{ title: string; url: string }>
  >(
    (post as (Post & {
      aiResearchSources?: Array<{ title: string; url: string }>
    }) | undefined)?.aiResearchSources ?? []
  )
  const [aiGateDecision, setAiGateDecision] = useState<'publish' | 'review' | null>(null)
  const [showAiPreview, setShowAiPreview] = useState(false)

  const aiPreviewBlocks = useMemo(
    () =>
      filterBodyBlocksForArticleDisplay(bodyBlocks, {
        title,
        spot,
        summary,
        coverImageUrl: thumbnail || undefined,
      }),
    [bodyBlocks, title, spot, summary, thumbnail]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = (await auth.currentUser?.getIdToken()) ?? ''
        if (!token) return
        const res = await fetch('/api/admin/ai-editors?status=active', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = (await res.json()) as {
          editors?: AiEditorOption[]
        }
        if (!cancelled) setAiEditors(data.editors ?? [])
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const headerTitle = mode === 'create' ? 'Yeni Haber' : 'Haberi Düzenle'
  const saveLabel = mode === 'create' ? 'Yayınla' : 'Kaydet'

  const addTagsFromInput = () => {
    const parsed = parseTagInput(tagInput)
    if (parsed.length === 0) return
    setTags((prev) => mergeTags(prev, parsed))
    setTagInput('')
  }

  const generateAiKeywords = async (opts?: { silent?: boolean }) => {
    if (aiKwLoading) return
    setAiKwLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken() ?? ''
      if (!token) {
        toast.error('Oturum süresi doldu — sayfayı yenileyin')
        return
      }
      const bodyText =
        content.trim() ||
        articleBlocksToPlainText(bodyBlocks).trim() ||
        summary.trim() ||
        spot.trim()
      const input = [title, bodyText].filter(Boolean).join('\n\n').slice(0, 2000)
      if (!input.trim()) {
        if (!opts?.silent) toast.error('Anahtar kelime üretmek için başlık veya içerik gerekli')
        return
      }
      const res = await fetch('/api/admin/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: 'keywords', input }),
        signal: AbortSignal.timeout(90_000),
      })
      const data = await res.json() as {
        keywords?: string[]
        seoKeywords?: string[]
        error?: string
      }
      if (!res.ok) {
        throw new Error(data.error || `AI isteği başarısız (${res.status})`)
      }
      let nextKeywords = extractSeoKeywordsFromAiPayload(data)
      if (nextKeywords.length === 0) {
        nextKeywords = deriveSeoKeywords(title, tags, spot || summary)
      }
      if (nextKeywords.length === 0) {
        if (!opts?.silent) toast.error('AI anahtar kelime üretemedi')
        return
      }
      setSeoKeywords((prev) => [...new Set([...prev, ...nextKeywords])])
      if (!opts?.silent) toast.success(`${nextKeywords.length} anahtar kelime eklendi`)
    } catch (error) {
      const fallback = deriveSeoKeywords(title, tags, spot || summary)
      if (fallback.length > 0) {
        setSeoKeywords((prev) => [...new Set([...prev, ...fallback])])
        if (!opts?.silent) toast.success(`${fallback.length} anahtar kelime (yedek) eklendi`)
      } else if (!opts?.silent) {
        toast.error(error instanceof Error ? error.message : 'AI isteği başarısız')
      }
    } finally {
      setAiKwLoading(false)
    }
  }

  useEffect(() => {
    autoKwAttemptedRef.current = false
  }, [post?.id])

  useEffect(() => {
    if (autoKwAttemptedRef.current) return
    if (seoKeywords.length > 0) return
    if (!title.trim()) return
    autoKwAttemptedRef.current = true
    void generateAiKeywords({ silent: true })
  }, [post?.id, seoKeywords.length, title])

  const buildPayload = () => {
    const country = countrySlug ? findCountryBySlug(countrySlug) : undefined
    const payloadTags =
      country
        ? mergeTags(tags, [country.slug, normalizeTag(country.name)])
        : tags

    return {
    title,
    slug: slug.trim() || undefined,
    summary,
    content,
    bodyBlocks,
    articleLayout,
    articleFormat,
    aiEditorId: aiEditorId && aiEditorId !== AI_EDITOR_AUTO ? aiEditorId : null,
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
    aiResearchSources,
    isBreaking,
    featured,
    isLiveBlog,
    liveUpdates: isLiveBlog ? liveUpdates : [],
    ...(countrySlug
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
            countrySlug: '',  // Domestic article — clear any stale countrySlug
            ...(districtSlug ? { districtSlug } : {}),
          }
        : {}),
    }
  }

  const selectedAiEditor = useMemo(
    () => aiEditors.find((editor) => editor.id === aiEditorId) ?? null,
    [aiEditors, aiEditorId]
  )
  const isAutoEditor = aiEditorId === AI_EDITOR_AUTO
  const assignableEditors = useMemo(
    () =>
      aiEditors.filter(
        (e) =>
          e.assignableForNews !== false &&
          e.personaType !== 'seo_editor' &&
          e.personaType !== 'copy_editor' &&
          e.personaType !== 'verification_editor'
      ),
    [aiEditors]
  )
  const editorsByGroup = useMemo(() => {
    const map = new Map<string, AiEditorOption[]>()
    for (const editor of assignableEditors) {
      const group = aiEditorGroupLabel(editor)
      const list = map.get(group) ?? []
      list.push(editor)
      map.set(group, list)
    }
    return [...map.entries()]
  }, [assignableEditors])

  const aiPrepareButtonLabel = useMemo(() => {
    if (isAutoEditor) {
      return routedEditorLabel
        ? `${routedEditorLabel} ile haberi hazırla`
        : '✨ Uzman AI Editörle Haberi Hazırla'
    }
    if (selectedAiEditor) {
      const desk = selectedAiEditor.desk || selectedAiEditor.primarySpecialization || ''
      if (selectedAiEditor.slug === 'deniz-erdem') return 'Deniz Erdem ile spor haberini hazırla'
      if (selectedAiEditor.slug === 'burak-celik') return 'Burak Çelik ile yerel haberi hazırla'
      if (selectedAiEditor.slug === 'arda-sahin') return 'Arda Şahin ile son dakika haberi hazırla'
      if (selectedAiEditor.slug === 'kerem-aydin') return 'Kerem Aydın ile ekonomi haberini hazırla'
      return `${selectedAiEditor.name} ile ${desk ? `${desk.toLocaleLowerCase('tr-TR')} ` : ''}haberi hazırla`
    }
    return 'Editör seçip hazırla'
  }, [isAutoEditor, routedEditorLabel, selectedAiEditor])

  const runProfessionalAi = async (autoPublish: boolean, opts?: { requireEditor?: boolean }) => {
    if (opts?.requireEditor && !isAutoEditor && !aiEditorId) {
      toast.error('Önce bir AI editör / yazar seçin')
      return
    }
    const rawInput = stripHtmlToNewsPlainText(
      [title, spot, summary, content].filter(Boolean).join('\n\n').trim()
    )
    if (rawInput.length < 80) {
      toast.error('AI editör için en az 80 karakter ham haber metni girin')
      return
    }
    if (mediaUploading) {
      toast.error('Önce görsel yüklemesinin tamamlanmasını bekleyin')
      return
    }

    setAiPreparing(true)
    try {
      const currentUser = auth.currentUser
      if (!currentUser) throw new Error('Giriş gerekli')
      const token = await currentUser.getIdToken()
      const imageUrls = [thumbnail, ...additionalImages.map((image) => image.url)].filter(Boolean)
      const res = await fetch('/api/admin/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: 'publish-ready',
          input: rawInput,
          imageUrls,
          articleFormat,
          autoRoute: isAutoEditor,
          ...(isAutoEditor
            ? {}
            : { aiEditorId }),
          ...(categoryId ? { categoryId } : {}),
          ...(citySlug ? { citySlug } : {}),
          ...(districtSlug ? { districtSlug } : {}),
          isBreaking,
        }),
      })
      const data = await res.json() as ProfessionalAiResult
      if (!res.ok) throw new Error(data.error || 'AI editör haberi hazırlayamadı')

      const nextTitle = stripHtmlToNewsPlainText(data.title?.trim() || title)
      const nextSpot = stripHtmlToNewsPlainText(data.spot?.trim() || spot)
      const nextSummary = stripHtmlToNewsPlainText(data.summary?.trim() || summary)
      const nextContent = stripHtmlToNewsPlainText(data.content?.trim() || content)
      const nextBlocks = Array.isArray(data.bodyBlocks) ? data.bodyBlocks : bodyBlocks
      const nextThumbnail = data.imageOrder?.[0] || thumbnail
      const nextAdditional = Array.isArray(data.additionalImages)
        ? data.additionalImages.map((img) => ({
            ...img,
            caption: img.caption ? sanitizeCaptionValue(img.caption) || img.caption : img.caption,
          }))
        : additionalImages
      const nextStatus = data.gateDecision === 'publish' ? 'published' : 'pending'

      setTitle(nextTitle)
      setSpot(nextSpot)
      setSummary(nextSummary)
      setContent(nextContent)
      setBodyBlocks(nextBlocks)      setSeoTitle(clampSeoTitle(data.seoTitle?.trim() || nextTitle))
      setSeoDescription(clampSeoDescription(data.seoDescription?.trim() || nextSummary))
      if (data.categoryId?.trim()) setCategoryId(data.categoryId.trim())
      if (data.suggestedCountrySlug?.trim()) {
        setCountrySlug(data.suggestedCountrySlug.trim())
        setCitySlug('')
        setDistrictSlug('')
        if (!data.categoryId?.trim() || data.categoryId === 'gundem') {
          setCategoryId('dunya')
        }
      } else {
        if (data.suggestedCitySlug?.trim()) setCitySlug(data.suggestedCitySlug.trim())
        if (data.suggestedDistrictSlug?.trim()) setDistrictSlug(data.suggestedDistrictSlug.trim())
      }
      if (data.aiEditorId?.trim() && isAutoEditor) {
        // Keep AUTO selected; show who was routed
        const label = data.editorName
          ? `${data.editorName}${data.editorSlug ? '' : ''}`
          : null
        if (data.editorName) {
          const deskHint = aiEditors.find((e) => e.id === data.aiEditorId)?.desk
          setRoutedEditorLabel(
            deskHint ? `${data.editorName} — ${deskHint}` : data.editorName
          )
        }
        void label
      }
      if (Array.isArray(data.tags)) setTags(data.tags)
      {
        const aiKeywords =
          Array.isArray(data.seoKeywords) && data.seoKeywords.length > 0
            ? data.seoKeywords
            : deriveSeoKeywords(nextTitle, Array.isArray(data.tags) ? data.tags : tags, nextSpot)
        if (aiKeywords.length > 0) setSeoKeywords(aiKeywords)
      }
      setThumbnail(nextThumbnail)
      setImageCaption(sanitizeCaptionValue(data.imageCaption) || imageCaption || nextTitle)
      setAdditionalImages(nextAdditional)
      setAiQualityScore(data.qualityScore ?? null)
      setAiGateDecision(data.gateDecision ?? 'review')
      setAiResearchSources(
        Array.isArray(data.researchSources) ? data.researchSources : []
      )
      setStatus(nextStatus)
      setShowAiPreview(true)

      const editorLabel =
        data.editorName?.trim() ||
        routedEditorLabel ||
        selectedAiEditor?.name
      if (!autoPublish) {
        toast.success(
          editorLabel
            ? data.gateDecision === 'publish'
              ? `${editorLabel} ile yayıma hazırlandı`
              : `${editorLabel} ile hazırlandı; incelemeye alındı`
            : data.gateDecision === 'publish'
              ? 'Haber yayıma hazırlandı'
              : 'Haber hazırlandı; kalite kontrolü nedeniyle incelemeye alındı'
        )
        return
      }

      const payload = {
        ...buildPayload(),
        title: nextTitle,
        spot: nextSpot,
        summary: nextSummary,
        content: nextContent,
        bodyBlocks: nextBlocks,
        seoTitle: clampSeoTitle(data.seoTitle?.trim() || nextTitle),
        seoDescription: clampSeoDescription(data.seoDescription?.trim() || nextSummary),
        categoryId: data.categoryId?.trim() || categoryId,
        tags: Array.isArray(data.tags) ? data.tags : tags,
        seoKeywords: Array.isArray(data.seoKeywords) ? data.seoKeywords : seoKeywords,
        thumbnail: nextThumbnail,
        imageCaption: sanitizeCaptionValue(data.imageCaption) || imageCaption || nextTitle,
        additionalImages: nextAdditional,
        aiEditorId: data.aiEditorId || (isAutoEditor ? null : aiEditorId) || null,
        citySlug: data.suggestedCitySlug?.trim() || citySlug,
        districtSlug: data.suggestedDistrictSlug?.trim() || districtSlug,
        countrySlug: data.suggestedCountrySlug?.trim() || countrySlug,
        aiResearchSources: Array.isArray(data.researchSources) ? data.researchSources : [],
        status: nextStatus,
      }
      const saveUrl = mode === 'create' ? '/api/admin/news' : `/api/admin/news/${post?.id}`
      const saveRes = await fetch(saveUrl, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(
          mode === 'create' ? { ...payload, draftId: mediaPostId } : payload
        ),
      })
      if (!saveRes.ok) {
        const error = await saveRes.json().catch(() => ({})) as { error?: string }
        throw new Error(error.error || `Kayıt başarısız (${saveRes.status})`)
      }
      toast.success(
        nextStatus === 'published'
          ? 'AI haberi hazırladı ve yayımladı'
          : 'Haber kalite kontrolü için taslağa kaydedildi'
      )
      if (variant === 'drawer') onClose?.()
      else router.push(ROUTES.ADMIN.NEWS)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI editör isteği başarısız')
    } finally {
      setAiPreparing(false)
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
        articleFormat,
        aiEditorId: aiEditorId || undefined,
        spot,
        categoryId,
        status: status as AdminNewsItem['status'],
        coverImageUrl: thumbnail || post.coverImageUrl,
        tags,
        seoTitle,
        seoDescription,
        seoKeywords,
        isBreaking,
        featured,
        citySlug: citySlug || undefined,
        districtSlug: districtSlug || undefined,
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
  <div className="flex-1 overflow-y-auto space-y-4 p-4 pb-28 md:p-5 md:pb-5">
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-xs font-semibold text-[rgb(var(--color-muted))]">Başlık</label>
        <span className={`text-[10px] font-mono ${title.length > 70 ? 'text-amber-600' : 'text-[rgb(var(--color-muted))]'}`}>
          {title.length}/70
        </span>
      </div>
      <textarea
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        rows={3}
        className={`${fieldInputCls} resize-none text-[22px] font-bold leading-snug md:text-sm md:font-normal md:leading-normal`}
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
      <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">Spot</label>
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

    <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-[rgb(var(--color-card))] to-rose-500/10 p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
        <label className="text-xs font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">
          AI Newsroom — Editör
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-[rgb(var(--color-muted))]">
            Editör
          </label>
          <select
            value={aiEditorId || AI_EDITOR_AUTO}
            onChange={(event) => {
              setAiEditorId(event.target.value)
              setRoutedEditorLabel(null)
            }}
            className={fieldInputCls}
          >
            <option value={AI_EDITOR_AUTO}>✨ Otomatik — NaHaber Akıllı Yönlendirme</option>
            <option value="">Manuel (CMS kullanıcısı)</option>
            {editorsByGroup.map(([group, list]) => (
              <optgroup key={group} label={group}>
                {list.map((editor) => (
                  <option key={editor.id} value={editor.id}>
                    {editor.name} — {editor.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {isAutoEditor && routedEditorLabel && (
            <p className="mt-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
              Yönlendirildi: {routedEditorLabel}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-[rgb(var(--color-muted))]">
            İçerik türü
          </label>
          <select
            value={articleFormat}
            onChange={(event) => {
              const v = event.target.value
              setArticleFormat(v === 'column' || v === 'analysis' ? v : 'standard')
            }}
            className={fieldInputCls}
          >
            <option value="standard">Haber</option>
            <option value="column">Köşe yazısı (AI Köşe Yazarı)</option>
            <option value="analysis">Analiz</option>
          </select>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void runProfessionalAi(false, { requireEditor: true })}
        disabled={aiPreparing || mediaUploading || (!isAutoEditor && !aiEditorId)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 px-4 py-3 text-sm font-black text-white shadow-md transition hover:from-amber-400 hover:to-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {aiPreparing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {aiPrepareButtonLabel}
      </button>
      <p className="mt-2 text-[11px] leading-relaxed text-[rgb(var(--color-muted))]">
        Varsayılan: otomatik masa yönlendirme (Spor→Deniz, Yerel→Burak, Ekonomi→Kerem…). AI
        editörler şeffaf biçimde AI olarak etiketlenir; insan onayı nihai karardır.{' '}
        <a href="/admin/ai-editors" className="font-semibold underline hover:text-[rgb(var(--color-text))]">
          AI Newsroom yönet
        </a>
      </p>
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
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void runProfessionalAi(false)}
          disabled={aiPreparing || mediaUploading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {aiPreparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          {selectedAiEditor
            ? `${selectedAiEditor.name} ile hazırla`
            : isAutoEditor
              ? 'Uzman AI ile hazırla'
              : 'AI ile profesyonel hazırla'}
        </button>
        <button
          type="button"
          onClick={() => void runProfessionalAi(true)}
          disabled={aiPreparing || mediaUploading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {aiPreparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          AI hazırla ve yayınla
        </button>
      </div>
      <p className="mt-1 text-[10px] text-[rgb(var(--color-muted))]">
        {selectedAiEditor
          ? `${selectedAiEditor.name} karakter/tarz promptları + manşet/SEO/H2 gövde. Talimatlar AI Editörler panelinden yönetilir.`
          : 'Genel AI hazırlık. Editör seçerseniz o yazarın talimat ve tarzıyla yazar.'}
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

    {showAiPreview && bodyBlocks.length > 0 && (
      <section className="rounded-2xl border border-violet-500/30 bg-[rgb(var(--color-card))] p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-[rgb(var(--color-text))]">
              <Eye className="h-4 w-4 text-violet-500" />
              AI yayın önizlemesi
            </p>
            {aiQualityScore !== null && (
              <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
                Kalite puanı: %{aiQualityScore} ·{' '}
                {aiGateDecision === 'publish' ? 'yayıma hazır' : 'editör incelemesi gerekli'}
                {' · '}Canlı kaynak: {aiResearchSources.length}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowAiPreview(false)}
            className="rounded-lg p-1.5 text-[rgb(var(--color-muted))] hover:bg-black/5"
            aria-label="Önizlemeyi kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <article className="mx-auto max-h-[720px] max-w-3xl overflow-y-auto rounded-xl bg-[rgb(var(--color-surface))] p-5">
          <h1 className="mb-3 text-2xl font-black leading-tight text-[rgb(var(--color-text))]">
            {title}
          </h1>
          {thumbnail && (
            <figure className="mb-4 overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnail}
                alt={imageCaption || title || 'Kapak görseli'}
                className="aspect-[16/9] w-full object-cover"
              />
              {imageCaption && (
                <figcaption className="mt-2 text-xs text-[rgb(var(--color-muted))]">
                  {imageCaption}
                </figcaption>
              )}
            </figure>
          )}
          {spot && (
            <p className="mb-5 border-l-4 border-violet-500/60 bg-black/[0.03] px-4 py-3 text-base font-medium leading-relaxed text-[rgb(var(--color-text))]">
              {spot}
            </p>
          )}
          <ArticleBlocksRenderer
            blocks={aiPreviewBlocks}
            title={title}
            longform={articleLayout === 'longform'}
          />
        </article>
      </section>
    )}

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
          value={mainCategoryValue}
          onChange={(e) => {
            const next = e.target.value
            if (next === YEREL_HABER_CATEGORY_ID) {
              if (!isYerelCategoryTree(categoryId)) {
                setCategoryId(YEREL_HABER_CATEGORY_ID)
              }
            } else {
              setCategoryId(next)
            }
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

    {isYerelCategoryTree(categoryId) && (
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">
          Alt kategori
          <span className="ml-1 font-normal">(Yerel Haber)</span>
        </label>
        <select
          value={yerelCategoryParts.subcategoryId ?? ''}
          onChange={(e) => setCategoryId(composeYerelCategoryId(e.target.value || null))}
          className={fieldInputCls}
        >
          <option value="">— Genel yerel —</option>
          {yerelSubcategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>
    )}

    <div className="space-y-2">
      {isWorldCategory ? (
        /* Dünya kategorisi: sadece ülke seçici */
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
        /* Diğer kategoriler: şehir (Türkiye içi) + ülke (yurt dışı) — birbirini dışlar */
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
              if (e.target.value) setCountrySlug('')
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
          <div className="border-t border-[rgb(var(--color-border))] pt-2">
            <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">
              Ülke
              <span className="ml-1 font-normal text-[rgb(var(--color-muted))]">(isteğe bağlı · yurt dışı haber ise şehri boş bırakıp seçin)</span>
            </label>
            <select
              value={countrySlug}
              onChange={(e) => {
                setCountrySlug(e.target.value)
                if (e.target.value) {
                  setCitySlug('')
                  setDistrictSlug('')
                }
              }}
              className={`${fieldInputCls} focus:ring-emerald-500`}
            >
              <option value="">— Ülke seçin (isteğe bağlı) —</option>
              {WORLD_COUNTRIES.map((country) => (
                <option key={country.slug} value={country.slug}>
                  {country.name}
                </option>
              ))}
            </select>
          </div>
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

    <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3">
      <div className="flex items-center gap-2">
        <Star className={`h-4 w-4 ${featured ? 'text-amber-500' : 'text-[rgb(var(--color-muted))]'}`} />
        <div>
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Öne Çıkan</p>
          <p className="text-[11px] text-[rgb(var(--color-muted))]">
            Ana sayfa öne çıkan slider&apos;ında görünür. Açınca haber otomatik Yayında olur.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setFeatured((v) => {
            const next = !v
            if (next && status !== 'published') {
              setStatus('published')
              toast.success('Öne çıkan için durum Yayında olarak ayarlandı')
            }
            return next
          })
        }}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          featured ? 'bg-amber-500' : 'bg-[rgb(var(--color-border))]'
        }`}
        aria-pressed={featured}
        aria-label="Öne çıkan"
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            featured ? 'translate-x-6' : 'translate-x-1'
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
            onClick={() => void generateAiKeywords()}
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
    <div
      className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-3 md:px-5"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        onClick={handleCancel}
        className="min-h-11 rounded-xl border border-[rgb(var(--color-border))] px-4 py-2.5 text-sm font-semibold text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]"
      >
        İptal
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-brand))] px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 md:flex-none md:bg-blue-600 md:hover:bg-blue-700"
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
    <div className="mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-none border-0 bg-[rgb(var(--color-card))] shadow-none md:rounded-2xl md:border md:border-[rgb(var(--color-border))] md:shadow-sm">
      <div
        className="sticky top-0 z-10 flex items-center justify-between border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/95 px-3 py-3 backdrop-blur md:px-5 md:py-4"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-[rgb(var(--color-muted))] md:hidden"
            aria-label="Geri"
          >
            <X className="h-5 w-5" />
          </button>
          {mode === 'create' ? <Plus className="hidden h-4 w-4 text-blue-500 md:block" /> : <Pencil className="hidden h-4 w-4 text-blue-500 md:block" />}
          <span className="truncate text-sm font-bold text-[rgb(var(--color-text))]">{headerTitle}</span>
        </div>
      </div>
      {formFields}
      {footer}
    </div>
  )
}

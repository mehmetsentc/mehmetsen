'use client'

import { useEffect, useState, useCallback, useMemo, useDeferredValue, useRef, type ReactNode } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { db } from '@/lib/firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import {
  collection, query, where, orderBy, limit,
  getDocs, startAfter, type QueryConstraint, type QueryDocumentSnapshot,
} from 'firebase/firestore'
import {
  Share2, CheckCircle2, XCircle, RefreshCw, Loader2,
  Facebook, Instagram, ExternalLink, Play, Tag, Image as ImageIcon,
  Newspaper, BookImage, Search, KeyRound, Stethoscope, X, Copy,
  EyeOff, Layers, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants/routes'
import { DEFAULT_CATEGORIES, YEREL_HABER_CATEGORY_ID } from '@/constants/config'
import { TURKISH_PROVINCES } from '@/constants/cities'
import {
  FALLBACK_CATEGORY_RULE,
  composerModeFromRule,
  normalizeCategoryRule,
  type SocialCategoryMode,
  type SocialCategoryRule,
  type SocialCategoryRulesDoc,
} from '@/lib/social/categoryRules'
import {
  DEFAULT_AUTO_SHARE_SETTINGS,
  type SocialAutoShareSettings,
} from '@/lib/social/autoShareSettings'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'

// ── Types ──────────────────────────────────────────────────────────────────────
type TabKey = 'post' | 'story'
type ShareMode = 'post' | 'story' | 'both'
type StatusFilter = 'all' | 'published' | 'pending'
type ComposerShareMode = ShareMode

interface SocialNewsRow {
  id: string
  title: string
  category?: string
  categoryId?: string
  citySlug?: string
  city?: string
  status?: string
  thumbnail?: string
  coverImageUrl?: string
  imageUrl?: string
  url?: string
  slug?: string
  sourceUrl?: string
  spot?: string
  summary?: string
  description?: string
  createdAt?: number | { toDate(): Date }
  publishedAt?: number | { toDate(): Date }
  socialPublished?: boolean
  socialPublishedAt?: number | { toDate(): Date }
  storyPublished?: boolean
  storyPublishedAt?: number | { toDate(): Date }
  socialImageUrl?: string
  socialHeadline?: string
  socialCaption?: string
  socialStorySummary?: string
  socialHashtags?: string[]
  facebookPostId?: string
  instagramMediaId?: string
  twitterTweetId?: string
  threadsPostId?: string
  facebookStoryId?: string
  instagramStoryId?: string
  featured?: boolean
  isFeatured?: boolean
  hasVideo?: boolean
  isVideo?: boolean
}

interface PlatformToggles {
  facebook: boolean
  instagram: boolean
  twitter: boolean
  threads: boolean
}

interface LastShareResult {
  ok: boolean
  message: string
  post?: {
    facebook: { success: boolean; error?: string }
    instagram: { success: boolean; error?: string }
    twitter?: { success: boolean; error?: string }
    threads?: { success: boolean; error?: string }
  }
  story?: {
    facebook: { success: boolean; error?: string }
    instagram: { success: boolean; error?: string }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50

const MAIN_CATEGORIES = DEFAULT_CATEGORIES.filter((c) => !c.parentId).slice(0, 16)

function safeToDate(val: unknown): Date | null {
  if (val == null) return null
  if (typeof val === 'number') return new Date(val)
  if (typeof val === 'object' && val !== null && 'toDate' in val) {
    return (val as { toDate(): Date }).toDate()
  }
  if (typeof val === 'string') {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function getBestImage(row: SocialNewsRow): string | undefined {
  return row.socialImageUrl || row.thumbnail || row.coverImageUrl || row.imageUrl
}

function hasImage(row: SocialNewsRow): boolean {
  return !!getBestImage(row)
}

function isLikelyExternalRss(row: SocialNewsRow): boolean {
  const src = (row.sourceUrl ?? '').trim().toLowerCase()
  if (!src || !src.startsWith('http')) return false
  return !src.includes('nahaber.com') && !src.includes('onyeditivi.com')
}

function isShared(row: SocialNewsRow, tab: TabKey): boolean {
  return tab === 'post' ? !!row.socialPublished : !!row.storyPublished
}

function articleUrlOf(row: SocialNewsRow): string | null {
  if (row.url) return row.url
  if (row.slug) return ROUTES.NEWS_DETAIL(row.slug)
  return null
}

function parseHashtagInput(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold',
        ok
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      )}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  )
}

function PlatformToggle({
  active,
  onChange,
  label,
  disabled,
  children,
}: {
  active: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!active)}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-40',
        active
          ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
          : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
      )}
    >
      {children}
      {label}
    </button>
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
      {children}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2.5 text-[15px] leading-relaxed text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-blue-500'

const btnSecondary =
  'inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm font-semibold text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] disabled:opacity-50'


// ── Page ───────────────────────────────────────────────────────────────────────
export default function SocialPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<TabKey>('post')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [hideRss, setHideRss] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [rows, setRows] = useState<SocialNewsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  // Cursor ref so load-more always sees the latest snapshot (avoids stale closure in useCallback)
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null)

  // Composer
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [shareMode, setShareMode] = useState<ShareMode>('post')
  const [headline, setHeadline] = useState('')
  const [caption, setCaption] = useState('')
  const [storySummary, setStorySummary] = useState('')
  const [hashtagsRaw, setHashtagsRaw] = useState('')
  const [platforms, setPlatforms] = useState<PlatformToggles>({
    facebook: true,
    instagram: true,
    twitter: false,
    threads: true,
  })
  const [forceReshare, setForceReshare] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [lastResult, setLastResult] = useState<LastShareResult | null>(null)
  const [previewTick, setPreviewTick] = useState(0)

  // Tools
  const [triggeringCron, setTriggeringCron] = useState(false)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagResult, setDiagResult] = useState<{ summary: string; steps: Array<{ name: string; ok: boolean; detail: string }> } | null>(null)
  const [showTokenPanel, setShowTokenPanel] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [showCategoryRules, setShowCategoryRules] = useState(false)
  const [categoryRules, setCategoryRules] = useState<SocialCategoryRulesDoc>({
    categories: {},
    default: { ...FALLBACK_CATEGORY_RULE },
  })
  const [categoryRulesDraft, setCategoryRulesDraft] = useState<Record<string, SocialCategoryRule>>({})
  const [defaultRuleDraft, setDefaultRuleDraft] = useState<SocialCategoryRule>({ ...FALLBACK_CATEGORY_RULE })
  const [loadingCategoryRules, setLoadingCategoryRules] = useState(false)
  const [savingCategoryRules, setSavingCategoryRules] = useState(false)
  const [autoShareDraft, setAutoShareDraft] = useState<SocialAutoShareSettings>({
    ...DEFAULT_AUTO_SHARE_SETTINGS,
  })
  const [loadingAutoShare, setLoadingAutoShare] = useState(false)
  const [savingAutoShare, setSavingAutoShare] = useState(false)
  const [newFbToken, setNewFbToken] = useState('')
  const [newIgToken, setNewIgToken] = useState('')
  const [savingToken, setSavingToken] = useState(false)
  const [tokenResult, setTokenResult] = useState<{ ok: boolean; message: string; permissions?: string[]; note?: string } | null>(null)

  const deferredHeadline = useDeferredValue(headline)
  const deferredSpot = useDeferredValue(
    shareMode === 'post' ? (storySummary || caption.slice(0, 320)) : storySummary
  )

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId]
  )

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchRows = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true)
      else setLoadingMore(true)

      try {
        const col = collection(db, 'news')
        // Read cursor from ref — lastDoc state is intentionally omitted from deps
        // to avoid refetch loops; without the ref, load-more kept reusing null.
        const cursor = reset ? null : lastDocRef.current
        const cursorParts: QueryConstraint[] = cursor ? [startAfter(cursor)] : []

        // Kategori / il — mümkünse Firestore'a; index yoksa client filtreler.
        const listFilters: QueryConstraint[] = []
        if (categoryFilter) listFilters.push(where('categoryId', '==', categoryFilter))
        if (cityFilter) listFilters.push(where('citySlug', '==', cityFilter))

        const tryQueries = async (
          attempts: QueryConstraint[][],
          label: string,
        ) => {
          let lastErr: unknown = null
          for (const constraints of attempts) {
            try {
              return await getDocs(query(col, ...constraints))
            } catch (err) {
              lastErr = err
              console.warn(`[social admin] ${label} attempt failed:`, err)
            }
          }
          throw lastErr instanceof Error ? lastErr : new Error(`${label} failed`)
        }

        const runPublishedList = () =>
          tryQueries(
            [
              [
                where('status', '==', 'published'),
                ...listFilters,
                orderBy('publishedAt', 'desc'),
                limit(PAGE_SIZE),
                ...cursorParts,
              ],
              // status+categoryId+citySlug composite yoksa il'i düş
              ...(categoryFilter && cityFilter
                ? [[
                    where('status', '==', 'published'),
                    where('categoryId', '==', categoryFilter),
                    orderBy('publishedAt', 'desc'),
                    limit(PAGE_SIZE),
                    ...cursorParts,
                  ] as QueryConstraint[]]
                : []),
              [
                where('status', '==', 'published'),
                orderBy('publishedAt', 'desc'),
                limit(PAGE_SIZE),
                ...cursorParts,
              ],
            ],
            'published-list',
          )

        const runSharedList = (kind: 'post' | 'story') => {
          const flag = kind === 'post' ? 'socialPublished' : 'storyPublished'
          const atField = kind === 'post' ? 'socialPublishedAt' : 'storyPublishedAt'
          const attempts: QueryConstraint[][] = [
            [
              where(flag, '==', true),
              ...listFilters,
              orderBy(atField, 'desc'),
              limit(PAGE_SIZE),
              ...cursorParts,
            ],
            [
              where(flag, '==', true),
              orderBy(atField, 'desc'),
              limit(PAGE_SIZE),
              ...cursorParts,
            ],
          ]
          // Tek alan eşitliği composite index istemez; startAfter ise orderBy ister
          if (!cursor) {
            attempts.push([
              where(flag, '==', true),
              limit(PAGE_SIZE),
            ])
          }
          attempts.push(
            [
              where('status', '==', 'published'),
              ...listFilters,
              orderBy('publishedAt', 'desc'),
              limit(PAGE_SIZE * 3),
              ...cursorParts,
            ],
            [
              where('status', '==', 'published'),
              orderBy('publishedAt', 'desc'),
              limit(PAGE_SIZE * 3),
              ...cursorParts,
            ],
          )
          return tryQueries(attempts, `shared-${kind}`)
        }

        const runQuery = async () => {
          if (tab === 'post' && statusFilter === 'published') {
            return runSharedList('post')
          }
          if (tab === 'story' && statusFilter === 'published') {
            return runSharedList('story')
          }
          if (tab === 'post' && statusFilter === 'pending') {
            // Paylaşılmadı kuyruğu: Çanakkale odaklı (cron ile aynı)
            return tryQueries(
              [
                [
                  where('citySlug', '==', 'canakkale'),
                  where('status', '==', 'published'),
                  orderBy('publishedAt', 'desc'),
                  limit(PAGE_SIZE),
                  ...cursorParts,
                ],
                [
                  where('status', '==', 'published'),
                  orderBy('publishedAt', 'desc'),
                  limit(PAGE_SIZE),
                  ...cursorParts,
                ],
              ],
              'pending-post',
            )
          }
          if (tab === 'story' && statusFilter === 'pending') {
            return tryQueries(
              [
                [
                  where('status', '==', 'published'),
                  where('categoryId', '==', 'gundem'),
                  orderBy('publishedAt', 'desc'),
                  limit(PAGE_SIZE),
                  ...cursorParts,
                ],
                [
                  where('status', '==', 'published'),
                  orderBy('publishedAt', 'desc'),
                  limit(PAGE_SIZE),
                  ...cursorParts,
                ],
              ],
              'pending-story',
            )
          }
          return runPublishedList()
        }

        const snap = await runQuery()

        let newRows: SocialNewsRow[] = snap.docs.map((docSnap) => {
          const d = docSnap.data() as Omit<SocialNewsRow, 'id'>
          return { id: docSnap.id, ...d }
        })

        if (statusFilter === 'pending') {
          newRows = newRows.filter((r) => !isShared(r, tab) && !r.hasVideo && !r.isVideo)
        }
        if (statusFilter === 'published') {
          // Fallback sorgular status=published döndürebilir → mutlaka paylaşılmış olanları tut
          newRows = newRows.filter((r) => isShared(r, tab))
        }

        if (reset) {
          setRows(newRows)
        } else {
          setRows((prev) => {
            const seen = new Set(prev.map((r) => r.id))
            const unique = newRows.filter((r) => !seen.has(r.id))
            return unique.length ? [...prev, ...unique] : prev
          })
        }

        const nextCursor = snap.docs[snap.docs.length - 1] ?? null
        lastDocRef.current = nextCursor
        setHasMore(snap.docs.length >= PAGE_SIZE)
      } catch (err) {
        console.error('[social admin] fetch error:', err)
        if (reset) {
          setRows([])
          setHasMore(false)
          lastDocRef.current = null
        }
        toast.error('Veriler yüklenemedi')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [tab, statusFilter, categoryFilter, cityFilter]
  )

  useEffect(() => {
    lastDocRef.current = null
    setRows([])
    void fetchRows(true)
  }, [tab, statusFilter, categoryFilter, cityFilter, fetchRows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (hideRss && isLikelyExternalRss(r)) return false
      if (categoryFilter && r.categoryId !== categoryFilter && r.category !== categoryFilter) return false
      if (cityFilter && (r.citySlug || '').toLowerCase() !== cityFilter.toLowerCase()) return false
      if (!q) return true
      return (
        r.title?.toLowerCase().includes(q) ||
        r.slug?.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.citySlug?.toLowerCase().includes(q) ||
        r.categoryId?.toLowerCase().includes(q)
      )
    })
  }, [rows, search, hideRss, categoryFilter, cityFilter])

  // ── Open composer ──────────────────────────────────────────────────────────
  const openComposer = (row: SocialNewsRow) => {
    setSelectedId(row.id)
    const catId = (row.categoryId || row.category || '').trim().toLowerCase()
    const rule = catId && categoryRules.categories[catId]
      ? categoryRules.categories[catId]
      : categoryRules.default
    const mode = composerModeFromRule(rule, tab) as ComposerShareMode
    setShareMode(mode)
    setHeadline(row.socialHeadline || row.title || '')
    const spot = row.spot || row.summary || row.description || ''
    setCaption(row.socialCaption || (spot ? `📰 ${spot}` : `📰 ${row.title || ''}`))
    setStorySummary(row.socialStorySummary || spot || '')
    setHashtagsRaw(
      (row.socialHashtags?.length
        ? row.socialHashtags
        : ['#NaHaber', '#Çanakkale', '#SonDakika', '#Haber', '#Türkiye']
      ).join(' ')
    )
    const plat = rule.platforms
    setPlatforms({
      facebook: plat?.facebook !== false,
      instagram: plat?.instagram !== false,
      twitter: plat?.twitter === true,
      threads: plat?.threads !== false,
    })
    const already = isShared(row, tab)
    setForceReshare(already)
    setLastResult(null)
    setPreviewTick((n) => n + 1)
  }

  const closeComposer = () => {
    setSelectedId(null)
    setLastResult(null)
  }

  // Sekme değişince: seçili haberin kategori varsayılanını yeniden uygula
  useEffect(() => {
    if (!selectedId) return
    const row = rows.find((r) => r.id === selectedId)
    if (!row) {
      setShareMode(tab)
      return
    }
    const catId = (row.categoryId || row.category || '').trim().toLowerCase()
    const rule = catId && categoryRules.categories[catId]
      ? categoryRules.categories[catId]
      : categoryRules.default
    setShareMode(composerModeFromRule(rule, tab))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca sekme değişiminde
  }, [tab, selectedId])

  const loadCategoryRules = useCallback(async () => {
    if (!user) return
    setLoadingCategoryRules(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/social/category-rules', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Yüklenemedi')
      const data = await res.json() as {
        categories?: Record<string, SocialCategoryRule>
        default?: SocialCategoryRule
      }
      const doc: SocialCategoryRulesDoc = {
        categories: data.categories ?? {},
        default: normalizeCategoryRule(data.default, FALLBACK_CATEGORY_RULE),
      }
      setCategoryRules(doc)
      const draft: Record<string, SocialCategoryRule> = {}
      for (const c of MAIN_CATEGORIES) {
        draft[c.id] = normalizeCategoryRule(doc.categories[c.id], doc.default)
      }
      for (const [id, rule] of Object.entries(doc.categories)) {
        if (!draft[id]) draft[id] = normalizeCategoryRule(rule, doc.default)
      }
      setCategoryRulesDraft(draft)
      setDefaultRuleDraft(doc.default)
    } catch (err) {
      console.error('[social admin] category rules:', err)
      toast.error('Kategori kuralları yüklenemedi')
    } finally {
      setLoadingCategoryRules(false)
    }
  }, [user])

  useEffect(() => {
    void loadCategoryRules()
  }, [loadCategoryRules])

  const loadAutoShare = useCallback(async () => {
    if (!user) return
    setLoadingAutoShare(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/social/auto-share', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Yüklenemedi')
      const data = await res.json() as Partial<SocialAutoShareSettings>
      setAutoShareDraft({
        autoPost: data.autoPost !== false,
        autoStory: data.autoStory !== false,
        autoOnPublish: data.autoOnPublish !== false,
      })
    } catch (err) {
      console.error('[social admin] auto-share:', err)
      toast.error('Otomatik paylaşım ayarları yüklenemedi')
    } finally {
      setLoadingAutoShare(false)
    }
  }, [user])

  useEffect(() => {
    void loadAutoShare()
  }, [loadAutoShare])

  const saveAutoShare = async () => {
    if (!user || savingAutoShare) return
    setSavingAutoShare(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/social/auto-share', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          autoPost: autoShareDraft.autoPost,
          autoStory: autoShareDraft.autoStory,
          autoOnPublish: autoShareDraft.autoOnPublish,
        }),
      })
      const data = await res.json() as {
        ok?: boolean
        message?: string
        error?: string
        autoPost?: boolean
        autoStory?: boolean
        autoOnPublish?: boolean
      }
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Kayıt başarısız')
        return
      }
      setAutoShareDraft({
        autoPost: data.autoPost !== false,
        autoStory: data.autoStory !== false,
        autoOnPublish: data.autoOnPublish !== false,
      })
      toast.success(data.message ?? 'Otomatik paylaşım ayarları kaydedildi')
    } catch (err) {
      console.error(err)
      toast.error('Bağlantı hatası')
    } finally {
      setSavingAutoShare(false)
    }
  }

  const saveCategoryRules = async () => {
    if (!user || savingCategoryRules) return
    setSavingCategoryRules(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/social/category-rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          default: defaultRuleDraft,
          categories: categoryRulesDraft,
        }),
      })
      const data = await res.json() as {
        ok?: boolean
        message?: string
        error?: string
        categories?: Record<string, SocialCategoryRule>
        default?: SocialCategoryRule
      }
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Kayıt başarısız')
        return
      }
      setCategoryRules({
        categories: data.categories ?? categoryRulesDraft,
        default: data.default ?? defaultRuleDraft,
      })
      toast.success(data.message ?? 'Kategori kuralları kaydedildi')
    } catch (err) {
      console.error(err)
      toast.error('Bağlantı hatası')
    } finally {
      setSavingCategoryRules(false)
    }
  }

  const updateDraftRule = (catId: string, patch: Partial<SocialCategoryRule>) => {
    setCategoryRulesDraft((prev) => ({
      ...prev,
      [catId]: normalizeCategoryRule({ ...prev[catId], ...patch }, defaultRuleDraft),
    }))
  }

  // ── Share ──────────────────────────────────────────────────────────────────
  const shareSelected = async () => {
    if (!user || !selected || sharing) return

    if (!hasImage(selected)) {
      toast.error('Görsel yok — paylaşım için kapak görseli gerekli')
      return
    }
    if (!platforms.facebook && !platforms.instagram && !(shareMode !== 'story' && platforms.twitter) && !(shareMode !== 'story' && platforms.threads)) {
      toast.error('En az bir platform seçin')
      return
    }
    if (!headline.trim()) {
      toast.error('Manşet gerekli')
      return
    }

    const alreadyPost = !!selected.socialPublished
    const alreadyStory = !!selected.storyPublished
    const needsForce =
      (shareMode === 'post' && alreadyPost) ||
      (shareMode === 'story' && alreadyStory) ||
      (shareMode === 'both' && (alreadyPost || alreadyStory))

    if (needsForce && !forceReshare) {
      toast.error('Bu haber zaten paylaşılmış — «Yeniden paylaş»ı açın')
      return
    }

    setSharing(true)
    const toastId = toast.loading(
      shareMode === 'story' ? 'Hikâye paylaşılıyor…' :
      shareMode === 'both' ? 'Post + hikâye paylaşılıyor…' :
      'Feed post paylaşılıyor…'
    )

    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const body: Record<string, unknown> = {
        ids: [selected.id],
        mode: shareMode,
        force: needsForce || forceReshare,
        manual: true,
        headline: headline.trim(),
        hashtags: parseHashtagInput(hashtagsRaw),
        platforms: {
          facebook: platforms.facebook,
          instagram: platforms.instagram,
          twitter: shareMode !== 'story' && platforms.twitter,
          threads: shareMode !== 'story' && platforms.threads,
        },
      }
      if (shareMode === 'post' || shareMode === 'both') {
        body.caption = caption.trim()
      }
      if (shareMode === 'story' || shareMode === 'both') {
        body.storySummary = storySummary.trim() || caption.trim()
      } else if (shareMode === 'post') {
        // OG görsel özeti — composer önizlemesiyle aynı kaynak
        body.storySummary = storySummary.trim() || caption.trim().slice(0, 320)
      }
      if (shareMode === 'story' && !body.caption) {
        body.caption = storySummary.trim()
      }

      const res = await fetch('/api/admin/social/force-reshare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json() as {
        error?: string
        results?: Array<{
          ok: boolean
          reason?: string
          post?: LastShareResult['post']
          story?: LastShareResult['story']
        }>
      }

      const r0 = data.results?.[0]
      if (!res.ok) {
        const msg = data.error ?? r0?.reason ?? 'Paylaşım başarısız'
        toast.error(msg, { id: toastId })
        setLastResult({ ok: false, message: msg, post: r0?.post, story: r0?.story })
        return
      }

      const parts: string[] = []
      if (r0?.post) {
        parts.push(
          `Post FB:${r0.post.facebook.success ? '✓' : '✗'} IG:${r0.post.instagram.success ? '✓' : '✗'}` +
          (r0.post.threads ? ` Th:${r0.post.threads.success ? '✓' : '✗'}` : '') +
          (r0.post.twitter ? ` X:${r0.post.twitter.success ? '✓' : '✗'}` : '')
        )
      }
      if (r0?.story) {
        parts.push(`Hikâye FB:${r0.story.facebook.success ? '✓' : '✗'} IG:${r0.story.instagram.success ? '✓' : '✗'}`)
      }
      const msg = parts.join(' · ') || 'Paylaşıldı'
      toast.success(msg, { id: toastId })
      setLastResult({ ok: true, message: msg, post: r0?.post, story: r0?.story })

      setRows((prev) => prev.map((r) => {
        if (r.id !== selected.id) return r
        const next = { ...r, socialHeadline: headline.trim(), socialCaption: caption.trim(), socialStorySummary: storySummary.trim(), socialHashtags: parseHashtagInput(hashtagsRaw) }
        if (shareMode === 'post' || shareMode === 'both') {
          next.socialPublished = true
          next.socialPublishedAt = Date.now()
        }
        if (shareMode === 'story' || shareMode === 'both') {
          next.storyPublished = true
          next.storyPublishedAt = Date.now()
        }
        return next
      }))
      setForceReshare(true)
      setPreviewTick((n) => n + 1)
    } catch (err) {
      console.error('[social admin] share error:', err)
      toast.error('Bağlantı hatası', { id: toastId })
      setLastResult({ ok: false, message: 'Bağlantı hatası' })
    } finally {
      setSharing(false)
    }
  }

  // ── Cron / Token / Diagnose ────────────────────────────────────────────────
  const triggerCron = async () => {
    if (!user || triggeringCron) return
    setTriggeringCron(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/cron/social', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json()) as {
        processed?: number
        succeeded?: number
        failed?: number
        error?: string
      }
      if (res.ok) {
        toast.success(
          `Cron çalıştı — ${data.processed ?? 0} haber işlendi, ${data.succeeded ?? 0} paylaşıldı`
        )
        lastDocRef.current = null
        await fetchRows(true)
      } else {
        toast.error(data.error ?? 'Cron hatası')
      }
    } catch (err) {
      console.error('[social admin] cron trigger error:', err)
      toast.error('Cron çalıştırılamadı')
    } finally {
      setTriggeringCron(false)
    }
  }

  const saveToken = async () => {
    if (!user || savingToken || !newFbToken.trim()) return
    setSavingToken(true)
    setTokenResult(null)
    try {
      const idToken = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/social/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ facebookPageToken: newFbToken.trim(), instagramToken: newIgToken.trim() || undefined }),
      })
      const data = await res.json() as { ok?: boolean; message?: string; permissions?: string[]; note?: string; error?: string }
      if (res.ok && data.ok) {
        setTokenResult({ ok: true, message: data.message ?? 'Token kaydedildi', permissions: data.permissions, note: data.note })
        setNewFbToken('')
        setNewIgToken('')
        toast.success('Token başarıyla güncellendi!')
      } else {
        setTokenResult({ ok: false, message: data.error ?? 'Hata oluştu' })
        toast.error(data.error ?? 'Token kaydedilemedi')
      }
    } catch (err) {
      toast.error('Bağlantı hatası')
      console.error(err)
    } finally {
      setSavingToken(false)
    }
  }

  const runDiagnose = async () => {
    if (!user || diagnosing) return
    setDiagnosing(true)
    setDiagResult(null)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/social/diagnose', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json() as typeof diagResult
      setDiagResult(data)
    } catch (err) {
      toast.error('Teşhis başarısız')
      console.error(err)
    } finally {
      setDiagnosing(false)
    }
  }

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url.startsWith('http') ? url : `https://www.nahaber.com${url}`)
      toast.success('URL kopyalandı')
    } catch {
      toast.error('Kopyalanamadı')
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const publishedCount = filteredRows.filter((r) => isShared(r, tab)).length
  const pendingCount = filteredRows.filter((r) => !isShared(r, tab)).length

  const previewMode = shareMode === 'story' ? 'story' : 'social'
  const ogPreviewSrc = selected
    ? `/api/og/${previewMode}/${selected.id}?title=${encodeURIComponent(deferredHeadline)}&spot=${encodeURIComponent(deferredSpot)}&v=${previewTick}`
    : ''

  const composerBlocked = selected && !hasImage(selected)
    ? 'Görsel yok — paylaşım için kapak görseli gerekli'
    : null

  return (
    <div className="flex min-h-screen flex-col bg-[rgb(var(--color-bg))]">
      <CMSHeader
        title="Sosyal Medya"
        subtitle="Haber seç → manşet / özet düzenle → platformlara paylaş"
      />

      <div className="mx-auto w-full max-w-[1480px] space-y-5 p-5 lg:p-6">
        {/* Top: tabs + stats */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex gap-1 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-1 shadow-sm">
            {([
              { key: 'post' as const, label: 'Post', icon: Newspaper, hint: 'FB · IG · Th · X' },
              { key: 'story' as const, label: 'Hikâye', icon: BookImage, hint: 'FB · IG Story' },
            ]).map(({ key, label, icon: Icon, hint }) => (
              <button
                key={key}
                type="button"
                onClick={() => { setTab(key); setStatusFilter('all'); setSearch('') }}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all',
                  tab === key
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))]'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                <span className={cn('hidden text-xs font-medium sm:inline', tab === key ? 'text-white/80' : '')}>
                  {hint}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-1.5 text-[rgb(var(--color-muted))]">
              Listelenen <strong className="text-[rgb(var(--color-text))]">{filteredRows.length}</strong>
            </span>
            <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              Paylaşıldı <strong>{publishedCount}</strong>
            </span>
            <span className="rounded-lg bg-amber-100 px-3 py-1.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              Paylaşılmadı <strong>{pendingCount}</strong>
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: 'all' as const, label: 'Tümü' },
              { key: 'pending' as const, label: 'Paylaşılmadı' },
              { key: 'published' as const, label: 'Paylaşıldı' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all',
                  statusFilter === key
                    ? 'bg-[rgb(var(--color-text))] text-[rgb(var(--color-surface))] shadow-sm'
                    : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
                )}
              >
                {label}
              </button>
            ))}

            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Başlık / slug ara…"
                className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] py-2 pl-9 pr-3 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => {
                const next = e.target.value
                setCategoryFilter(next)
                if (next !== YEREL_HABER_CATEGORY_ID) setCityFilter('')
              }}
              className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tüm kategoriler</option>
              {MAIN_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {categoryFilter === YEREL_HABER_CATEGORY_ID && (
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="İl filtresi"
              >
                <option value="">Tüm iller</option>
                {TURKISH_PROVINCES.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setHideRss((p) => !p)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold',
                hideRss
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
              )}
              title="Harici RSS haberlerini gizle (manuel paylaşım yine mümkün)"
            >
              <EyeOff className="h-3.5 w-3.5" />
              RSS gizle
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                lastDocRef.current = null
                void fetchRows(true)
              }}
              disabled={loading}
              className={btnSecondary}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Yenile
            </button>
            <button
              type="button"
              onClick={() => setShowTools((p) => !p)}
              className={btnSecondary}
            >
              Araçlar
            </button>
          </div>
        </div>

        {showTools && (
          <div className="flex flex-wrap gap-2 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
            <button
              type="button"
              onClick={() => { setShowTokenPanel((p) => !p); setTokenResult(null) }}
              className={btnSecondary}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Token Güncelle
            </button>
            <button
              type="button"
              onClick={() => void runDiagnose()}
              disabled={diagnosing}
              className={btnSecondary}
            >
              {diagnosing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />}
              Teşhis
            </button>
            <button
              type="button"
              onClick={() => void triggerCron()}
              disabled={triggeringCron}
              className={btnSecondary}
            >
              {triggeringCron ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Cron Çalıştır
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCategoryRules((p) => !p)
                if (!showCategoryRules) void loadCategoryRules()
              }}
              className={btnSecondary}
            >
              <Layers className="h-3.5 w-3.5" />
              Kategori ayarları
            </button>
            <p className="w-full text-sm text-[rgb(var(--color-muted))]">
              Soldan haber seçin → sağdaki composer’da manşet, özet, platform ve modu ayarlayın → Paylaş.
              RSS haberleri manuel paylaşılabilir; otomatik cron harici kaynakları atlar.
            </p>
          </div>
        )}

        {/* Otomatik paylaşım ayarları — her zaman görünür */}
        <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <h3 className="text-base font-bold text-[rgb(var(--color-text))]">
                  Otomatik paylaşım ayarları
                </h3>
                {loadingAutoShare && <Loader2 className="h-3.5 w-3.5 animate-spin text-[rgb(var(--color-muted))]" />}
              </div>
              <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
                Cron ve CMS yayınındaki anlık paylaşımı buradan açıp kapatın. Composer / Haberler
                butonlarından manuel paylaşım her zaman çalışır. Firestore{' '}
                <code className="rounded bg-[rgb(var(--color-surface))] px-1.5 py-0.5 text-xs">
                  config/socialAutoShare
                </code>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void loadAutoShare()}
                disabled={loadingAutoShare}
                className={btnSecondary}
              >
                {loadingAutoShare ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Yenile
              </button>
              <button
                type="button"
                onClick={() => void saveAutoShare()}
                disabled={savingAutoShare}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50"
              >
                {savingAutoShare ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Kaydet
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-[rgb(var(--color-border))] text-blue-600 focus:ring-blue-500"
                checked={autoShareDraft.autoPost}
                onChange={(e) => setAutoShareDraft((p) => ({ ...p, autoPost: e.target.checked }))}
              />
              <span>
                <span className="block text-sm font-bold text-[rgb(var(--color-text))]">Otomatik Post</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[rgb(var(--color-muted))]">
                  Cron feed post batch (Çanakkale haberleri, ~10/çalıştırma)
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-[rgb(var(--color-border))] text-blue-600 focus:ring-blue-500"
                checked={autoShareDraft.autoStory}
                onChange={(e) => setAutoShareDraft((p) => ({ ...p, autoStory: e.target.checked }))}
              />
              <span>
                <span className="block text-sm font-bold text-[rgb(var(--color-text))]">Otomatik Hikâye</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[rgb(var(--color-muted))]">
                  Cron hikâye batch (gündem / öne çıkan, son 10 saat, max 5)
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-[rgb(var(--color-border))] text-blue-600 focus:ring-blue-500"
                checked={autoShareDraft.autoOnPublish}
                onChange={(e) => setAutoShareDraft((p) => ({ ...p, autoOnPublish: e.target.checked }))}
              />
              <span>
                <span className="block text-sm font-bold text-[rgb(var(--color-text))]">Yayınlanınca anlık</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[rgb(var(--color-muted))]">
                  CMS yayın / öne çıkan olunca hemen paylaş (yine Post/Hikâye bayraklarına uyar)
                </span>
              </span>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]/60 px-4 py-3 text-xs text-[rgb(var(--color-muted))]">
            <p>
              Kategori bazlı veto / opt-in için{' '}
              <button
                type="button"
                className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                onClick={() => {
                  setShowTools(true)
                  setShowCategoryRules(true)
                  void loadCategoryRules()
                }}
              >
                Kategori ayarları
              </button>
              {' '}(config/socialCategoryRules).
            </p>
            <p className="font-medium text-[rgb(var(--color-text))]">
              Durum:{' '}
              {autoShareDraft.autoPost ? 'Post açık' : 'Post kapalı'}
              {' · '}
              {autoShareDraft.autoStory ? 'Hikâye açık' : 'Hikâye kapalı'}
              {' · '}
              {autoShareDraft.autoOnPublish ? 'Anlık açık' : 'Anlık kapalı'}
            </p>
          </div>
        </div>

        {showCategoryRules && (
          <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[rgb(var(--color-text))]">Kategori sosyal ayarları</h3>
                <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
                  Varsayılan paylaşım modu + otomatik cron bayrakları · Firestore{' '}
                  <code className="rounded bg-[rgb(var(--color-surface))] px-1.5 py-0.5 text-xs">config/socialCategoryRules</code>
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void loadCategoryRules()} disabled={loadingCategoryRules} className={btnSecondary}>
                  {loadingCategoryRules ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Yenile
                </button>
                <button
                  type="button"
                  onClick={() => void saveCategoryRules()}
                  disabled={savingCategoryRules}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50"
                >
                  {savingCategoryRules ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Kaydet
                </button>
                <button type="button" onClick={() => setShowCategoryRules(false)} className="px-2 text-sm text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
                  Kapat
                </button>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3 text-sm">
              <span className="font-semibold text-[rgb(var(--color-text))]">Varsayılan</span>
              <select
                value={defaultRuleDraft.defaultMode}
                onChange={(e) =>
                  setDefaultRuleDraft((p) => ({
                    ...p,
                    defaultMode: e.target.value as SocialCategoryMode,
                  }))
                }
                className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-2.5 py-1.5 text-sm text-[rgb(var(--color-text))]"
              >
                <option value="post">Post</option>
                <option value="story">Hikâye</option>
                <option value="both">İkisi</option>
                <option value="none">Yok</option>
              </select>
              <label className="inline-flex items-center gap-2 text-[rgb(var(--color-text))]">
                <input
                  type="checkbox"
                  checked={defaultRuleDraft.autoPost !== false}
                  onChange={(e) => setDefaultRuleDraft((p) => ({ ...p, autoPost: e.target.checked }))}
                />
                Auto post
              </label>
              <label className="inline-flex items-center gap-2 text-[rgb(var(--color-text))]">
                <input
                  type="checkbox"
                  checked={defaultRuleDraft.autoStory === true}
                  onChange={(e) => setDefaultRuleDraft((p) => ({ ...p, autoStory: e.target.checked }))}
                />
                Auto hikâye
              </label>
            </div>

            <div className="max-h-72 overflow-auto rounded-xl border border-[rgb(var(--color-border))]">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[rgb(var(--color-surface))] text-xs uppercase tracking-wide text-[rgb(var(--color-muted))]">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Kategori</th>
                    <th className="px-4 py-2.5 font-semibold">Varsayılan mod</th>
                    <th className="px-4 py-2.5 font-semibold">Auto post</th>
                    <th className="px-4 py-2.5 font-semibold">Auto hikâye</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--color-border))]">
                  {MAIN_CATEGORIES.map((c) => {
                    const rule = categoryRulesDraft[c.id] ?? defaultRuleDraft
                    return (
                      <tr key={c.id} className="hover:bg-[rgb(var(--color-surface))]">
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-[rgb(var(--color-text))]">{c.name}</span>
                          <span className="ml-2 text-xs text-[rgb(var(--color-muted))]">{c.id}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={rule.defaultMode}
                            onChange={(e) =>
                              updateDraftRule(c.id, {
                                defaultMode: e.target.value as SocialCategoryMode,
                              })
                            }
                            className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-2.5 py-1.5 text-sm text-[rgb(var(--color-text))]"
                          >
                            <option value="post">Post</option>
                            <option value="story">Hikâye</option>
                            <option value="both">İkisi</option>
                            <option value="none">Yok</option>
                          </select>
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={rule.autoPost !== false}
                            onChange={(e) => updateDraftRule(c.id, { autoPost: e.target.checked })}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={rule.autoStory === true}
                            onChange={(e) => updateDraftRule(c.id, { autoStory: e.target.checked })}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showTokenPanel && (
          <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5 shadow-sm">
            <h3 className="mb-1 text-base font-bold text-[rgb(var(--color-text))]">Facebook / Instagram Token</h3>
            <p className="mb-4 text-sm text-[rgb(var(--color-muted))]">
              Graph API Explorer&apos;dan Page Token alın; eksik izinlerde paylaşım başarısız olur.
            </p>
            <div className="space-y-3">
              <textarea
                value={newFbToken}
                onChange={(e) => setNewFbToken(e.target.value)}
                rows={2}
                placeholder="Facebook Page Access Token *"
                className={cn(inputClass, 'font-mono text-sm')}
              />
              <textarea
                value={newIgToken}
                onChange={(e) => setNewIgToken(e.target.value)}
                rows={2}
                placeholder="Instagram Access Token (opsiyonel)"
                className={cn(inputClass, 'font-mono text-sm')}
              />
              {tokenResult && (
                <p className={cn('text-sm', tokenResult.ok ? 'text-emerald-600' : 'text-red-600')}>
                  {tokenResult.message}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void saveToken()}
                  disabled={savingToken || !newFbToken.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {savingToken ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}
                  Doğrula & Kaydet
                </button>
                <button type="button" onClick={() => setShowTokenPanel(false)} className="text-sm text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
                  Kapat
                </button>
              </div>
            </div>
          </div>
        )}

        {diagResult && (
          <div className={cn(
            'rounded-2xl border p-4 text-sm',
            diagResult.steps.some((s) => !s.ok)
              ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
              : 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
          )}>
            <p className="mb-2 font-bold text-[rgb(var(--color-text))]">{diagResult.summary}</p>
            {diagResult.steps.map((step, i) => (
              <div key={i} className="flex flex-wrap gap-2 text-sm">
                <span className={step.ok ? 'text-emerald-600' : 'text-red-600'}>{step.ok ? '✓' : '✗'}</span>
                <span className="font-semibold text-[rgb(var(--color-text))]">{step.name}:</span>
                <span className="text-[rgb(var(--color-muted))]">{step.detail}</span>
              </div>
            ))}
            <button type="button" onClick={() => setDiagResult(null)} className="mt-3 text-sm text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
              Kapat
            </button>
          </div>
        )}

        {/* Main split: list | composer */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_min(100%,460px)] xl:grid-cols-[minmax(0,1fr)_500px]">
          {/* News list */}
          <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm">
            <div className="border-b border-[rgb(var(--color-border))] px-4 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                Haber listesi
              </h2>
            </div>
            <div className="divide-y divide-[rgb(var(--color-border))]">
              {loading && (
                <div className="flex justify-center py-20">
                  <Loader2 className="h-7 w-7 animate-spin text-[rgb(var(--color-muted))]" />
                </div>
              )}

              {!loading && filteredRows.length === 0 && (
                <div className="py-20 text-center text-[rgb(var(--color-muted))]">
                  <Share2 className="mx-auto mb-3 h-9 w-9 opacity-30" />
                  <p className="text-base font-medium">Haber bulunamadı</p>
                  <p className="mt-1 text-sm">Filtreleri değiştirmeyi deneyin</p>
                </div>
              )}

              {!loading && filteredRows.map((row) => {
                const img = getBestImage(row)
                const shared = isShared(row, tab)
                const external = isLikelyExternalRss(row)
                const noImg = !hasImage(row)
                const active = selectedId === row.id
                const fbOk = tab === 'post' ? !!row.facebookPostId : !!row.facebookStoryId
                const igOk = tab === 'post' ? !!row.instagramMediaId : !!row.instagramStoryId

                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => openComposer(row)}
                    className={cn(
                      'flex w-full gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-[rgb(var(--color-surface))]',
                      // Theme-aware highlight: avoid fixed pastel (bg-blue-50) which
                      // washed out --color-text in dark/light mismatches.
                      active &&
                        'bg-red-50/90 ring-1 ring-inset ring-red-400 dark:bg-red-950/45 dark:ring-red-500/55'
                    )}
                  >
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt="" className="h-16 w-[88px] shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-16 w-[88px] shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--color-surface))]">
                        <ImageIcon className="h-5 w-5 opacity-30" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'line-clamp-2 text-[15px] font-semibold leading-snug',
                          active
                            ? 'text-slate-900 dark:text-red-50'
                            : 'text-[rgb(var(--color-text))]'
                        )}
                      >
                        {row.title}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {row.categoryId && (
                          <span
                            className={cn(
                              'rounded-md px-2 py-0.5 text-xs',
                              active
                                ? 'bg-white/80 text-slate-700 dark:bg-red-900/50 dark:text-red-100'
                                : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]'
                            )}
                          >
                            {row.categoryId}
                          </span>
                        )}
                        {row.citySlug && (
                          <span
                            className={cn(
                              'rounded-md px-2 py-0.5 text-xs',
                              active
                                ? 'bg-white/80 text-slate-700 dark:bg-red-900/50 dark:text-red-100'
                                : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]'
                            )}
                          >
                            {row.citySlug}
                          </span>
                        )}
                        {external && (
                          <span
                            className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                            title="Harici kaynak — manuel paylaşılabilir"
                          >
                            RSS
                          </span>
                        )}
                        {noImg && (
                          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            Görsel yok
                          </span>
                        )}
                        <StatusBadge ok={shared} label={shared ? 'Paylaşıldı' : 'Paylaşılmadı'} />
                        {fbOk && <Facebook className="h-3.5 w-3.5 text-emerald-600" />}
                        {igOk && <Instagram className="h-3.5 w-3.5 text-emerald-600" />}
                        {tab === 'post' && row.threadsPostId && (
                          <span className="text-xs font-bold text-emerald-600">Th</span>
                        )}
                        {tab === 'post' && row.twitterTweetId && (
                          <span className="text-xs font-bold text-emerald-600">X</span>
                        )}
                      </div>
                      <p
                        className={cn(
                          'mt-1 text-xs',
                          active
                            ? 'text-slate-600 dark:text-red-200/80'
                            : 'text-[rgb(var(--color-muted))]'
                        )}
                      >
                        {(() => {
                          const d = safeToDate(row.publishedAt ?? row.createdAt)
                          return d ? formatDistanceToNow(d, { addSuffix: true, locale: tr }) : '—'
                        })()}
                        {shared && (() => {
                          const d = safeToDate(tab === 'post' ? row.socialPublishedAt : row.storyPublishedAt)
                          return d ? ` · paylaşıldı ${formatDistanceToNow(d, { addSuffix: true, locale: tr })}` : ''
                        })()}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
            {hasMore && !loading && (
              <div className="border-t border-[rgb(var(--color-border))] p-4 text-center">
                <button
                  type="button"
                  onClick={() => void fetchRows(false)}
                  disabled={loadingMore}
                  className={btnSecondary}
                >
                  {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Daha fazla yükle
                </button>
              </div>
            )}
          </div>

          {/* Composer */}
          <div
            className={cn(
              'lg:sticky lg:top-4 lg:self-start',
              selected
                ? 'fixed inset-0 z-40 flex flex-col bg-[rgb(var(--color-bg))] lg:static lg:z-auto lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-[rgb(var(--color-border))] lg:bg-[rgb(var(--color-card))] lg:shadow-sm'
                : 'hidden lg:block lg:rounded-2xl lg:border lg:border-[rgb(var(--color-border))] lg:bg-[rgb(var(--color-card))] lg:shadow-sm'
            )}
          >
            {!selected ? (
              <div className="flex flex-col items-center justify-center px-8 py-24 text-center">
                <Layers className="mb-4 h-12 w-12 text-[rgb(var(--color-muted))]/40" />
                <p className="text-lg font-bold text-[rgb(var(--color-text))]">Paylaşım editörü</p>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-[rgb(var(--color-muted))]">
                  Soldan bir haber seçin. Manşet, özet, platform ve modu ayarlayıp paylaşın.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-[rgb(var(--color-border))] px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                      Paylaşım editörü
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-base font-bold leading-snug text-[rgb(var(--color-text))]">
                      {selected.title}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeComposer}
                    className="rounded-lg p-2 text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))]"
                    aria-label="Kapat"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto p-5">
                  {isLikelyExternalRss(selected) && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                      Harici RSS kaynağı — manuel paylaşım açık. Otomatik cron bu haberi paylaşmaz.
                    </div>
                  )}

                  {/* OG preview */}
                  <div className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
                    <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-3 py-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                        {previewMode === 'story' ? 'Hikâye önizleme' : 'Post önizleme'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreviewTick((n) => n + 1)}
                        className="text-xs font-semibold text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
                      >
                        Yenile
                      </button>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={ogPreviewSrc}
                      src={ogPreviewSrc}
                      alt="OG önizleme"
                      className={cn(
                        'w-full bg-slate-900 object-contain',
                        previewMode === 'story' ? 'max-h-[380px]' : 'aspect-[4/5] max-h-[400px]'
                      )}
                    />
                  </div>

                  {/* Mode */}
                  <div>
                    <FieldLabel>Mod</FieldLabel>
                    <div className="flex gap-1 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-1">
                      {([
                        { key: 'post' as const, label: 'Post' },
                        { key: 'story' as const, label: 'Hikâye' },
                        { key: 'both' as const, label: 'İkisi' },
                      ]).map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setShareMode(key)}
                          className={cn(
                            'flex-1 rounded-lg py-2.5 text-sm font-bold transition-colors',
                            shareMode === key
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Platforms */}
                  <div>
                    <FieldLabel>Platformlar</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      <PlatformToggle
                        active={platforms.facebook}
                        onChange={(v) => setPlatforms((p) => ({ ...p, facebook: v }))}
                        label="Facebook"
                      >
                        <Facebook className="h-4 w-4" />
                      </PlatformToggle>
                      <PlatformToggle
                        active={platforms.instagram}
                        onChange={(v) => setPlatforms((p) => ({ ...p, instagram: v }))}
                        label="Instagram"
                      >
                        <Instagram className="h-4 w-4" />
                      </PlatformToggle>
                      {shareMode !== 'story' && (
                        <PlatformToggle
                          active={platforms.threads}
                          onChange={(v) => setPlatforms((p) => ({ ...p, threads: v }))}
                          label="Threads"
                        >
                          <span className="text-sm font-black leading-none">@</span>
                        </PlatformToggle>
                      )}
                      {shareMode !== 'story' && (
                        <PlatformToggle
                          active={platforms.twitter}
                          onChange={(v) => setPlatforms((p) => ({ ...p, twitter: v }))}
                          label="X"
                        >
                          <span className="text-sm font-black leading-none">𝕏</span>
                        </PlatformToggle>
                      )}
                    </div>
                  </div>

                  {/* Headline */}
                  <div>
                    <FieldLabel>Manşet</FieldLabel>
                    <textarea
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      rows={2}
                      className={inputClass}
                      placeholder="Sosyal medya manşeti…"
                    />
                    <p className="mt-1 text-right text-xs text-[rgb(var(--color-muted))]">{headline.length} karakter</p>
                  </div>

                  {(shareMode === 'post' || shareMode === 'both') && (
                    <div>
                      <FieldLabel>Özet / Caption</FieldLabel>
                      <textarea
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        rows={5}
                        className={inputClass}
                        placeholder="FB / IG / X gönderi metni (URL ve hashtag sistem ekler)…"
                      />
                      <p className="mt-1 text-right text-xs text-[rgb(var(--color-muted))]">{caption.length} karakter</p>
                    </div>
                  )}

                  {(shareMode === 'story' || shareMode === 'both') && (
                    <div>
                      <FieldLabel>Hikâye özeti</FieldLabel>
                      <textarea
                        value={storySummary}
                        onChange={(e) => setStorySummary(e.target.value)}
                        rows={3}
                        className={inputClass}
                        placeholder="Hikâye görselindeki özet metin…"
                      />
                      <p className="mt-1 text-right text-xs text-[rgb(var(--color-muted))]">{storySummary.length} karakter</p>
                    </div>
                  )}

                  {(shareMode === 'post' || shareMode === 'both') && (
                    <div>
                      <FieldLabel>
                        <span className="inline-flex items-center gap-1.5">
                          <Tag className="h-3.5 w-3.5" /> Hashtagler
                        </span>
                      </FieldLabel>
                      <input
                        value={hashtagsRaw}
                        onChange={(e) => setHashtagsRaw(e.target.value)}
                        className={inputClass}
                        placeholder="#NaHaber #Çanakkale …"
                      />
                    </div>
                  )}

                  {(() => {
                    const url = articleUrlOf(selected)
                    if (!url) return null
                    const full = url.startsWith('http') ? url : `https://www.nahaber.com${url}`
                    return (
                      <div>
                        <FieldLabel>Haber URL</FieldLabel>
                        <div className="flex items-center gap-1.5">
                          <input
                            readOnly
                            value={full}
                            className={cn(inputClass, 'min-w-0 flex-1 truncate font-mono text-xs')}
                          />
                          <button
                            type="button"
                            onClick={() => void copyUrl(full)}
                            className="rounded-lg border border-[rgb(var(--color-border))] p-2.5 text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
                            title="Kopyala"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <a
                            href={full}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-[rgb(var(--color-border))] p-2.5 text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    )
                  })()}

                  <div className="space-y-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <StatusBadge
                        ok={
                          shareMode === 'story'
                            ? !!selected.storyPublished
                            : shareMode === 'both'
                              ? !!(selected.socialPublished && selected.storyPublished)
                              : !!selected.socialPublished
                        }
                        label={
                          shareMode === 'story'
                            ? (selected.storyPublished ? 'Hikâye paylaşıldı' : 'Paylaşılmadı')
                            : shareMode === 'both'
                              ? (selected.socialPublished && selected.storyPublished
                                ? 'Post + hikâye paylaşıldı'
                                : selected.socialPublished
                                  ? 'Post paylaşıldı'
                                  : selected.storyPublished
                                    ? 'Hikâye paylaşıldı'
                                    : 'Paylaşılmadı')
                              : (selected.socialPublished ? 'Post paylaşıldı' : 'Paylaşılmadı')
                        }
                      />
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[rgb(var(--color-text))]">
                        <input
                          type="checkbox"
                          checked={forceReshare}
                          onChange={(e) => setForceReshare(e.target.checked)}
                          className="h-4 w-4 rounded border-[rgb(var(--color-border))]"
                        />
                        Yeniden paylaş
                      </label>
                    </div>
                    {lastResult && (
                      <div className={cn(
                        'rounded-lg px-3 py-2 text-sm',
                        lastResult.ok
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                      )}>
                        {lastResult.message}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-[rgb(var(--color-border))] p-5">
                  {composerBlocked ? (
                    <div className="rounded-xl bg-amber-50 py-3 text-center text-sm font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      {composerBlocked}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void shareSelected()}
                      disabled={sharing}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {sharing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Share2 className="h-5 w-5" />}
                      Paylaş
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <p className="pb-2 text-center text-sm text-[rgb(var(--color-muted))]">
          Manuel paylaşımda RSS serbest · Görselsiz haber paylaşılamaz · Yeniden paylaş için onay kutusu gerekir
        </p>
      </div>
    </div>
  )
}

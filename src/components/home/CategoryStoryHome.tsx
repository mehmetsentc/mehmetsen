'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Heart,
  Menu,
  Pause,
  Play,
  Share2,
} from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { Button } from '@/components/ui/Button'
import { FeedArticleReader } from '@/components/feed/smart/FeedArticleReader'
import { formatNewsDateBbc } from '@/components/home/desktop/formatNewsDate'
import { ROUTES } from '@/constants/routes'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import {
  jumpCategoryStoryGroup,
  stepCategoryStoryCursor,
  type CategoryStoryCursor,
  type CategoryStoryGroup,
} from '@/lib/home/categoryStories'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { likeService } from '@/services/likeService'
import { saveService } from '@/services/saveService'
import { postService } from '@/services/postService'
import { useUiStore } from '@/store/uiStore'
import toast from 'react-hot-toast'
import type { NewsItem } from '@/types/newsItem'
import type { FeedItemDto } from '@/types/smartFeed'

const STORY_DURATION_MS = 6000
const TICK_MS = 60
const SWIPE_CATEGORY_PX = 72
const TAP_MOVE_PX = 14
const HOLD_PAUSE_MS = 220

type CategoryStoryHomeProps = {
  groups: CategoryStoryGroup[]
}

function toFeedItem(item: NewsItem): FeedItemDto {
  const name = item.source || item.author || 'NaHaber'
  const publishedAt = item.publishedAt || item.createdAt || new Date().toISOString()
  return {
    id: item.id,
    type: 'article',
    articleId: item.id,
    clusterId: null,
    publisher: {
      id: item.author || item.id,
      slug: item.slug || item.id,
      name,
      logoUrl: item.authorPhotoURL ?? null,
    },
    headline: item.title,
    summary: item.summary || item.description || null,
    category: item.category ?? null,
    image: item.imageUrl ?? null,
    video: item.videoUrl ?? null,
    publishedAt,
    updatedAt: publishedAt,
    breaking: item.breaking === true,
    materialUpdate: false,
    clusterSourceCount: 1,
    socialState: null,
    socialCounts: {
      likes: item.likesCount ?? 0,
      comments: item.commentsCount ?? 0,
      saves: 0,
      shares: 0,
    },
    reason: 'RECENT',
    slug: item.slug || item.id,
  }
}

export function CategoryStoryHome({ groups: initialGroups }: CategoryStoryHomeProps) {
  const router = useRouter()
  const { user } = useAuth()
  const setMobileDrawerOpen = useUiStore((s) => s.setMobileDrawerOpen)
  const [groups, setGroups] = useState(initialGroups)
  const [cursor, setCursor] = useState<CategoryStoryCursor>({ groupIndex: 0, itemIndex: 0 })
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [holding, setHolding] = useState(false)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [readerItem, setReaderItem] = useState<NewsItem | null>(null)
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const pointerRef = useRef<{
    x: number
    y: number
    t: number
    id: number
  } | null>(null)
  const goNextRef = useRef<() => void>(() => {})

  useEffect(() => {
    setGroups(initialGroups)
  }, [initialGroups])

  useEffect(() => {
    setMounted(true)
    const mq = window.matchMedia('(max-width: 1023px)')
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!isMobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isMobile])

  useEffect(() => {
    let cancelled = false
    const pull = async () => {
      try {
        const res = await fetch('/api/home/category-stories', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { groups?: CategoryStoryGroup[] }
        if (cancelled || !Array.isArray(data.groups)) return
        setGroups((prev) => {
          const sig = (list: CategoryStoryGroup[]) =>
            list.map((g) => `${g.key}:${g.items.map((i) => i.id).join(',')}`).join('|')
          return sig(prev) === sig(data.groups!) ? prev : data.groups!
        })
      } catch {
        // Keep the rings already on screen.
      }
    }
    const id = window.setInterval(() => void pull(), 60_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void pull()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const group = groups[cursor.groupIndex]
  const items = group?.items ?? []
  const current = items[cursor.itemIndex]
  const isLastInCategory = items.length > 0 && cursor.itemIndex === items.length - 1

  useEffect(() => {
    if (groups.length === 0) return
    setCursor((prev) => {
      const key = groups[prev.groupIndex]?.key
      const byKey = key ? groups.findIndex((g) => g.key === key) : -1
      const groupIndex = byKey >= 0 ? byKey : Math.min(prev.groupIndex, groups.length - 1)
      const itemCount = groups[groupIndex]?.items.length ?? 1
      const itemIndex = Math.min(prev.itemIndex, Math.max(0, itemCount - 1))
      if (groupIndex === prev.groupIndex && itemIndex === prev.itemIndex) return prev
      return { groupIndex, itemIndex }
    })
  }, [groups])

  const applyCursor = useCallback((next: CategoryStoryCursor | 'end' | 'close', dir: 1 | -1) => {
    if (next === 'end' || next === 'close') {
      setPaused(true)
      setProgress(100)
      return
    }
    setDirection(dir)
    setPaused(false)
    setCursor(next)
    setProgress(0)
  }, [])

  const goNext = useCallback(() => {
    applyCursor(stepCategoryStoryCursor(groups, cursor, 1), 1)
  }, [applyCursor, groups, cursor])

  const goPrev = useCallback(() => {
    const next = stepCategoryStoryCursor(groups, cursor, -1)
    if (next === 'close' || next === 'end') return
    if (next.groupIndex === cursor.groupIndex && next.itemIndex === cursor.itemIndex) {
      setProgress(0)
      return
    }
    applyCursor(next, -1)
  }, [applyCursor, groups, cursor])

  const goCategory = useCallback(
    (dir: 1 | -1) => {
      const next = jumpCategoryStoryGroup(groups, cursor, dir)
      if (next === 'noop') return
      applyCursor(next, dir)
    },
    [applyCursor, groups, cursor]
  )

  useEffect(() => {
    goNextRef.current = goNext
  }, [goNext])

  useEffect(() => {
    if (!isMobile || !current || paused || holding || readerItem) return
    const interval = window.setInterval(() => {
      setProgress((p) => {
        const next = p + (TICK_MS / STORY_DURATION_MS) * 100
        if (next >= 100) {
          window.setTimeout(() => goNextRef.current(), 0)
          return 100
        }
        return next
      })
    }, TICK_MS)
    return () => window.clearInterval(interval)
  }, [current?.id, paused, holding, readerItem, isMobile])

  useEffect(() => {
    if (!isMobile || !current) return
    const id = current.id
    setProgress(0)
    setLiked(false)
    setSaved(false)
    postService.incrementViews(id).catch(() => {})
    if (!user?.uid) return
    let cancelled = false
    Promise.all([
      likeService.isLiked(user.uid, id),
      saveService.isSaved(user.uid, id),
    ]).then(([l, s]) => {
      if (cancelled) return
      setLiked(l)
      setSaved(s)
    })
    return () => {
      cancelled = true
    }
  }, [current?.id, user?.uid, isMobile])

  const openReader = useCallback((item: NewsItem) => {
    setReaderItem(item)
    setPaused(true)
  }, [])

  const closeReader = useCallback(() => {
    setReaderItem(null)
    setPaused(false)
    setProgress(0)
  }, [])

  const handleLike = useCallback(async () => {
    if (!user) {
      toast.error('Beğenmek için giriş yapın')
      return
    }
    if (!current) return
    const prev = liked
    setLiked(!prev)
    try {
      setLiked(await likeService.toggle(user.uid, current.id))
    } catch {
      setLiked(prev)
      toast.error('Beğeni kaydedilemedi')
    }
  }, [user, current, liked])

  const handleSave = useCallback(async () => {
    if (!user) {
      toast.error('Kaydetmek için giriş yapın')
      return
    }
    if (!current) return
    const prev = saved
    setSaved(!prev)
    try {
      const result = await saveService.toggle(user.uid, current.id, prev)
      setSaved(result)
      toast.success(result ? 'Kaydedildi' : 'Kayıttan kaldırıldı')
    } catch {
      setSaved(prev)
      toast.error('Kaydedilemedi')
    }
  }, [user, current, saved])

  const handleShare = useCallback(async () => {
    if (!current) return
    const url = `${window.location.origin}${newsItemDetailHref(current)}`
    if (navigator.share) {
      try {
        await navigator.share({ title: current.title, url })
        return
      } catch {
        // fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link kopyalandı')
    } catch {
      toast.error('Paylaşım başarısız')
    }
  }, [current])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, a')) return
    pointerRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId }
    window.setTimeout(() => {
      const p = pointerRef.current
      if (p && p.id === e.pointerId) setHolding(true)
    }, HOLD_PAUSE_MS)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current
    pointerRef.current = null
    setHolding(false)
    if (!start || start.id !== e.pointerId || !current) return
    if ((e.target as HTMLElement).closest('button, a')) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) > SWIPE_CATEGORY_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
      goCategory(dx < 0 ? 1 : -1)
      return
    }
    if (Math.hypot(dx, dy) > TAP_MOVE_PX) return
    if (Date.now() - start.t > 320) return
    const zone = e.clientX / Math.max(1, window.innerWidth)
    if (zone < 0.14) goPrev()
    else if (zone > 0.86) goNext()
    else openReader(current)
  }

  if (!mounted || !isMobile) return null

  if (groups.length === 0 || !current || !group) {
    return createPortal(
      <section
        className="fixed inset-0 z-[102] flex flex-col items-center justify-center bg-black px-6 text-center text-white lg:hidden"
        data-testid="category-story-empty"
        data-no-category-swipe
      >
        <p className="text-lg font-bold">Son 24 saatte hikaye yok</p>
        <p className="mt-2 max-w-xs text-sm text-white/70">
          Yeni haberler yüklenince kategoriler burada, en son paylaşılana göre sıralanır.
        </p>
      </section>,
      document.body
    )
  }

  const summary = current.summary || current.description

  return createPortal(
    <section
      className="fixed inset-0 z-[102] bg-black text-white lg:hidden"
      data-testid="category-story-home"
      data-no-category-swipe
      aria-label="Kategori hikayeleri"
    >
      <div
        className="relative h-full w-full"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          pointerRef.current = null
          setHolding(false)
        }}
      >
        <div
          className="absolute inset-x-0 top-0 z-30 flex flex-col gap-2 px-3 pb-1"
          style={{
            paddingTop:
              'max(0.75rem, calc(max(var(--mobile-sat, env(safe-area-inset-top, 0px)), env(safe-area-inset-top, 0px), 47px) + 0.35rem))',
          }}
          data-testid="category-story-top-chrome"
        >
          <div className="flex gap-1" data-testid="category-story-progress">
            {items.map((story, i) => {
              const fill = i < cursor.itemIndex ? 100 : i === cursor.itemIndex ? progress : 0
              return (
                <div key={story.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
                  <div className="h-full bg-white" style={{ width: `${fill}%` }} />
                </div>
              )
            })}
          </div>

        <header className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Menü"
            onClick={() => setMobileDrawerOpen(true)}
            className="rounded-full bg-black/40 p-2 backdrop-blur-md"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="truncate rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-black">
            {group.label}
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-white/80">
            {cursor.itemIndex + 1}/{items.length}
            <span className="text-white/50"> · {cursor.groupIndex + 1}/{groups.length}</span>
          </span>
          <button
            type="button"
            aria-label={paused ? 'Devam et' : 'Duraklat'}
            onClick={() => setPaused((p) => !p)}
            className="ml-auto rounded-full bg-black/40 p-2 backdrop-blur-md"
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
        </header>
        </div>

        {cursor.groupIndex > 0 ? (
          <button
            type="button"
            aria-label="Önceki kategori"
            onClick={() => goCategory(-1)}
            className="absolute left-2 top-[42%] z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white shadow-lg backdrop-blur-md"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.4} />
          </button>
        ) : null}
        {cursor.groupIndex < groups.length - 1 ? (
          <button
            type="button"
            aria-label="Sonraki kategori"
            onClick={() => goCategory(1)}
            className="absolute right-2 top-[42%] z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white shadow-lg backdrop-blur-md"
          >
            <ChevronRight className="h-6 w-6" strokeWidth={2.4} />
          </button>
        ) : null}

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={current.id}
            custom={direction}
            initial={{ opacity: 0, x: direction === 1 ? 36 : -36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction === 1 ? -36 : 36 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0"
          >
            <SafeNewsImage
              src={current.imageUrl || FEED_FALLBACK_LOGO}
              alt={current.title}
              fill
              sizes="100vw"
              priority
              className="object-cover"
            />
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/75 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-5 pb-[calc(var(--mobile-nav-clearance)+4.5rem)]">
              <h2 className="text-2xl font-black leading-[1.15] tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                {current.title}
              </h2>
              {summary ? (
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-white/85">{summary}</p>
              ) : null}
              {current.publishedAt ? (
                <p className="mt-3 text-xs text-white/70">{formatNewsDateBbc(current.publishedAt)}</p>
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>

        <footer className="absolute inset-x-0 bottom-0 z-30 px-4 pb-[calc(var(--mobile-nav-clearance)+0.35rem)] pt-3">
          <div className="flex items-center gap-2">
            {isLastInCategory ? (
              <Button
                size="lg"
                variant="solid"
                fullWidth
                rightIcon={<ArrowRight className="h-4 w-4" />}
                className="shadow-brand"
                onClick={() => router.push(ROUTES.CATEGORY(group.key))}
              >
                Tüm kategoriyi gör
              </Button>
            ) : (
              <Button
                size="lg"
                variant="solid"
                fullWidth
                rightIcon={<ArrowRight className="h-4 w-4" />}
                className="shadow-brand"
                onClick={() => openReader(current)}
              >
                Haberi oku
              </Button>
            )}
            <CircleAction
              active={liked}
              onClick={handleLike}
              aria="Beğen"
              icon={<Heart className={cn('h-5 w-5', liked && 'fill-current')} />}
            />
            <CircleAction
              active={saved}
              onClick={handleSave}
              aria="Kaydet"
              icon={saved ? <BookmarkCheck className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
            />
            <CircleAction onClick={handleShare} aria="Paylaş" icon={<Share2 className="h-5 w-5" />} />
          </div>
        </footer>
      </div>

      {readerItem ? (
        <FeedArticleReader
          item={toFeedItem(readerItem)}
          committed
          visualProgress={1}
          ownHistory={false}
          readerApiPath={`/api/home/category-story/${encodeURIComponent(readerItem.slug || readerItem.id)}`}
          onDoubleTap={closeReader}
          onClose={closeReader}
          liked={liked}
          saved={saved}
          likeCount={readerItem.likesCount}
          commentCount={readerItem.commentsCount}
          onToggleLike={() => void handleLike()}
          onToggleSave={() => void handleSave()}
        />
      ) : null}
    </section>,
    document.body
  )
}

function CircleAction({
  active,
  onClick,
  aria,
  icon,
}: {
  active?: boolean
  onClick: () => void
  aria: string
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={aria}
      onClick={onClick}
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-full backdrop-blur-md transition-all active:scale-95',
        active ? 'bg-brand-500 text-white shadow-brand' : 'bg-white/10 text-white'
      )}
    >
      {icon}
    </button>
  )
}

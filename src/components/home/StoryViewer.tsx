'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  Pause,
  Share2,
  X,
} from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { formatPublicSourceLabel } from '@/lib/postUtils'
import { formatNewsDateBbc } from '@/components/home/desktop/formatNewsDate'
import {
  jumpSourceStoryGroup,
  stepSourceStoryCursor,
  type SourceStoryCursor,
  type SourceStoryGroup,
} from '@/lib/home/sourceStories'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { likeService } from '@/services/likeService'
import { saveService } from '@/services/saveService'
import { postService } from '@/services/postService'
import toast from 'react-hot-toast'
import type { NewsItem } from '@/types/newsItem'

/**
 * StoryViewer — Tam ekran Instagram Story modu (NaHaber 2026, F3)
 *
 * Etkileşim modeli:
 *   - Tap sağ yarı → bir sonraki story (kaynak bitince sonraki kaynağa)
 *   - Tap sol yarı → bir önceki story (kaynak başında önceki kaynağın sonuna)
 *   - Yatay swipe → kaynaklar arası geçiş (Instagram ring)
 *   - Basılı tut → progress duraklar
 *   - Swipe-down → kapat
 *   - ←/→ klavye → nav, Esc → kapat, Space → pause/play
 *   - Auto-advance: STORY_DURATION_MS
 *
 * Backend bağlantısı: like + save + paylaş + view sayacı kayıt eder.
 */

const STORY_DURATION_MS = 6000
const TICK_MS = 60
const SWIPE_SOURCE_PX = 72
const SWIPE_SOURCE_VX = 450
const SWIPE_CLOSE_PX = 80
const SWIPE_CLOSE_VY = 500

interface StoryViewerProps {
  /** Flat list (Son Dakika). Ignored when `groups` is non-empty. */
  items?: NewsItem[]
  /** Multi-source rings (Kaynak hikayeleri) — Instagram-style. */
  groups?: SourceStoryGroup[]
  open: boolean
  initialIndex?: number
  initialGroupIndex?: number
  onClose: () => void
}

export function StoryViewer({
  items,
  groups,
  open,
  initialIndex = 0,
  initialGroupIndex = 0,
  onClose,
}: StoryViewerProps) {
  const router = useRouter()
  const { user } = useAuth()

  const resolvedGroups = useMemo((): SourceStoryGroup[] => {
    if (groups && groups.length > 0) return groups
    if (items && items.length > 0) {
      return [{ key: 'flat', label: 'Stories', items }]
    }
    return []
  }, [groups, items])

  const [cursor, setCursor] = useState<SourceStoryCursor>({
    groupIndex: initialGroupIndex,
    itemIndex: initialIndex,
  })
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [direction, setDirection] = useState<1 | -1>(1)

  const currentGroup = resolvedGroups[cursor.groupIndex]
  const currentItems = currentGroup?.items ?? []
  const current = currentItems[cursor.itemIndex]
  const totalInGroup = currentItems.length
  const multiSource = resolvedGroups.length > 1

  // Açıkken document scroll kilitle
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Açılışta cursor resetle
  useEffect(() => {
    if (!open) return
    const g = Math.min(
      Math.max(0, initialGroupIndex),
      Math.max(0, resolvedGroups.length - 1)
    )
    const group = resolvedGroups[g]
    const i = Math.min(
      Math.max(0, initialIndex),
      Math.max(0, (group?.items.length ?? 1) - 1)
    )
    setCursor({ groupIndex: g, itemIndex: i })
    setProgress(0)
    setPaused(false)
  }, [open, initialGroupIndex, initialIndex, resolvedGroups])

  // View sayacı + like/save state'i her story'de yenile
  useEffect(() => {
    if (!open || !current) return
    setProgress(0)
    setLiked(false)
    setSaved(false)

    postService.incrementViews(current.id).catch(() => {})

    if (!user?.uid) return
    let cancelled = false
    Promise.all([
      likeService.isLiked(user.uid, current.id),
      saveService.isSaved(user.uid, current.id),
    ]).then(([l, s]) => {
      if (cancelled) return
      setLiked(l)
      setSaved(s)
    })
    return () => {
      cancelled = true
    }
  }, [open, current?.id, user?.uid, current])

  const applyCursor = useCallback(
    (next: SourceStoryCursor | 'close', dir: 1 | -1) => {
      if (next === 'close') {
        onClose()
        return
      }
      setDirection(dir)
      setCursor(next)
      setProgress(0)
    },
    [onClose]
  )

  const goNext = useCallback(() => {
    applyCursor(stepSourceStoryCursor(resolvedGroups, cursor, 1), 1)
  }, [applyCursor, resolvedGroups, cursor])

  const goPrev = useCallback(() => {
    const next = stepSourceStoryCursor(resolvedGroups, cursor, -1)
    if (next === 'close') return
    if (
      next.groupIndex === cursor.groupIndex &&
      next.itemIndex === cursor.itemIndex
    ) {
      setProgress(0)
      return
    }
    applyCursor(next, -1)
  }, [applyCursor, resolvedGroups, cursor])

  const goNextSource = useCallback(() => {
    const next = jumpSourceStoryGroup(resolvedGroups, cursor, 1)
    if (next === 'noop') return
    applyCursor(next, 1)
  }, [applyCursor, resolvedGroups, cursor])

  const goPrevSource = useCallback(() => {
    const next = jumpSourceStoryGroup(resolvedGroups, cursor, -1)
    if (next === 'noop' || next === 'close') {
      setProgress(0)
      return
    }
    applyCursor(next, -1)
  }, [applyCursor, resolvedGroups, cursor])

  // ── Progress timer ──────────────────────────────────────────────
  useEffect(() => {
    if (!open || paused || totalInGroup === 0) return
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + (TICK_MS / STORY_DURATION_MS) * 100
        if (next >= 100) {
          setTimeout(() => goNext(), 0)
          return 100
        }
        return next
      })
    }, TICK_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paused, cursor.groupIndex, cursor.itemIndex, totalInGroup])

  // ── Klavye nav ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === ' ') {
        e.preventDefault()
        setPaused((p) => !p)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, goNext, goPrev, onClose])

  // ── Aksiyonlar ──────────────────────────────────────────────────
  const handleLike = useCallback(async () => {
    if (!user) {
      toast.error('Beğenmek için giriş yapın')
      return
    }
    if (!current) return
    const prev = liked
    setLiked(!prev)
    try {
      const result = await likeService.toggle(user.uid, current.id)
      setLiked(result)
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
    const text = current.title

    if (navigator.share) {
      try {
        await navigator.share({ title: text, url })
        return
      } catch {
        // user cancelled or share not allowed → linki kopyala
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link kopyalandı')
    } catch {
      toast.error('Paylaşım başarısız')
    }
  }, [current])

  const goToArticle = useCallback(() => {
    if (!current) return
    onClose()
    router.push(newsItemDetailHref(current))
  }, [current, onClose, router])

  // Swipe-down → kapat; yatay swipe → kaynak değiştir
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const ax = Math.abs(info.offset.x)
    const ay = Math.abs(info.offset.y)
    if (ax > ay && multiSource) {
      if (info.offset.x <= -SWIPE_SOURCE_PX || info.velocity.x <= -SWIPE_SOURCE_VX) {
        goNextSource()
        return
      }
      if (info.offset.x >= SWIPE_SOURCE_PX || info.velocity.x >= SWIPE_SOURCE_VX) {
        goPrevSource()
        return
      }
    }
    if (info.offset.y > SWIPE_CLOSE_PX || info.velocity.y > SWIPE_CLOSE_VY) onClose()
  }

  // Tap vs drag: zones are transparent overlays that must not steal framer drag.
  const tapRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const handleStagePointerDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement | null)?.closest('[data-story-chrome]')) return
    tapRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }
    setPaused(true)
  }
  const handleStagePointerUp = (e: ReactPointerEvent) => {
    setPaused(false)
    const start = tapRef.current
    tapRef.current = null
    if (!start) return
    if ((e.target as HTMLElement | null)?.closest('[data-story-chrome]')) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    const dt = Date.now() - start.t
    if (Math.hypot(dx, dy) > 14 || dt > 450) return
    const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const mid = bounds.left + bounds.width / 2
    if (e.clientX < mid) goPrev()
    else goNext()
  }
  const handleStagePointerCancel = () => {
    tapRef.current = null
    setPaused(false)
  }

  if (typeof document === 'undefined' || !current || !currentGroup) return null

  const sourceLabel =
    currentGroup.key === 'flat'
      ? formatPublicSourceLabel(current.source) || 'NaHaber'
      : currentGroup.label

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label="Kaynak hikayesi"
          data-testid="story-viewer"
          data-multi-source={multiSource ? '1' : '0'}
        >
          <motion.div
            className="relative flex h-[100dvh] w-full max-w-[100vw] sm:h-[90dvh] sm:max-w-[min(90vw,480px)] md:max-w-[min(75vw,560px)] lg:max-w-[min(55vw,640px)] flex-col overflow-hidden bg-black sm:rounded-3xl sm:shadow-2xl"
            drag
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            dragElastic={{ left: 0.35, right: 0.35, top: 0, bottom: 0.4 }}
            onDragEnd={handleDragEnd}
            onPointerDown={handleStagePointerDown}
            onPointerUp={handleStagePointerUp}
            onPointerCancel={handleStagePointerCancel}
            initial={{ y: 40, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280, mass: 0.7 }}
            data-testid="story-viewer-stage"
          >
            {/* ── Top chrome: progress ALWAYS above source row, clears iOS status bar ──
                App Store WKWebView often reports env(safe-area-inset-top)=0; floor 47px
                (same as Feed Reader --reader-sat). Stacked layout avoids progress slipping
                under the notch while the header still clears it. */}
            <div
              className="absolute inset-x-0 top-0 z-30 flex flex-col gap-2 px-3 pb-1"
              style={{
                // App Store WKWebView often reports env(safe-area-inset-top)=0.
                // Floor 47px (notch) so progress never sits under the clock.
                paddingTop:
                  'max(0.75rem, calc(max(var(--mobile-sat, env(safe-area-inset-top, 0px)), env(safe-area-inset-top, 0px), 47px) + 0.35rem))',
              }}
              data-testid="story-viewer-top-chrome"
              data-story-chrome
            >
              <div className="flex gap-1.5" data-testid="story-viewer-progress">
                {currentItems.map((_, i) => {
                  const fill =
                    i < cursor.itemIndex ? 100 : i === cursor.itemIndex ? progress : 0
                  return (
                    <div
                      key={`${currentGroup.key}-${i}`}
                      className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35"
                    >
                      <div
                        className="h-full bg-white transition-[width] duration-instant"
                        style={{ width: `${fill}%` }}
                      />
                    </div>
                  )
                })}
              </div>

              <header
                className="flex items-center justify-between gap-2"
                data-testid="story-viewer-header"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="solid" uppercase size="sm" className="shadow-lg">
                    {sourceLabel}
                  </Badge>
                  <span className="shrink-0 text-2xs font-semibold text-white/70">
                    {cursor.itemIndex + 1} / {totalInGroup}
                    {multiSource ? (
                      <span className="ml-1 text-white/45" data-testid="story-viewer-source-pos">
                        · {cursor.groupIndex + 1}/{resolvedGroups.length}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label={paused ? 'Devam et' : 'Duraklat'}
                    onClick={() => setPaused((p) => !p)}
                    className="rounded-full bg-black/40 p-2 text-white backdrop-blur-md transition-colors hover:bg-black/60"
                  >
                    <Pause className={cn('h-4 w-4', !paused && 'opacity-60')} />
                  </button>
                  <button
                    type="button"
                    aria-label="Kapat"
                    onClick={onClose}
                    className="rounded-full bg-black/40 p-2 text-white backdrop-blur-md transition-colors hover:bg-black/60"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </header>
            </div>

            {/* ── Story content ── */}
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={`${currentGroup.key}-${current.id}`}
                custom={direction}
                initial={{ opacity: 0, x: direction === 1 ? 40 : -40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction === 1 ? -40 : 40 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0"
              >
                <SafeNewsImage
                  src={current.imageUrl || FEED_FALLBACK_LOGO}
                  alt={current.title}
                  fill
                  sizes="440px"
                  priority
                  className="object-cover"
                />
                <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent" />

                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="Önceki"
                  data-story-chrome
                  className="absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur-md transition-colors hover:bg-black/70 sm:block"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="Sonraki"
                  data-story-chrome
                  className="absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur-md transition-colors hover:bg-black/70 sm:block"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-5 pb-32 sm:pb-36">
                  <h2 className="text-2xl font-black leading-[1.15] tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] sm:text-3xl">
                    {current.title}
                  </h2>
                  {current.description ? (
                    <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-white/85">
                      {current.description}
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center gap-3 text-xs text-white/70">
                    {typeof current.views === 'number' && current.views > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        {current.views.toLocaleString('tr-TR')}
                      </span>
                    ) : null}
                    {current.publishedAt ? (
                      <RelativeTime iso={current.publishedAt} />
                    ) : null}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            <footer
              className="absolute inset-x-0 bottom-0 z-30 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3"
              data-story-chrome
            >
              <div className="flex items-center gap-2">
                <Button
                  size="lg"
                  variant="solid"
                  fullWidth
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                  onClick={goToArticle}
                  className="shadow-brand"
                >
                  Habere git
                </Button>
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
                  icon={
                    saved ? (
                      <BookmarkCheck className="h-5 w-5" />
                    ) : (
                      <Bookmark className="h-5 w-5" />
                    )
                  }
                />
                <CircleAction
                  onClick={handleShare}
                  aria="Paylaş"
                  icon={<Share2 className="h-5 w-5" />}
                />
              </div>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
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
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-full backdrop-blur-md transition-all duration-quick ease-out-soft active:scale-95',
        active
          ? 'bg-brand-500 text-white shadow-brand'
          : 'bg-white/10 text-white hover:bg-white/20'
      )}
    >
      {icon}
    </button>
  )
}

function RelativeTime({ iso }: { iso: string }) {
  return <span>{formatNewsDateBbc(iso) ?? ''}</span>
}

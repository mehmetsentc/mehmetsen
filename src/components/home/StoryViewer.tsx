'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  Zap,
} from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
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
 *   - Tap sağ yarı → bir sonraki story
 *   - Tap sol yarı → bir önceki story
 *   - Basılı tut → progress duraklar (Instagram tarzı)
 *   - Swipe-down → kapat
 *   - ←/→ klavye → nav, Esc → kapat, Space → pause/play
 *   - Auto-advance: STORY_DURATION_MS
 *
 * Backend bağlantısı: like + save + paylaş + view sayacı kayıt eder.
 *
 * Kullanım:
 *   <StoryViewer
 *     items={breakingItems}
 *     open={open}
 *     initialIndex={idx}
 *     onClose={() => setOpen(false)}
 *   />
 */

const STORY_DURATION_MS = 6000
const TICK_MS = 60 // 16fps yeterli — daha pürüzsüz ama daha CPU dostu

interface StoryViewerProps {
  items: NewsItem[]
  open: boolean
  initialIndex?: number
  onClose: () => void
}

export function StoryViewer({ items, open, initialIndex = 0, onClose }: StoryViewerProps) {
  const router = useRouter()
  const { user } = useAuth()

  const [index, setIndex] = useState(initialIndex)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [direction, setDirection] = useState<1 | -1>(1)

  const current = items[index]
  const total = items.length

  // Açıkken document scroll kilitle
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Açılışta index resetle
  useEffect(() => {
    if (open) {
      setIndex(initialIndex)
      setProgress(0)
      setPaused(false)
    }
  }, [open, initialIndex])

  // View sayacı + like/save state'i her story'de yenile
  useEffect(() => {
    if (!open || !current) return
    setProgress(0)
    setLiked(false)
    setSaved(false)

    // İzleme sayacı (best-effort, hata sessiz)
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
    return () => { cancelled = true }
  }, [open, current?.id, user?.uid, current])

  // ── Progress timer ──────────────────────────────────────────────
  useEffect(() => {
    if (!open || paused || total === 0) return
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + (TICK_MS / STORY_DURATION_MS) * 100
        if (next >= 100) {
          // Auto-advance — yan etki tetiklemek için setTimeout
          setTimeout(() => goNext(), 0)
          return 100
        }
        return next
      })
    }, TICK_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paused, index, total])

  const goNext = useCallback(() => {
    setDirection(1)
    setIndex((i) => {
      if (i >= total - 1) {
        onClose()
        return i
      }
      return i + 1
    })
    setProgress(0)
  }, [total, onClose])

  const goPrev = useCallback(() => {
    setDirection(-1)
    setIndex((i) => Math.max(0, i - 1))
    setProgress(0)
  }, [])

  // ── Klavye nav ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, goNext, goPrev, onClose])

  // ── Aksiyonlar ──────────────────────────────────────────────────
  const handleLike = useCallback(async () => {
    if (!user) { toast.error('Beğenmek için giriş yapın'); return }
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
    if (!user) { toast.error('Kaydetmek için giriş yapın'); return }
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

  // Swipe-down ile kapat
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 80 || info.velocity.y > 500) onClose()
  }

  // Tap-zone navigasyonu (sol/sağ)
  const handleZoneClick = (zone: 'left' | 'right') => {
    if (zone === 'left') goPrev()
    else goNext()
  }

  if (typeof document === 'undefined' || !current) return null

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
          aria-label="Son dakika hikayesi"
        >
          <motion.div
            className="relative flex h-[100dvh] w-full max-w-[100vw] sm:h-[90dvh] sm:max-w-[min(90vw,480px)] md:max-w-[min(75vw,560px)] lg:max-w-[min(55vw,640px)] flex-col overflow-hidden bg-black sm:rounded-3xl sm:shadow-2xl"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={handleDragEnd}
            initial={{ y: 40, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280, mass: 0.7 }}
          >
            {/* ── Progress bars (üst) ──────────────────────── */}
            <div className="absolute inset-x-0 top-0 z-30 flex gap-1.5 px-3 pt-3">
              {items.map((_, i) => {
                const fill = i < index ? 100 : i === index ? progress : 0
                return (
                  <div
                    key={i}
                    className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25"
                  >
                    <div
                      className="h-full bg-white transition-[width] duration-instant"
                      style={{ width: `${fill}%` }}
                    />
                  </div>
                )
              })}
            </div>

            {/* ── Header: Son Dakika rozeti + kapat ──────────── */}
            <header className="absolute inset-x-0 top-7 z-30 flex items-center justify-between px-4 pt-2">
              <div className="flex items-center gap-2">
                <Badge variant="sondakika" uppercase size="sm" className="shadow-lg">
                  <Zap className="h-3 w-3" />
                  Son Dakika
                </Badge>
                <span className="text-2xs font-semibold text-white/70">
                  {index + 1} / {total}
                </span>
              </div>
              <div className="flex items-center gap-2">
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

            {/* ── Story content (görsel + başlık) ─────────────── */}
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={current.id}
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
                {/* Üst + alt karartma */}
                <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent" />

                {/* ── Tap zones ───────────────────────────── */}
                <button
                  type="button"
                  aria-label="Önceki story"
                  onClick={() => handleZoneClick('left')}
                  onPointerDown={() => setPaused(true)}
                  onPointerUp={() => setPaused(false)}
                  onPointerCancel={() => setPaused(false)}
                  className="absolute inset-y-20 left-0 z-10 w-1/3"
                />
                <button
                  type="button"
                  aria-label="Sonraki story"
                  onClick={() => handleZoneClick('right')}
                  onPointerDown={() => setPaused(true)}
                  onPointerUp={() => setPaused(false)}
                  onPointerCancel={() => setPaused(false)}
                  className="absolute inset-y-20 right-0 z-10 w-1/3"
                />

                {/* Görsel masaüstünde nav okları (mobile'da gizli) */}
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="Önceki"
                  className="absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur-md transition-colors hover:bg-black/70 sm:block"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="Sonraki"
                  className="absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur-md transition-colors hover:bg-black/70 sm:block"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>

                {/* ── Başlık + meta (alt) ────────────────── */}
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

            {/* ── Footer aksiyonları ──────────────────────── */}
            <footer className="absolute inset-x-0 bottom-0 z-30 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
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
  const label = useMemo(() => relativeTimeShort(iso), [iso])
  return <span>{label}</span>
}

function relativeTimeShort(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = (Date.now() - t) / 1000
  if (diff < 60) return 'şimdi'
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`
  return `${Math.floor(diff / 86400)} gün önce`
}

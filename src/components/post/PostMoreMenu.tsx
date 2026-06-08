'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  BarChart3,
  Bookmark,
  ChevronRight,
  Copy,
  ExternalLink,
  Flag,
  Link2,
  Maximize2,
  QrCode,
  Share2,
  Trash2,
  User,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { ROUTES } from '@/constants/routes'
import { buildPostShareUrl } from '@/lib/shareUtils'
import { formatCount } from '@/lib/postUtils'
import { useAuth } from '@/hooks/useAuth'
import { useSave } from '@/hooks/useSave'
import { postService } from '@/services/postService'
import { reportService } from '@/services/reportService'
import { ShareMenu } from '@/components/post/ShareMenu'
import { cn } from '@/lib/utils'

export interface PostMoreMenuPost {
  id: string
  slug?: string
  title: string
  authorUsername: string
  isVideo?: boolean
  viewsCount?: number
  likesCount?: number
  commentsCount?: number
  savesCount?: number
}

interface PostMoreMenuProps {
  post: PostMoreMenuPost
  open: boolean
  onClose: () => void
  variant?: 'reels' | 'default'
  saved?: boolean
  onToggleSave?: () => void | Promise<void>
}

interface MenuRow {
  id: string
  label: string
  icon: React.ReactNode
  onClick?: () => void
  href?: string
  tone?: 'default' | 'danger' | 'accent'
  trailing?: React.ReactNode
}

export function PostMoreMenu({
  post,
  open,
  onClose,
  variant = 'default',
  saved: savedProp,
  onToggleSave,
}: PostMoreMenuProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [shareOpen, setShareOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const { saved: savedHook, toggle: toggleSaveHook } = useSave({
    postId: post.id,
    initialCount: post.savesCount ?? 0,
  })

  const saved = savedProp ?? savedHook
  const shareUrl = buildPostShareUrl(post)
  const isOwner = Boolean(
    user &&
      (user.username.toLowerCase() === post.authorUsername.toLowerCase() ||
        user.uid === post.authorUsername)
  )
  const isReels = variant === 'reels'

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success('Bağlantı kopyalandı')
      onClose()
    } catch {
      toast.error('Bağlantı kopyalanamadı')
    }
  }, [shareUrl, onClose])

  const handleSave = useCallback(async () => {
    if (onToggleSave) {
      await onToggleSave()
      return
    }
    await toggleSaveHook()
  }, [onToggleSave, toggleSaveHook])

  const handleReport = useCallback(async () => {
    if (!user) {
      toast.error('Bildirmek için giriş yapın')
      return
    }
    setBusy(true)
    try {
      await reportService.reportPost(user.uid, post.id, 'other')
      toast.success('Bildiriminiz alındı')
      onClose()
    } catch {
      toast.error('Bildirilemedi')
    } finally {
      setBusy(false)
    }
  }, [user, post.id, onClose])

  const handleDelete = useCallback(async () => {
    if (!isOwner) return
    if (!window.confirm('Bu içeriği kalıcı olarak silmek istediğinize emin misiniz?')) return

    setBusy(true)
    try {
      await postService.deleteNews(post.id)
      toast.success('İçerik silindi')
      onClose()
      router.push(ROUTES.FEED)
      router.refresh()
    } catch {
      toast.error('Silinemedi')
    } finally {
      setBusy(false)
    }
  }, [isOwner, post.id, onClose, router])

  const handleFullscreen = useCallback(() => {
    if (post.isVideo) {
      router.push(ROUTES.REELS_VIDEO(post.id))
      onClose()
      return
    }
    router.push(ROUTES.POST_DETAIL(post.id))
    onClose()
  }, [post.id, post.isVideo, onClose, router])

  const statsLabel = useMemo(() => {
    const parts = [
      `${formatCount(post.viewsCount ?? 0)} görüntülenme`,
      `${formatCount(post.likesCount ?? 0)} beğeni`,
      `${formatCount(post.commentsCount ?? 0)} yorum`,
    ]
    return parts.join(' · ')
  }, [post.viewsCount, post.likesCount, post.commentsCount])

  const rows: MenuRow[] = [
    {
      id: 'open',
      label: post.isVideo ? 'Teve videosunu aç' : 'Gönderiyi aç',
      icon: <ExternalLink className="h-5 w-5" />,
      href: post.isVideo ? ROUTES.REELS_VIDEO(post.id) : ROUTES.POST_DETAIL(post.id),
    },
    {
      id: 'profile',
      label: 'Profili gör',
      icon: <User className="h-5 w-5" />,
      href: ROUTES.PROFILE(post.authorUsername),
    },
    {
      id: 'fullscreen',
      label: post.isVideo ? 'Tam ekran gör' : 'Detay sayfasına git',
      icon: <Maximize2 className="h-5 w-5" />,
      onClick: handleFullscreen,
    },
    {
      id: 'copy',
      label: 'Bağlantıyı kopyala',
      icon: <Link2 className="h-5 w-5" />,
      onClick: copyLink,
    },
    {
      id: 'stats',
      label: 'İstatistikler',
      icon: <BarChart3 className="h-5 w-5" />,
      trailing: <ChevronRight className="h-4 w-4 opacity-50" />,
      onClick: () => toast(statsLabel, { icon: '📊', duration: 5000 }),
    },
    {
      id: 'qr',
      label: 'QR kodu',
      icon: <QrCode className="h-5 w-5" />,
      onClick: () => {
        copyLink()
        toast('QR kod özelliği yakında', { icon: 'ℹ️' })
      },
    },
    {
      id: 'report',
      label: 'Bildir',
      icon: <Flag className="h-5 w-5" />,
      onClick: handleReport,
    },
  ]

  if (isOwner) {
    rows.push({
      id: 'delete',
      label: 'Sil',
      icon: <Trash2 className="h-5 w-5" />,
      tone: 'danger',
      onClick: handleDelete,
    })
  }

  if (!open) {
    return (
      <ShareMenu
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={post.title}
        url={shareUrl}
      />
    )
  }

  return (
    <>
      <div
        className={cn('post-more-overlay', isReels && 'post-more-overlay-reels')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-more-title"
      >
        <button type="button" className="post-more-backdrop" aria-label="Kapat" onClick={onClose} />

        <div className={cn('post-more-sheet', isReels && 'post-more-sheet-reels')}>
          <div className="post-more-handle" aria-hidden />

          <div className="post-more-quick">
            <button type="button" className="post-more-quick-btn" onClick={handleSave} disabled={busy}>
              <Bookmark className={cn('h-6 w-6', saved && 'fill-current')} />
              <span>{saved ? 'Kayıtlı' : 'Kaydet'}</span>
            </button>
            <button
              type="button"
              className="post-more-quick-btn"
              onClick={() => {
                onClose()
                setShareOpen(true)
              }}
              disabled={busy}
            >
              <Share2 className="h-6 w-6" />
              <span>Paylaş</span>
            </button>
            <button type="button" className="post-more-quick-btn" onClick={copyLink} disabled={busy}>
              <Copy className="h-6 w-6" />
              <span>Bağlantı</span>
            </button>
          </div>

          <div className="post-more-list">
            {rows.map((row) => {
              const className = cn(
                'post-more-row',
                row.tone === 'danger' && 'post-more-row-danger',
                row.tone === 'accent' && 'post-more-row-accent'
              )

              if (row.href) {
                return (
                  <Link
                    key={row.id}
                    href={row.href}
                    className={className}
                    onClick={onClose}
                  >
                    {row.icon}
                    <span className="flex-1">{row.label}</span>
                    {row.trailing}
                  </Link>
                )
              }

              return (
                <button
                  key={row.id}
                  type="button"
                  className={className}
                  onClick={row.onClick}
                  disabled={busy}
                >
                  {row.icon}
                  <span className="flex-1 text-left">{row.label}</span>
                  {row.trailing}
                </button>
              )
            })}
          </div>

          <p id="post-more-title" className="post-more-footnote">
            <AlertTriangle className="inline h-3.5 w-3.5" /> Yasadışı, bahis ve müstehcen içerikler yasaktır.
          </p>
        </div>
      </div>

      <ShareMenu
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={post.title}
        url={shareUrl}
      />
    </>
  )
}

interface PostMoreButtonProps {
  post: PostMoreMenuPost
  variant?: 'reels' | 'timeline' | 'detail'
  saved?: boolean
  onToggleSave?: () => void | Promise<void>
  className?: string
}

export function PostMoreButton({
  post,
  variant = 'timeline',
  saved,
  onToggleSave,
  className,
}: PostMoreButtonProps) {
  const [open, setOpen] = useState(false)
  const isReels = variant === 'reels'

  return (
    <>
      <button
        type="button"
        aria-label="Daha fazla seçenek"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        className={cn(
          'transition-transform active:scale-90',
          isReels && 'text-white',
          variant === 'timeline' &&
            'ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))]',
          variant === 'detail' &&
            'inline-flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]',
          className
        )}
      >
        <svg
          viewBox="0 0 24 24"
          className={cn(isReels || variant === 'timeline' ? 'h-4 w-4' : 'h-5 w-5', isReels && 'h-7 w-7')}
          fill="currentColor"
          aria-hidden
        >
          <circle cx="5" cy="12" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="19" cy="12" r="1.75" />
        </svg>
        {variant === 'timeline' && <span className="sr-only">Daha fazla</span>}
      </button>

      <PostMoreMenu
        post={post}
        open={open}
        onClose={() => setOpen(false)}
        variant={isReels ? 'reels' : 'default'}
        saved={saved}
        onToggleSave={onToggleSave}
      />
    </>
  )
}

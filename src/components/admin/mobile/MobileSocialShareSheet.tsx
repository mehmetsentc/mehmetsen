'use client'

/**
 * Mobile share sheet (Görev 18 EK): the same shared multi-account flow as the
 * desktop popover — pick (checkboxes, nothing preselected) → confirm (news,
 * format, every target) → per-target results with explicit retry.
 */
import { Clapperboard, Film, Share2, Smartphone, X } from 'lucide-react'
import { ManualShareFlow } from '@/components/admin/social/ManualShareFlow'

export type SocialShareMode = 'story' | 'post' | 'reel' | 'video_story'

const MODE_TITLE: Record<SocialShareMode, string> = { story: 'Hikâye paylaş', post: 'Post paylaş', reel: 'Reels paylaş', video_story: 'Video hikâye paylaş' }

export interface PlatformFlags {
  facebook: boolean
  instagram: boolean
  twitter: boolean
  threads: boolean
}

interface MobileSocialShareSheetProps {
  open: boolean
  mode: SocialShareMode
  postId: string
  newsTitle?: string
  isAlreadyPublished: boolean
  onClose: () => void
  onDone?: (mode: SocialShareMode) => void
}

export function MobileSocialShareSheet({ open, mode, postId, newsTitle, onClose, onDone }: MobileSocialShareSheetProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] lg:hidden">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Kapat" onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-2xl"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        role="dialog"
        aria-label={MODE_TITLE[mode]}
      >
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-[rgb(var(--color-border))]" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-[rgb(var(--color-text))]">
            {mode === 'story' ? <Smartphone className="h-4 w-4" /> : mode === 'reel' ? <Clapperboard className="h-4 w-4" /> : mode === 'video_story' ? <Film className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            {MODE_TITLE[mode]}
          </h2>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl text-[rgb(var(--color-muted))]" aria-label="Kapat">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto px-4 pb-2">
          <ManualShareFlow
            newsId={postId}
            newsTitle={newsTitle ?? ''}
            mode={mode}
            onClose={onClose}
            onFinished={(r) => {
              if (r.overall === 'published' || r.overall === 'partial') onDone?.(mode)
            }}
          />
        </div>
      </div>
    </div>
  )
}

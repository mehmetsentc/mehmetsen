'use client'

import { useState } from 'react'
import { Facebook, Instagram, Loader2, Share2, Smartphone, X } from 'lucide-react'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'

export type SocialShareMode = 'story' | 'post'

export interface PlatformFlags {
  facebook: boolean
  instagram: boolean
  twitter: boolean
  threads: boolean
}

const ThreadsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12.186 24h-.007C5.461 23.956.057 18.51 0 11.735c.057-6.775 5.461-12.22 12.179-12.264h.007C18.539.015 23.943 5.46 24 12.235c-.057 6.776-5.461 12.221-12.179 12.265h-.007zm0-22.53h-.006C6.566 1.513 1.988 6.127 1.942 12.008v.019c.046 5.881 4.624 10.495 10.238 10.538h.006c5.614-.043 10.192-4.657 10.238-10.538v-.019c-.046-5.881-4.624-10.495-10.238-10.538zm3.234 14.588a3.82 3.82 0 0 1-1.12 1.605c-1.468 1.2-3.568 1.452-5.282.576a4.26 4.26 0 0 1-2.028-2.424 6.26 6.26 0 0 1-.378-2.112c-.024-.792.06-1.584.252-2.352.36-1.44 1.2-2.592 2.472-3.168 1.344-.612 2.832-.54 4.104.168.564.312 1.032.768 1.38 1.308l-1.284.876a2.64 2.64 0 0 0-.84-.888c-.78-.48-1.74-.468-2.508.036-.792.516-1.272 1.404-1.476 2.436a5.3 5.3 0 0 0-.096 1.668c.048.564.18 1.116.42 1.62.36.768 1.008 1.272 1.824 1.404.816.132 1.596-.108 2.124-.672.336-.36.54-.816.6-1.308h-2.172v-1.344h3.636v.612c.024.72-.108 1.404-.384 2.04l-.264.108z" />
  </svg>
)

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)

const STORY_PLATFORMS: { key: keyof PlatformFlags; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { key: 'facebook', label: 'Facebook', Icon: Facebook },
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
]

const POST_PLATFORMS: { key: keyof PlatformFlags; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { key: 'facebook', label: 'Facebook', Icon: Facebook },
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
  { key: 'twitter', label: 'X (Twitter)', Icon: XIcon },
  { key: 'threads', label: 'Threads', Icon: ThreadsIcon },
]

interface MobileSocialShareSheetProps {
  open: boolean
  mode: SocialShareMode
  postId: string
  isAlreadyPublished: boolean
  onClose: () => void
  onDone?: (mode: SocialShareMode) => void
}

export function MobileSocialShareSheet({
  open,
  mode,
  postId,
  isAlreadyPublished,
  onClose,
  onDone,
}: MobileSocialShareSheetProps) {
  const platforms = mode === 'story' ? STORY_PLATFORMS : POST_PLATFORMS
  const [flags, setFlags] = useState<PlatformFlags>({
    facebook: true,
    instagram: true,
    twitter: mode === 'post',
    threads: mode === 'post',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const anySelected = platforms.some((p) => flags[p.key])

  async function share(force: boolean) {
    if (!anySelected || busy) return

    const platformNames: string[] = []
    if (flags.facebook) platformNames.push('FB')
    if (flags.instagram) platformNames.push('IG')
    if (mode === 'post' && flags.twitter) platformNames.push('X')
    if (mode === 'post' && flags.threads) platformNames.push('Th')

    setBusy(true)
    setError(null)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/social/force-reshare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ids: [postId],
          mode,
          manual: true,
          force,
          platforms: {
            facebook: flags.facebook,
            instagram: flags.instagram,
            twitter: mode === 'post' ? flags.twitter : false,
            threads: mode === 'post' ? flags.threads : false,
          },
        }),
      })
      const data = (await res.json()) as {
        error?: string
        results?: Array<{ ok: boolean; reason?: string }>
      }
      const r0 = data.results?.[0]
      if (!res.ok) {
        const msg = data.error ?? r0?.reason ?? 'Paylaşım başarısız'
        if (!force && /zaten|force/i.test(msg)) {
          const ok = window.confirm(
            mode === 'story'
              ? 'Bu haber zaten hikâye olarak paylaşılmış. Yeniden paylaş?'
              : 'Bu haber zaten feed post olarak paylaşılmış. Yeniden paylaş?'
          )
          if (ok) {
            setBusy(false)
            return share(true)
          }
          return
        }
        throw new Error(msg)
      }
      onDone?.(mode)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Paylaşım başarısız')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] md:hidden">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Kapat" onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-2xl"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        role="dialog"
        aria-label={mode === 'story' ? 'Hikâye paylaş' : 'Post paylaş'}
      >
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-[rgb(var(--color-border))]" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-[rgb(var(--color-text))]">
            {mode === 'story' ? <Smartphone className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            {mode === 'story' ? 'Hikâye paylaş' : 'Post paylaş'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-[rgb(var(--color-muted))]"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="px-4 pb-2 text-xs text-[rgb(var(--color-muted))]">
          {mode === 'story' ? 'Instagram ve Facebook hikâye' : 'Feed post platformları'}
        </p>

        <div className="space-y-1 px-3">
          {platforms.map(({ key, label, Icon }) => (
            <label
              key={key}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 hover:bg-[rgb(var(--color-surface))]"
            >
              <input
                type="checkbox"
                checked={flags[key]}
                onChange={() => setFlags((prev) => ({ ...prev, [key]: !prev[key] }))}
                className="h-4 w-4 accent-[rgb(var(--color-brand))]"
              />
              <Icon className="h-4 w-4 text-[rgb(var(--color-muted))]" />
              <span className="text-sm font-medium text-[rgb(var(--color-text))]">{label}</span>
            </label>
          ))}
        </div>

        {error ? <p className="px-4 pt-2 text-sm text-red-600">{error}</p> : null}

        <div className="flex gap-2 px-3 pb-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-xl border border-[rgb(var(--color-border))] text-sm font-semibold text-[rgb(var(--color-text))]"
          >
            İptal
          </button>
          <button
            type="button"
            disabled={!anySelected || busy}
            onClick={() => void share(isAlreadyPublished)}
            className={cn(
              'flex min-h-11 flex-[1.4] items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-50',
              mode === 'story' ? 'bg-violet-600' : 'bg-sky-600'
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isAlreadyPublished ? 'Yeniden Paylaş' : 'Paylaş'}
          </button>
        </div>
      </div>
    </div>
  )
}

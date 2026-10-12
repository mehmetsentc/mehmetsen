'use client'

import { useState } from 'react'
import { Loader2, Share2, Smartphone, X } from 'lucide-react'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import { ComposerTargetPicker, EMPTY_TARGETS, accountLabel, explicitTargets as pickTargets, type TargetOption, type TargetSelection } from '@/components/admin/social/ComposerTargetPicker'
import { describeShareResult, OVERALL_HEADLINE, overallShareState, resultsOf, readJsonResponse, unreadableResponseText, type ShareResultLike } from '@/lib/social/shareResultText'
import { showShareToast } from '@/lib/social/shareToast'

export type SocialShareMode = 'story' | 'post'

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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Görev 17: yalnız açıkça seçilen bağlı hesaplar; eski Onyeditivi seçeneği yok.
  const [targets, setTargets] = useState<TargetSelection>(EMPTY_TARGETS)
  const [options, setOptions] = useState<TargetOption[]>([])

  if (!open) return null

  const explicitTargets = pickTargets(targets) as Record<string, string>
  if (mode === 'story') delete explicitTargets.threads
  const flags: PlatformFlags = { facebook: !!explicitTargets.facebook, instagram: !!explicitTargets.instagram, threads: !!explicitTargets.threads, twitter: false }
  const chosen = Object.entries(explicitTargets).map(([p, id]) => {
    const o = options.find((x) => x.accountId === id)
    return `${o ? accountLabel(o) : id} (${p === 'facebook' ? 'FB' : p === 'instagram' ? 'IG' : 'Threads'})`
  })
  const anySelected = chosen.length > 0

  async function share() {
    if (!anySelected || busy) return
    const force = false

    setBusy(true)
    setError(null)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      let res: Response
      try {
        res = await fetch('/api/admin/social/force-reshare', {
          method: 'POST',
          credentials: 'same-origin',
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
              twitter: false,
              threads: mode === 'post' ? flags.threads : false,
            },
            targets: explicitTargets,
          }),
        })
      } catch {
        throw new Error(unreadableResponseText(0))
      }
      const parsed = await readJsonResponse<{
        error?: string
        results?: Array<{
          ok: boolean
          reason?: string
          post?: Record<string, ShareResultLike | undefined>
          story?: Record<string, ShareResultLike | undefined>
        }>
      }>(res)
      if (!parsed.ok) throw new Error(unreadableResponseText(parsed.status))
      const data = parsed.data
      const r0 = data.results?.[0]
      const lines: string[] = []
      for (const [prefix, set] of [['Post', r0?.post], ['Hikâye', r0?.story]] as const) {
        if (!set) continue
        for (const [key, label] of [['facebook', 'FB'], ['instagram', 'IG'], ['threads', 'Th'], ['twitter', 'X']] as const) {
          if (flags[key] && key in set) lines.push(describeShareResult(`${prefix} ${label}`, set[key]))
        }
      }
      if (!res.ok) {
        const msg = [data.error ?? r0?.reason ?? 'Paylaşım başarısız', ...lines].join('\n')
        throw new Error(msg)
      }
      const overall = overallShareState(resultsOf(r0))
      showShareToast(overall, lines)
      if (overall === 'published') {
        onDone?.(mode)
        onClose()
        return
      }
      // Kısmi / belirsiz / başarısız: sayfa açık kalır, her hedefin sonucu görünür.
      if (overall === 'partial') onDone?.(mode)
      setError([OVERALL_HEADLINE[overall], ...lines].join('\n'))
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

        <div className="max-h-[50vh] overflow-auto px-4 pt-1">
          <ComposerTargetPicker newsId={postId} mode={mode} value={targets} onChange={setTargets} onOptions={setOptions} />
        </div>
        {anySelected && <p className="px-4 pt-2 text-xs text-[rgb(var(--color-text))]">Paylaşılacak: <b>{chosen.join(', ')}</b></p>}

        {error ? <p className="whitespace-pre-line px-4 pt-2 text-sm text-red-600">{error}</p> : null}

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
            onClick={() => void share()}
            className={cn(
              'flex min-h-11 flex-[1.4] items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-50',
              mode === 'story' ? 'bg-violet-600' : 'bg-sky-600'
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {anySelected ? 'Seçilen hesaplarda paylaş' : 'Hesap seçin'}
          </button>
        </div>
      </div>
    </div>
  )
}

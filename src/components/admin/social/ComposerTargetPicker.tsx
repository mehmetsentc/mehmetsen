'use client'

/**
 * Manual share target picker (Görev 17) — one connected account per platform,
 * chosen explicitly for ONE news item.
 *
 * - No «Onyeditivi (mevcut bağlantı)» / legacy option and nothing preselected.
 * - The list comes from /api/social/targets?newsId=…: the user's permitted
 *   accounts with this news item's own location, the account's NaHaber publish
 *   scope, connection health and supported formats already evaluated. The
 *   server re-checks everything at publish time.
 * - Accounts that need a reconnect are shown disabled with the reason and a
 *   «Yeniden bağla» link for their managers.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'

export type TargetPlatform = 'facebook' | 'instagram' | 'threads'
/** platform → accountId ('' = not selected). */
export type TargetSelection = Record<TargetPlatform, string>
export const EMPTY_TARGETS: TargetSelection = { facebook: '', instagram: '', threads: '' }

export type TargetOption = {
  accountId: string
  platform: TargetPlatform
  displayName: string
  username: string | null
  ownerKind: string
  citySlug: string | null
  selectable: boolean
  code: string | null
  reason: string | null
  reconnect: boolean
  canManage: boolean
}

const LABEL: Record<TargetPlatform, string> = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads' }

export function accountLabel(o: Pick<TargetOption, 'displayName' | 'username'>): string {
  return o.username ? `${o.displayName} (@${o.username})` : o.displayName
}

/** Selected targets → `{ platform: accountId }` for the API (only chosen ones). */
export function explicitTargets(sel: TargetSelection): Partial<Record<TargetPlatform, string>> {
  return Object.fromEntries(Object.entries(sel).filter(([, v]) => !!v)) as Partial<Record<TargetPlatform, string>>
}

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; options: TargetOption[] }

export function ComposerTargetPicker({
  newsId,
  mode,
  value,
  onChange,
  onOptions,
}: {
  newsId: string
  mode: 'post' | 'story' | 'both'
  value: TargetSelection
  onChange: (next: TargetSelection) => void
  /** Lets the caller show the chosen account names in its confirmation. */
  onOptions?: (options: TargetOption[]) => void
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const formats = mode === 'both' ? 'post,story' : mode

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    void (async () => {
      try {
        const token = (await auth.currentUser?.getIdToken()) ?? ''
        const res = await fetch(`/api/social/targets?newsId=${encodeURIComponent(newsId)}&formats=${formats}`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'same-origin',
        })
        const body = (await res.json().catch(() => null)) as { options?: TargetOption[]; error?: string } | null
        if (cancelled) return
        if (!res.ok || !body?.options) return setState({ kind: 'error', message: res.status === 401 ? 'Oturum gerekli' : 'Hesaplar yüklenemedi' })
        setState({ kind: 'ok', options: body.options })
        onOptions?.(body.options)
      } catch {
        if (!cancelled) setState({ kind: 'error', message: 'Hesaplar yüklenemedi' })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsId, formats])

  const platforms = useMemo<TargetPlatform[]>(() => (mode === 'story' ? ['facebook', 'instagram'] : ['facebook', 'instagram', 'threads']), [mode])

  if (state.kind === 'loading') return <p className="text-xs text-[rgb(var(--color-muted))]">Hesaplar yükleniyor…</p>
  if (state.kind === 'error') return <p className="text-xs text-red-700 dark:text-red-300">{state.message}. Paylaşım yapılmaz.</p>

  const any = state.options.length > 0
  return (
    <div className="space-y-2" aria-label="Hedef hesaplar">
      {!any && (
        <p className="text-xs text-[rgb(var(--color-muted))]">
          Bu haber için kullanabileceğiniz bağlı hesap yok. Hesaplar bölümünden platform girişiyle hesap ekleyin ya da hesabın yayın kapsamını düzenleyin.
        </p>
      )}
      {platforms.map((p) => {
        const opts = state.options.filter((o) => o.platform === p)
        if (opts.length === 0) return null
        return (
          <fieldset key={p} className="space-y-0.5">
            <legend className="text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">{LABEL[p]}</legend>
            <label className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs">
              <input type="radio" name={`target-${p}`} checked={!value[p]} onChange={() => onChange({ ...value, [p]: '' })} />
              <span className="text-[rgb(var(--color-muted))]">Bu platformda paylaşma</span>
            </label>
            {opts.map((o) => (
              <div key={o.accountId} className={cn('rounded-md px-1.5 py-1', value[p] === o.accountId && 'bg-blue-50 dark:bg-blue-950/30')}>
                <label className={cn('flex items-center gap-2 text-xs', o.selectable ? 'cursor-pointer' : 'opacity-60')}>
                  <input
                    type="radio"
                    name={`target-${p}`}
                    disabled={!o.selectable}
                    checked={value[p] === o.accountId}
                    onChange={() => onChange({ ...value, [p]: o.accountId })}
                  />
                  <span className="font-semibold text-[rgb(var(--color-text))]">{accountLabel(o)}</span>
                </label>
                {!o.selectable && (
                  <p className="ml-5 text-[11px] text-amber-700 dark:text-amber-300">
                    {o.reason}
                    {o.reconnect && o.canManage && (
                      <>
                        {' · '}
                        <Link href={o.ownerKind === 'user' || o.ownerKind === 'publisher' ? '/settings/social' : '/admin/social/accounts'} className="font-semibold underline">
                          Yeniden bağla
                        </Link>
                      </>
                    )}
                  </p>
                )}
              </div>
            ))}
          </fieldset>
        )
      })}
    </div>
  )
}

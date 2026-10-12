'use client'

/**
 * Manual share target picker (Görev 17 / 18 EK) — shared by the news list
 * popover (desktop), the mobile share sheet and the social composer.
 *
 * - One checkbox per connected account; several accounts per platform may be
 *   chosen. Nothing is preselected; a platform with no ticked account is simply
 *   not published to.
 * - No «Onyeditivi (mevcut bağlantı)» / legacy option.
 * - The list comes from /api/social/targets?newsId=…&formats=…: the user's
 *   permitted accounts with this news item's own location, the account's
 *   post/story scope, connection health, supported formats and the shared
 *   ledger (already published / uncertain) evaluated per account. The server
 *   re-checks everything at publish time.
 * - Accounts that cannot be chosen stay visible with their reason.
 * - When the news item or format changes, selections are re-validated; any
 *   target that is no longer eligible is removed and reported.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'

export type TargetPlatform = 'facebook' | 'instagram' | 'threads'
/** platform → selected account ids (empty = not published on that platform). */
export type TargetSelection = Record<TargetPlatform, string[]>
export const EMPTY_TARGETS: TargetSelection = { facebook: [], instagram: [], threads: [] }

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
  ledger?: Array<{ format: string; status: string; externalPostId: string | null }>
}

export const PLATFORM_NAME: Record<TargetPlatform, string> = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads' }

export function accountLabel(o: Pick<TargetOption, 'displayName' | 'username'>): string {
  return o.username ? `${o.displayName} (@${o.username})` : o.displayName
}

/** Selected targets → `{ platform: accountId[] }` for the API (only chosen ones). */
export function explicitTargets(sel: TargetSelection): Partial<Record<TargetPlatform, string[]>> {
  return Object.fromEntries(Object.entries(sel).filter(([, v]) => v.length > 0)) as Partial<Record<TargetPlatform, string[]>>
}

export function targetCount(sel: TargetSelection): number {
  return sel.facebook.length + sel.instagram.length + sel.threads.length
}

/** Platform flags derived from the selection (a platform is on only if it has targets). */
export function platformsOf(sel: TargetSelection) {
  return { facebook: sel.facebook.length > 0, instagram: sel.instagram.length > 0, threads: sel.threads.length > 0, twitter: false }
}

/** «Instagram · NaHaber Antalya (@antalya_nahaber_com)» lines for confirmations. */
export function selectedLabels(sel: TargetSelection, options: TargetOption[]): string[] {
  const byId = new Map(options.map((o) => [o.accountId, o]))
  return (Object.keys(sel) as TargetPlatform[]).flatMap((p) => sel[p].map((id) => `${PLATFORM_NAME[p]} · ${byId.has(id) ? accountLabel(byId.get(id)!) : id}`))
}

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; options: TargetOption[] }

export function ComposerTargetPicker({
  newsId,
  mode,
  value,
  onChange,
  onOptions,
  include,
}: {
  newsId: string
  mode: 'post' | 'story' | 'both'
  value: TargetSelection
  onChange: (next: TargetSelection) => void
  /** Lets the caller show the chosen account names in its confirmation. */
  onOptions?: (options: TargetOption[]) => void
  /** Optional narrowing (e.g. a publisher's own accounts on the publisher page). */
  include?: (o: TargetOption) => boolean
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [dropped, setDropped] = useState<string[]>([])
  const formats = mode === 'both' ? 'post,story' : mode
  const valueRef = useRef(value)
  valueRef.current = value

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
        const options = include ? body.options.filter(include) : body.options
        setState({ kind: 'ok', options })
        onOptions?.(options)
        // Re-validate the current selection against the fresh evaluation.
        const ok = new Set(options.filter((o) => o.selectable).map((o) => o.accountId))
        const byId = new Map(options.map((o) => [o.accountId, o]))
        const cur = valueRef.current
        const gone: string[] = []
        const next: TargetSelection = { facebook: [], instagram: [], threads: [] }
        for (const p of Object.keys(next) as TargetPlatform[]) {
          for (const id of cur[p] ?? []) {
            if (ok.has(id)) next[p].push(id)
            else gone.push(`${PLATFORM_NAME[p]} · ${byId.has(id) ? accountLabel(byId.get(id)!) : id}${byId.get(id)?.reason ? ` — ${byId.get(id)!.reason}` : ''}`)
          }
        }
        setDropped(gone)
        if (gone.length) onChange(next)
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

  const toggle = (p: TargetPlatform, id: string) => {
    const has = value[p].includes(id)
    onChange({ ...value, [p]: has ? value[p].filter((x) => x !== id) : [...value[p], id] })
  }
  const any = state.options.length > 0
  const count = targetCount(value)
  const chosen = selectedLabels(value, state.options)
  return (
    <div className="space-y-2" aria-label="Hedef hesaplar">
      {!any && (
        <p className="text-xs text-[rgb(var(--color-muted))]">
          Kullanabileceğiniz bağlı hesap yok — paylaşım yapılmaz.{' '}
          <Link href="/admin/social/accounts" className="font-semibold text-[rgb(var(--color-text))] underline">
            Önce hesap bağla
          </Link>
        </p>
      )}
      {dropped.length > 0 && (
        <div role="status" className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-semibold">Artık uygun olmayan hedefler seçimden çıkarıldı:</p>
          <ul className="list-disc pl-4">
            {dropped.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      )}
      {platforms.map((p) => {
        const opts = state.options.filter((o) => o.platform === p)
        if (opts.length === 0) return null
        return (
          <fieldset key={p} className="space-y-0.5">
            <legend className="text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
              {PLATFORM_NAME[p]} {value[p].length > 0 ? `· ${value[p].length} seçili` : '· seçilmezse bu platformda paylaşılmaz'}
            </legend>
            {opts.map((o) => {
              const on = value[p].includes(o.accountId)
              return (
                <div key={o.accountId} className={cn('rounded-md px-1.5 py-1', on && 'bg-blue-50 dark:bg-blue-950/30')}>
                  <label className={cn('flex items-center gap-2 text-xs', o.selectable ? 'cursor-pointer' : 'opacity-60')}>
                    <input type="checkbox" disabled={!o.selectable} checked={on} onChange={() => toggle(p, o.accountId)} />
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
              )
            })}
          </fieldset>
        )
      })}
      {any && (
        <div className="rounded-md bg-[rgb(var(--color-surface))] px-2 py-1.5 text-[11px]">
          <p className="font-semibold text-[rgb(var(--color-text))]">Seçilen uygun hesaplar: {count} hedef</p>
          {chosen.length > 0 ? (
            <ul className="list-disc pl-4 text-[rgb(var(--color-muted))]">
              {chosen.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[rgb(var(--color-muted))]">Henüz hesap seçilmedi; paylaşım yapılmaz.</p>
          )}
        </div>
      )}
    </div>
  )
}

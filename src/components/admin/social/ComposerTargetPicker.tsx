'use client'

/**
 * Composer target account picker — one target per platform.
 *
 * - Default is ALWAYS "Onyeditivi (mevcut bağlantı)" = the unchanged legacy
 *   path. A connected account is used only when explicitly chosen.
 * - Only the public account model is shown (no secrets reach the browser).
 * - Accounts that are paused / disabled / need reauth / expired / unverified
 *   or can't publish the chosen format are listed but not selectable. A
 *   previously chosen account that becomes unsuitable (e.g. mode change) is
 *   flagged — never silently swapped for Onyeditivi; the server also rejects it.
 * - Only central managers can list accounts; others keep the legacy path.
 */
import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase/auth'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { TARGET_BLOCKER_TEXT, targetBlocker, type ComposerMode } from '@/lib/social/accounts/capabilities'
import type { SocialAccountPublic } from '@/lib/social/accounts/types'

export type TargetPlatform = 'facebook' | 'instagram' | 'threads'
export type TargetSelection = Record<TargetPlatform, string>
export const LEGACY_TARGET = 'legacy'
export const DEFAULT_TARGETS: TargetSelection = { facebook: LEGACY_TARGET, instagram: LEGACY_TARGET, threads: LEGACY_TARGET }

const LABEL: Record<TargetPlatform, string> = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads' }

type LoadState = { kind: 'loading' } | { kind: 'forbidden' } | { kind: 'error' } | { kind: 'ok'; accounts: SocialAccountPublic[] }

function cityName(slug: string | null): string {
  if (!slug) return ''
  return TURKISH_PROVINCES.find((p) => p.slug === slug)?.name ?? slug
}

export function ComposerTargetPicker({
  mode,
  enabled,
  value,
  onChange,
}: {
  mode: ComposerMode
  /** Platform toggles from the composer. */
  enabled: Record<TargetPlatform, boolean>
  value: TargetSelection
  onChange: (next: TargetSelection) => void
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const token = (await auth.currentUser?.getIdToken()) ?? ''
        const res = await fetch('/api/admin/social/accounts', { headers: { Authorization: `Bearer ${token}` }, credentials: 'same-origin' })
        if (cancelled) return
        if (res.status === 401 || res.status === 403) return setState({ kind: 'forbidden' })
        if (!res.ok) return setState({ kind: 'error' })
        const body = (await res.json()) as { accounts: SocialAccountPublic[] }
        setState({ kind: 'ok', accounts: body.accounts ?? [] })
      } catch {
        if (!cancelled) setState({ kind: 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const visible = (Object.keys(LABEL) as TargetPlatform[]).filter((p) => enabled[p] && !(p === 'threads' && mode === 'story'))
  if (visible.length === 0) return null

  return (
    <div className="space-y-2" aria-label="Hedef hesaplar">
      {state.kind === 'forbidden' && (
        <p className="text-xs text-[rgb(var(--color-muted))]">
          Hedef hesap seçimi yalnızca merkez yöneticiye açık. Paylaşım mevcut Onyeditivi bağlantısıyla yapılır.
        </p>
      )}
      {state.kind === 'error' && <p className="text-xs text-red-700 dark:text-red-300">Bağlı hesaplar yüklenemedi; paylaşım mevcut Onyeditivi bağlantısıyla yapılır.</p>}
      {visible.map((p) => {
        const accounts = state.kind === 'ok' ? state.accounts.filter((a) => a.platform === p) : []
        const selectedAccount = accounts.find((a) => a.id === value[p])
        return (
          <label key={p} className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">{LABEL[p]} hedefi</span>
            <select
              value={value[p]}
              disabled={state.kind !== 'ok'}
              onChange={(e) => onChange({ ...value, [p]: e.target.value })}
              className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5 text-sm"
            >
              <option value={LEGACY_TARGET}>Onyeditivi (mevcut bağlantı)</option>
              {accounts.map((a) => {
                const blocker = targetBlocker(a, mode, Date.now())
                const owner = [cityName(a.ownership.citySlug), a.ownership.publisherId ? `Yayıncı: ${a.ownership.publisherId}` : ''].filter(Boolean).join(' · ')
                return (
                  <option key={a.id} value={a.id} disabled={!!blocker}>
                    {a.displayName}
                    {a.username ? ` @${a.username}` : ''}
                    {owner ? ` — ${owner}` : ''}
                    {blocker ? ` (${TARGET_BLOCKER_TEXT[blocker]})` : ''}
                  </option>
                )
              })}
            </select>
            {state.kind === 'ok' && accounts.length === 0 && (
              <span className="mt-1 block text-xs text-[rgb(var(--color-muted))]">Bu platformda bağlı hesap yok.</span>
            )}
            {selectedAccount && targetBlocker(selectedAccount, mode, Date.now()) && (
              <span role="alert" className="mt-1 block text-xs font-semibold text-red-700 dark:text-red-300">
                Seçili hesap bu paylaşım için uygun değil ({TARGET_BLOCKER_TEXT[targetBlocker(selectedAccount, mode, Date.now())!]}). Başka hedef seçin; Onyeditivi’ye otomatik geçilmez.
              </span>
            )}
            {selectedAccount && !targetBlocker(selectedAccount, mode, Date.now()) && (
              <span className="mt-1 block text-xs text-blue-700 dark:text-blue-300">
                Seçilen hesaba yayın yapılır; hata olursa Onyeditivi’ye geçilmez.
              </span>
            )}
          </label>
        )
      })}
    </div>
  )
}

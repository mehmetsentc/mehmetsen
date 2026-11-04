'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { socialApi, type SocialAccountRow } from '@/components/social/socialClient'

export type NetworkRule = { id: string; accountId: string; enabled: boolean; name?: string }
export type NetworkRecord = { accountId: string; status: string; updatedAt: number; platform: string; newsId: string }

/** Real data only: connected accounts, rules and ledger records visible to this admin. */
export function useSocialNetwork() {
  const [accounts, setAccounts] = useState<SocialAccountRow[]>([])
  const [rules, setRules] = useState<NetworkRule[]>([])
  const [records, setRecords] = useState<NetworkRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [a, r, h] = await Promise.all([
      socialApi<{ accounts: SocialAccountRow[] }>('/api/social/accounts'),
      socialApi<{ rules: NetworkRule[] }>('/api/social/rules'),
      socialApi<{ records: NetworkRecord[] }>('/api/social/history'),
    ])
    if (!a.ok) setError(a.error)
    else setAccounts(a.data.accounts)
    if (r.ok) setRules(r.data.rules)
    if (h.ok) setRecords(h.data.records)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const byProvince = useMemo(() => {
    const m = new Map<string, { accounts: SocialAccountRow[]; ready: number; enabledRules: number }>()
    const enabledBy = new Map<string, number>()
    for (const r of rules) if (r.enabled) enabledBy.set(r.accountId, (enabledBy.get(r.accountId) ?? 0) + 1)
    for (const a of accounts) {
      const slug = a.ownerKind === 'province' ? a.ownership.citySlug : null
      if (!slug) continue
      const row = m.get(slug) ?? { accounts: [], ready: 0, enabledRules: 0 }
      row.accounts.push(a)
      if (a.status === 'active' && !a.health.publishBlocker) row.ready += 1
      row.enabledRules += enabledBy.get(a.id) ?? 0
      m.set(slug, row)
    }
    return m
  }, [accounts, rules])

  return { accounts, rules, records, byProvince, loading, error, reload: load }
}

/**
 * ADMIN-UX-1: the one definition of «il hazır» for summary cards (Dashboard), so the
 * Dashboard, İl Ağı and the SMM map no longer show three different numbers.
 * Reads only the accounts list (one call): connected = an il has ≥ 1 province account,
 * ready = ≥ 1 of them is active with no publish blocker.
 */
export function useProvinceReach() {
  const [accounts, setAccounts] = useState<SocialAccountRow[] | null>(null)
  useEffect(() => {
    let live = true
    void socialApi<{ accounts: SocialAccountRow[] }>('/api/social/accounts').then((a) => {
      if (live) setAccounts(a.ok ? a.data.accounts : [])
    })
    return () => {
      live = false
    }
  }, [])
  return useMemo(() => {
    if (!accounts) return { loading: true, connected: 0, ready: 0, readySlugs: new Set<string>() }
    const connected = new Set<string>()
    const readySlugs = new Set<string>()
    for (const a of accounts) {
      const slug = a.ownerKind === 'province' ? a.ownership.citySlug : null
      if (!slug) continue
      connected.add(slug)
      if (a.status === 'active' && !a.health.publishBlocker) readySlugs.add(slug)
    }
    return { loading: false, connected: connected.size, ready: readySlugs.size, readySlugs }
  }, [accounts])
}

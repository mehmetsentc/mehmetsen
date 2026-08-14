'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, Map as MapIcon, RefreshCw, Zap } from 'lucide-react'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import type { SocialAutoShareSettings } from '@/lib/social/autoShareSettings'

function citySmmAgentId(slug: string): string {
  return `agent-smm-${slug.trim().toLowerCase()}`
}

type SmmAgentRow = {
  id: string
  displayName: string
  roleTemplateId: string
  status: string
  territories: string[]
}

type Props = {
  draft: SocialAutoShareSettings
  onChange: (next: SocialAutoShareSettings) => void
  loading: boolean
  saving: boolean
  onReload: () => void
  onSave: () => void
  btnSecondary: string
  /** When true (panel=automation), expand city matrix by default */
  focusMode?: boolean
}

export function SocialAutomationDesk({
  draft,
  onChange,
  loading,
  saving,
  onReload,
  onSave,
  btnSecondary,
  focusMode = false,
}: Props) {
  const [agents, setAgents] = useState<SmmAgentRow[]>([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [cityQuery, setCityQuery] = useState('')
  const [showAllCities, setShowAllCities] = useState(focusMode)

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/newsroom-agents', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = (await res.json()) as { agents?: SmmAgentRow[] }
      setAgents((data.agents ?? []).filter((a) => a.roleTemplateId === 'city-smm'))
    } catch {
      setAgents([])
    } finally {
      setAgentsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAgents()
  }, [loadAgents])

  useEffect(() => {
    if (focusMode) setShowAllCities(true)
  }, [focusMode])

  const byCity = useMemo(() => {
    const map = new Map<string, SmmAgentRow>()
    for (const a of agents) {
      const slug = a.territories?.[0]
      if (slug) map.set(slug, a)
    }
    return map
  }, [agents])

  const enabled = useMemo(() => new Set(draft.enabledCitySlugs), [draft.enabledCitySlugs])

  const rows = useMemo(() => {
    const needle = cityQuery.trim().toLocaleLowerCase('tr-TR')
    return TURKISH_PROVINCES.filter(
      (p) =>
        !needle ||
        p.name.toLocaleLowerCase('tr-TR').includes(needle) ||
        p.slug.includes(needle)
    ).map((p) => {
      const agent = byCity.get(p.slug)
      return {
        ...p,
        agent,
        agentId: citySmmAgentId(p.slug),
        cronOn: enabled.has(p.slug),
        agentOk: agent?.status === 'active',
      }
    })
  }, [byCity, cityQuery, enabled])

  const seededCount = rows.filter((r) => r.agent).length
  const cronCount = draft.enabledCitySlugs.length

  const toggleCity = (slug: string) => {
    const set = new Set(draft.enabledCitySlugs)
    if (set.has(slug)) set.delete(slug)
    else set.add(slug)
    const next = [...set]
    onChange({
      ...draft,
      enabledCitySlugs: next.length > 0 ? next : ['canakkale'],
    })
  }

  const enableOnlyLive = () => {
    onChange({ ...draft, enabledCitySlugs: ['canakkale'] })
  }

  const enableSeeded = () => {
    const slugs = TURKISH_PROVINCES.filter((p) => byCity.has(p.slug)).map((p) => p.slug)
    onChange({
      ...draft,
      enabledCitySlugs: slugs.length > 0 ? slugs : ['canakkale'],
    })
  }

  const Toggle = ({
    checked,
    onToggle,
    label,
    hint,
  }: {
    checked: boolean
    onToggle: (v: boolean) => void
    label: string
    hint: string
  }) => (
    <label className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-2.5 py-2">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 rounded border-[rgb(var(--color-border))] text-blue-600"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold text-[rgb(var(--color-text))]">{label}</span>
        <span className="block truncate text-[10px] text-[rgb(var(--color-muted))]">{hint}</span>
      </span>
    </label>
  )

  return (
    <section
      id="smm-automation"
      className="scroll-mt-24 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[rgb(var(--color-border))] px-3 py-2.5">
        <Zap className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-bold text-[rgb(var(--color-text))]">Otomasyonlar</h3>
        {(loading || agentsLoading) && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[rgb(var(--color-muted))]" />
        )}
        <span className="text-[10px] text-[rgb(var(--color-muted))]">
          Cron iller {cronCount} · SMM ajan {seededCount}/81
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <button type="button" onClick={onReload} disabled={loading} className={btnSecondary}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Yenile
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Kaydet
          </button>
        </div>
      </div>

      <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Toggle
          checked={draft.autoPost}
          onToggle={(v) => onChange({ ...draft, autoPost: v })}
          label="Otomatik Post"
          hint={`Cron · ${cronCount} il`}
        />
        <Toggle
          checked={draft.autoStory}
          onToggle={(v) => onChange({ ...draft, autoStory: v })}
          label="Otomatik Hikâye"
          hint="Gündem / öne çıkan"
        />
        <Toggle
          checked={draft.autoOnPublish}
          onToggle={(v) => onChange({ ...draft, autoOnPublish: v })}
          label="Yayında anlık"
          hint="CMS publish → paylaş"
        />
        <Toggle
          checked={draft.metaAiRewrite !== false}
          onToggle={(v) => onChange({ ...draft, metaAiRewrite: v })}
          label="Meta AI"
          hint="Llama caption"
        />
      </div>

      <div className="border-t border-[rgb(var(--color-border))] px-3 py-2.5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <MapIcon className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs font-bold text-[rgb(var(--color-text))]">81 İl SMM + cron</span>
          <input
            value={cityQuery}
            onChange={(e) => setCityQuery(e.target.value)}
            placeholder="İl ara…"
            className="h-7 w-36 rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-2 text-xs text-[rgb(var(--color-text))] outline-none"
          />
          <button
            type="button"
            onClick={enableOnlyLive}
            className="rounded-md border border-[rgb(var(--color-border))] px-2 py-1 text-[10px] font-semibold text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
          >
            Sadece Çanakkale
          </button>
          <button
            type="button"
            onClick={enableSeeded}
            className="rounded-md border border-[rgb(var(--color-border))] px-2 py-1 text-[10px] font-semibold text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
          >
            Seed’li ajanlar
          </button>
          <Link
            href="/admin/smm"
            className="ml-auto text-[10px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            81 İl SMM →
          </Link>
          <button
            type="button"
            onClick={() => setShowAllCities((v) => !v)}
            className="text-[10px] font-semibold text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
          >
            {showAllCities ? 'Listeyi daralt' : '81 ili göster'}
          </button>
        </div>

        {showAllCities ? (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-[rgb(var(--color-border))]">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-[rgb(var(--color-surface))] text-[10px] uppercase tracking-wide text-[rgb(var(--color-muted))]">
                <tr>
                  <th className="px-2 py-1.5">Cron</th>
                  <th className="px-2 py-1.5">İl</th>
                  <th className="px-2 py-1.5">SMM ajan</th>
                  <th className="px-2 py-1.5">Durum</th>
                  <th className="px-2 py-1.5">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--color-border))]">
                {rows.map((r) => (
                  <tr
                    key={r.slug}
                    className={cn(
                      'hover:bg-[rgb(var(--color-surface))]/80',
                      r.cronOn && 'bg-emerald-500/5'
                    )}
                  >
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded"
                        checked={r.cronOn}
                        onChange={() => toggleCity(r.slug)}
                        aria-label={`${r.name} cron`}
                      />
                    </td>
                    <td className="px-2 py-1 font-semibold text-[rgb(var(--color-text))]">{r.name}</td>
                    <td className="px-2 py-1 font-mono text-[10px] text-[rgb(var(--color-muted))]">
                      {r.agent?.displayName ?? r.agentId}
                    </td>
                    <td className="px-2 py-1">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                          r.agentOk
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : r.agent
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]'
                        )}
                      >
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            r.agentOk ? 'bg-emerald-500' : r.agent ? 'bg-amber-400' : 'bg-slate-400'
                          )}
                        />
                        {r.agentOk ? 'Aktif' : r.agent ? 'Uyarı' : 'Seed yok'}
                      </span>
                    </td>
                    <td className="px-2 py-1">
                      <Link
                        href={`/admin/smm?city=${encodeURIComponent(r.slug)}`}
                        className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Paylaşımlar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[11px] text-[rgb(var(--color-muted))]">
            Cron şu an:{' '}
            <strong className="text-[rgb(var(--color-text))]">
              {draft.enabledCitySlugs.join(', ')}
            </strong>
            . 81 ili yönetmek için «81 ili göster».
          </p>
        )}
      </div>
    </section>
  )
}

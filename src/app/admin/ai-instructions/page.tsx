'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AdminOsEmptyState,
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import type { InstructionLayer, InstructionSet } from '@/types/newsroomOs'
import toast from 'react-hot-toast'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const LAYER_ORDER: InstructionLayer[] = [
  'global',
  'department',
  'role',
  'location',
  'agent',
  'task',
  'news',
]

export default function AiInstructionsPage() {
  const [sets, setSets] = useState<InstructionSet[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [versionBody, setVersionBody] = useState<string>('')
  const [effectivePreview, setEffectivePreview] = useState<string>('')
  const [agentId, setAgentId] = useState('agent-fact-check')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/instructions', { headers: await authHeaders() })
      const body = (await res.json()) as { sets?: InstructionSet[]; error?: string }
      if (!res.ok) throw new Error(body.error || 'fail')
      setSets(body.sets ?? [])
      if (!selectedId && body.sets?.[0]) setSelectedId(body.sets[0].id)
    } catch {
      setSets([])
    }
  }, [selectedId])

  useEffect(() => {
    void load()
  }, [load])

  const selected = useMemo(() => sets.find((s) => s.id === selectedId) ?? null, [sets, selectedId])

  useEffect(() => {
    if (!selectedId) {
      setVersionBody('')
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/instructions?setId=${encodeURIComponent(selectedId)}&versions=1`,
          { headers: await authHeaders() }
        )
        const body = (await res.json()) as {
          versions?: Array<{ content?: string; version?: number; changelog?: string | null }>
          error?: string
        }
        if (!res.ok || cancelled) return
        const latest = body.versions?.[0]
        if (!latest?.content) {
          setVersionBody('(aktif sürüm içeriği yok — seed veya learning deploy gerekir)')
          return
        }
        const meta = `v${latest.version ?? '?'}${latest.changelog ? ` · ${latest.changelog}` : ''}\n\n`
        setVersionBody(meta + latest.content)
      } catch {
        if (!cancelled) setVersionBody('(sürüm yüklenemedi)')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const byLayer = useMemo(() => {
    const map = new Map<InstructionLayer, InstructionSet[]>()
    for (const layer of LAYER_ORDER) map.set(layer, [])
    for (const s of sets) {
      const list = map.get(s.layer) ?? []
      list.push(s)
      map.set(s.layer, list)
    }
    return map
  }, [sets])

  const seed = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'seed' }),
      })
      const body = (await res.json()) as { created?: string[]; updated?: string[]; error?: string }
      if (!res.ok) throw new Error(body.error || 'fail')
      toast.success(
        `Talimat seed: ${(body.created ?? []).length} yeni, ${(body.updated ?? []).length} güncellendi`
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Seed başarısız')
    } finally {
      setBusy(false)
    }
  }

  const previewEffective = async () => {
    try {
      const res = await fetch(
        `/api/admin/instructions?agentId=${encodeURIComponent(agentId)}`,
        { headers: await authHeaders() }
      )
      const body = (await res.json()) as {
        effective?: { combinedText?: string }
        error?: string
      }
      if (!res.ok) throw new Error(body.error || 'fail')
      setEffectivePreview(body.effective?.combinedText || '(boş — önce seed çalıştırın)')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Önizleme hatası')
    }
  }

  return (
    <AdminOsPageShell
      title="AI Talimatlar"
      subtitle="Global → department → role → location → agent — versiyonlu inheritance"
      actions={
        <button
          type="button"
          disabled={busy}
          onClick={() => void seed()}
          className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Seed…' : 'Varsayılan talimatları seed et'}
        </button>
      }
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Set', value: String(sets.length), tone: 'ok' },
          { label: 'Global', value: String(byLayer.get('global')?.length ?? 0) },
          { label: 'Department', value: String(byLayer.get('department')?.length ?? 0) },
          { label: 'Role', value: String(byLayer.get('role')?.length ?? 0), tone: 'ai' },
          { label: 'Location', value: String(byLayer.get('location')?.length ?? 0) },
        ]}
      />

      {sets.length === 0 ? (
        <AdminOsEmptyState
          title="Instruction set yok"
          description="Seed ile Global Editorial + department/role/location kurallarını oluşturun."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
          <div className="max-h-[70vh] space-y-3 overflow-y-auto rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3">
            {LAYER_ORDER.map((layer, idx) => {
              const list = byLayer.get(layer) ?? []
              if (list.length === 0 && (layer === 'task' || layer === 'news' || layer === 'agent')) {
                return (
                  <div key={layer} className="rounded-xl bg-[rgb(var(--color-surface))] px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                      {idx + 1}. {layer}
                    </p>
                    <p className="text-xs text-[rgb(var(--color-muted))]">
                      {layer === 'agent' ? 'Ajan customInstructions' : 'Runtime bağlamında eklenir'}
                    </p>
                  </div>
                )
              }
              return (
                <div key={layer}>
                  <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                    {idx + 1}. {layer}
                  </p>
                  <div className="space-y-1">
                    {list.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        className={cn(
                          'flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm',
                          selectedId === s.id
                            ? 'bg-[rgb(var(--color-brand))]/10 font-semibold'
                            : 'hover:bg-[rgb(var(--color-surface))]'
                        )}
                      >
                        <span>{s.title}</span>
                        <span className="text-[10px] text-[rgb(var(--color-muted))]">
                          v{s.activeVersion ?? '—'} · {s.status} · {s.scopeKey}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
              {!selected ? (
                <p className="text-sm text-[rgb(var(--color-muted))]">Set seçin</p>
              ) : (
                <>
                  <h2 className="text-lg font-bold">{selected.title}</h2>
                  <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
                    {selected.id} · layer={selected.layer} · aktif sürüm={selected.activeVersion ?? '—'}
                  </p>
                  <pre className="mt-3 max-h-[320px] overflow-auto rounded-xl bg-[rgb(var(--color-surface))] p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
                    {versionBody || 'Yükleniyor…'}
                  </pre>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
              <h3 className="admin-section-title mb-2">Effective Prompt önizleme</h3>
              <div className="mb-2 flex flex-wrap gap-2">
                <input
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="min-w-[220px] flex-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm"
                  placeholder="agent-fact-check"
                />
                <button
                  type="button"
                  onClick={() => void previewEffective()}
                  className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold"
                >
                  Birleştir
                </button>
                <Link href="/admin/ai-org" className="rounded-lg px-3 py-2 text-xs font-semibold text-[rgb(var(--color-brand))]">
                  Org’dan ajan seç →
                </Link>
              </div>
              <pre className="max-h-[360px] overflow-auto rounded-xl bg-[rgb(var(--color-surface))] p-3 text-[11px] leading-relaxed text-[rgb(var(--color-text))] whitespace-pre-wrap">
                {effectivePreview || 'Ajan id girip Birleştir’e basın.'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </AdminOsPageShell>
  )
}

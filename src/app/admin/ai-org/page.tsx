'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AdminOsEmptyState,
  AdminOsErrorState,
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { cn } from '@/lib/utils'
import { Loader2, Network, X } from 'lucide-react'
import toast from 'react-hot-toast'

type TreeNode = {
  id: string
  displayName: string
  roleLabel: string
  departmentLabel: string
  status: string
  managerAgentId?: string | null
  depth: number
  children: string[]
  territories: string[]
  autonomyLevel: number
}

type RuntimePayload = {
  roleLabel: string
  departmentLabel: string
  manager: { id: string; displayName: string; roleTemplateId: string } | null
  subordinates: Array<{ id: string; displayName: string; roleTemplateId: string; status: string }>
  canCommunicateWith: string[]
  allowedTaskTypes: string[]
  deniedTaskTypes: string[]
  escalationRules: string[]
  reportResultToAgentId?: string | null
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AiOrgPage() {
  const { can } = useCmsAuth()
  const canManage = can('agents:manage') || can('ai:configure')
  const [tree, setTree] = useState<TreeNode[]>([])
  const [counts, setCounts] = useState({ total: 0, active: 0, smm: 0, local: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [runtime, setRuntime] = useState<RuntimePayload | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/newsroom-agents', { headers })
      const data = (await res.json()) as {
        tree?: TreeNode[]
        counts?: typeof counts
        error?: string
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setTree(data.tree ?? [])
      setCounts(data.counts ?? { total: 0, active: 0, smm: 0, local: 0 })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openNode = async (id: string) => {
    setSelectedId(id)
    setDrawerLoading(true)
    setRuntime(null)
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/admin/newsroom-agents/${id}`, { headers })
      const data = (await res.json()) as { runtime?: RuntimePayload; error?: string }
      if (!res.ok) throw new Error(data.error || 'Detay yüklenemedi')
      setRuntime(data.runtime ?? null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Detay hatası')
    } finally {
      setDrawerLoading(false)
    }
  }

  const runAction = async (action: string, label: string) => {
    if (!canManage) {
      toast.error('Yetkiniz yok')
      return
    }
    setBusy(action)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/newsroom-agents', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = (await res.json()) as {
        created?: string[]
        updated?: string[]
        error?: string
      }
      if (!res.ok) throw new Error(data.error || 'İşlem başarısız')
      toast.success(
        `${label}: ${(data.created ?? []).length} yeni, ${(data.updated ?? []).length} güncellendi`
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setBusy(null)
    }
  }

  const selected = useMemo(() => tree.find((n) => n.id === selectedId) ?? null, [tree, selectedId])

  // Collapse deep SMM/local lists under parents for readability
  const visible = useMemo(() => {
    return tree.filter((n) => {
      if (n.roleLabel === 'İl SMM' && n.depth > 2) return false
      if (n.roleLabel === 'Yerel Editör' && n.depth > 2) return false
      return true
    })
  }, [tree])

  const smmCount = counts.smm
  const localCount = counts.local

  return (
    <AdminOsPageShell
      title="AI Organizasyonu"
      subtitle="Hiyerarşik ajan ağı — tıkla, runtime context gör"
      actions={
        canManage ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => {
                if (
                  !confirm(
                    'Çekirdek org + 81 SMM + yerel editör sync + varsayılan talimatlar seed edilecek. Devam?'
                  )
                )
                  return
                void runAction('seed-all', 'Tam seed')
              }}
              className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === 'seed-all' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                'Tam Seed (Org + SMM + Talimat)'
              )}
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void runAction('seed-core', 'Çekirdek org')}
              className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold text-[rgb(var(--color-text))] hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === 'seed-core' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Çekirdek Org'}
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void runAction('sync-local-editors', 'Yerel editör sync')}
              className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold text-[rgb(var(--color-text))] hover:bg-slate-50 disabled:opacity-50"
            >
              Yerel Editörleri Bağla
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => {
                if (!confirm('81 İl SMM ajanı oluşturulacak. Devam?')) return
                void runAction('seed-smm-81', '81 SMM')
              }}
              className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold text-[rgb(var(--color-text))] hover:bg-slate-50 disabled:opacity-50"
            >
              81 İl SMM
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void runAction('seed-instructions', 'Talimatlar')}
              className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold text-[rgb(var(--color-text))] hover:bg-slate-50 disabled:opacity-50"
            >
              Talimat Seed
            </button>
          </div>
        ) : null
      }
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Toplam ajan', value: String(counts.total), tone: 'ai' },
          { label: 'Aktif', value: String(counts.active), tone: 'ok' },
          { label: 'Yerel editör', value: String(localCount) },
          { label: 'İl SMM', value: `${smmCount}/81` },
        ]}
      />

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : error ? (
        <AdminOsErrorState description={error} onRetry={() => void load()} />
      ) : tree.length === 0 ? (
        <AdminOsEmptyState
          title="Organizasyon henüz seed edilmedi"
          description="Çekirdek org seed ile Genel Yayın Yönetmeni → masalar → Social Director ağacını oluştur."
          icon={Network}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[rgb(var(--color-text))]">Organizasyon ağacı</h2>
              <p className="text-[11px] text-[rgb(var(--color-muted))]">
                SMM {smmCount}/81 · Yerel {localCount} (özet görünüm)
              </p>
            </div>
            <div className="space-y-1">
              {visible.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => void openNode(node.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    selectedId === node.id
                      ? 'bg-[rgb(var(--color-brand))]/10 ring-1 ring-[rgb(var(--color-brand))]/20'
                      : 'hover:bg-slate-50'
                  )}
                  style={{ paddingLeft: 12 + node.depth * 18 }}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold',
                      node.status === 'active' ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-500'
                    )}
                  >
                    AI
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[rgb(var(--color-text))]">{node.displayName}</span>
                    <span className="block truncate text-[11px] text-[rgb(var(--color-muted))]">
                      {node.roleLabel} · {node.departmentLabel} · L{node.autonomyLevel}
                    </span>
                  </span>
                  {node.children.length > 0 ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {node.children.length}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {(smmCount > 0 || localCount > 0) && (
              <p className="mt-3 text-[11px] text-[rgb(var(--color-muted))]">
                Derin yerel/SMM düğümleri özetlendi — detay için parent düğümü aç veya AI Ajanlar listesine bak.
              </p>
            )}
          </div>

          <aside className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
            {!selectedId ? (
              <p className="py-10 text-center text-sm text-[rgb(var(--color-muted))]">Bir ajan seçin</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[rgb(var(--color-text))]">{selected?.displayName}</h3>
                    <p className="text-[11px] text-[rgb(var(--color-muted))]">
                      {selected?.roleLabel} · {selected?.departmentLabel}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(null)
                      setRuntime(null)
                    }}
                    className="rounded-lg p-1 text-[rgb(var(--color-muted))] hover:bg-slate-100 hover:text-[rgb(var(--color-text))]"
                    aria-label="Kapat"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {drawerLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
                  </div>
                ) : runtime ? (
                  <div className="space-y-3 text-xs text-[rgb(var(--color-text))]">
                    <Row label="Yönetici" value={runtime.manager?.displayName ?? '— (kök)'} />
                    <Row
                      label="Rapor"
                      value={runtime.reportResultToAgentId ?? '—'}
                    />
                    <Row
                      label="Bağlı ajanlar"
                      value={
                        runtime.subordinates.length
                          ? runtime.subordinates.map((s) => s.displayName).join(', ')
                          : '—'
                      }
                    />
                    <Row
                      label="İletişim"
                      value={`${runtime.canCommunicateWith.length} ajan`}
                    />
                    <div>
                      <p className="mb-1 font-semibold text-[rgb(var(--color-muted))]">Yapabilir</p>
                      <div className="flex flex-wrap gap-1">
                        {runtime.allowedTaskTypes.map((t) => (
                          <span key={t} className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 font-semibold text-[rgb(var(--color-muted))]">Escalation</p>
                      <ul className="list-disc space-y-1 pl-4 text-[rgb(var(--color-muted))]">
                        {runtime.escalationRules.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[rgb(var(--color-muted))]">Runtime context yok</p>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </AdminOsPageShell>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-semibold text-[rgb(var(--color-muted))]">{label}</p>
      <p className="mt-0.5 text-[rgb(var(--color-text))]">{value}</p>
    </div>
  )
}

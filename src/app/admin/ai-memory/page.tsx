'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AdminOsEmptyState,
  AdminOsErrorState,
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import type { EditorialMemoryRecord } from '@/types/newsroomOs'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function formatExpiry(expiresAt: number | null | undefined): string | null {
  if (!expiresAt) return null
  const days = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'süresi dolmuş'
  return `TTL ${days}g`
}

export default function AiMemoryPage() {
  const [memories, setMemories] = useState<EditorialMemoryRecord[]>([])
  const [content, setContent] = useState('')
  const [ttlDays, setTtlDays] = useState<number | ''>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/os-ops?resource=memory', { headers: await authHeaders() })
      const body = (await res.json()) as { memories?: EditorialMemoryRecord[]; error?: string }
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setMemories(body.memories ?? [])
    } catch (e) {
      setMemories([])
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    if (!content.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/os-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          resource: 'memory',
          scope: 'shared',
          type: 'editorialRule',
          content,
          ttlDays: typeof ttlDays === 'number' && ttlDays > 0 ? ttlDays : null,
        }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'fail')
      setContent('')
      setTtlDays('')
      toast.success('Hafıza kaydı eklendi')
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kayıt başarısız')
    } finally {
      setBusy(false)
    }
  }

  const seed = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/os-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ resource: 'memory', action: 'seed' }),
      })
      const body = (await res.json()) as { created?: string[]; skipped?: string[]; error?: string }
      if (!res.ok) throw new Error(body.error || 'fail')
      toast.success(
        `Hafıza seed: ${(body.created ?? []).length} yeni, ${(body.skipped ?? []).length} atlandı`
      )
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Seed başarısız')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminOsPageShell
      title="AI Hafıza"
      subtitle="Agent memory + shared newsroom memory (TTL destekli)"
      actions={
        <button
          type="button"
          disabled={busy}
          onClick={() => void seed()}
          className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Örnek hafızayı seed et'}
        </button>
      }
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Kayıt', value: loading ? '…' : String(memories.length) },
          { label: 'Shared', value: String(memories.filter((m) => m.scope === 'shared').length), tone: 'ok' },
          { label: 'Agent', value: String(memories.filter((m) => m.scope === 'agent').length), tone: 'ai' },
          { label: 'Doğrulanmış', value: String(memories.filter((m) => m.verified).length) },
        ]}
      />

      <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
        <p className="mb-2 text-xs font-semibold text-[rgb(var(--color-text))]">Yeni kurumsal hafıza</p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="Doğrulanmış editorial kural / düzeltme / kaynak notu…"
          className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-[rgb(var(--color-muted))]">
            TTL (gün)
            <input
              type="number"
              min={0}
              placeholder="∞"
              value={ttlDays}
              onChange={(e) => {
                const v = e.target.value
                setTtlDays(v === '' ? '' : Math.max(0, Number(v) || 0))
              }}
              className="w-20 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={busy || !content.trim()}
            onClick={() => void create()}
            className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            Shared memory kaydet
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <AdminOsErrorState description={error} onRetry={() => void load()} />
      ) : memories.length === 0 ? (
        <AdminOsEmptyState
          title="Hafıza boş"
          description="Geçici haber bilgisi sonsuza kadar saklanmaz. Doğrulanmış kurumsal notlar buraya eklenir — veya örnek seed ile başlatın."
        />
      ) : (
        <div className="divide-y divide-[rgb(var(--color-border))] overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          {memories.map((m) => {
            const ttl = formatExpiry(m.expiresAt)
            return (
              <div key={`${m.scope}-${m.id}`} className="px-4 py-3">
                <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase text-[rgb(var(--color-muted))]">
                  <span>{m.scope}</span>
                  <span>{m.type}</span>
                  {m.agentId ? <span>{m.agentId}</span> : null}
                  {m.verified ? <span className="text-emerald-600">verified</span> : null}
                  {ttl ? <span className="text-amber-600">{ttl}</span> : <span>kalıcı</span>}
                </div>
                <p className="mt-1 text-sm text-[rgb(var(--color-text))]">{m.content}</p>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-[11px] text-[rgb(var(--color-muted))]">
        Öğrenme önerileri:{' '}
        <Link href="/admin/ai-learning" className="font-semibold text-[rgb(var(--color-brand))]">
          Öğrenme Merkezi
        </Link>
      </p>
    </AdminOsPageShell>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AdminOsEmptyState,
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import type { EditorialMemoryRecord } from '@/types/newsroomOs'
import toast from 'react-hot-toast'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AiMemoryPage() {
  const [memories, setMemories] = useState<EditorialMemoryRecord[]>([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/os-ops?resource=memory', { headers: await authHeaders() })
      const body = (await res.json()) as { memories?: EditorialMemoryRecord[]; error?: string }
      if (!res.ok) throw new Error(body.error || 'fail')
      setMemories(body.memories ?? [])
    } catch {
      setMemories([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    if (!content.trim()) return
    try {
      const res = await fetch('/api/admin/os-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ resource: 'memory', scope: 'shared', type: 'editorialRule', content }),
      })
      if (!res.ok) throw new Error('fail')
      setContent('')
      toast.success('Hafıza kaydı eklendi')
      void load()
    } catch {
      toast.error('Kayıt başarısız')
    }
  }

  return (
    <AdminOsPageShell title="AI Hafıza" subtitle="Agent memory + shared newsroom memory (TTL destekli)">
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
        <button
          type="button"
          onClick={() => void create()}
          className="mt-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white"
        >
          Shared memory kaydet
        </button>
      </div>

      {memories.length === 0 && !loading ? (
        <AdminOsEmptyState
          title="Hafıza boş"
          description="Geçici haber bilgisi sonsuza kadar saklanmaz. Doğrulanmış kurumsal notlar buraya eklenir."
        />
      ) : (
        <div className="divide-y divide-[rgb(var(--color-border))] overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          {memories.map((m) => (
            <div key={m.id} className="px-4 py-3">
              <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase text-[rgb(var(--color-muted))]">
                <span>{m.scope}</span>
                <span>{m.type}</span>
                {m.verified ? <span className="text-emerald-600">verified</span> : null}
              </div>
              <p className="mt-1 text-sm text-[rgb(var(--color-text))]">{m.content}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-[rgb(var(--color-muted))]">
        Öğrenme önerileri: <Link href="/admin/ai-learning" className="font-semibold text-[rgb(var(--color-brand))]">Öğrenme Merkezi</Link>
      </p>
    </AdminOsPageShell>
  )
}

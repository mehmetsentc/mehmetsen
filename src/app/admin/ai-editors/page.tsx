'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { auth } from '@/lib/firebase/auth'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { Bot, Loader2, RefreshCw, Sparkles, Archive } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { AiEditorDocument } from '@/types/aiEditor'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AiEditorsAdminPage() {
  const { can } = useCmsAuth()
  const canManage = can('editors:manage') || can('ai:configure')
  const [editors, setEditors] = useState<AiEditorDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/ai-editors', { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { editors?: AiEditorDocument[] }
      setEditors(data.editors ?? [])
    } catch {
      toast.error('AI editörler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const seed = async () => {
    if (!canManage) {
      toast.error('Yetkiniz yok')
      return
    }
    setSeeding(true)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/ai-editors', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed' }),
      })
      const data = (await res.json()) as { created?: string[]; skipped?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error || 'Seed başarısız')
      toast.success(
        `Seed: ${(data.created ?? []).length} yeni, ${(data.skipped ?? []).length} atlandı`
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Seed hatası')
    } finally {
      setSeeding(false)
    }
  }

  const refreshStyles = async () => {
    if (!canManage) {
      toast.error('Yetkiniz yok')
      return
    }
    setSeeding(true)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/ai-editors', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refreshStylePrompts' }),
      })
      const data = (await res.json()) as { updated?: string[]; missing?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error || 'Yenileme başarısız')
      toast.success(`Tarz promptları güncellendi: ${(data.updated ?? []).length} editör`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yenileme hatası')
    } finally {
      setSeeding(false)
    }
  }

  const active = editors.filter((e) => e.status === 'active').length
  const columns = editors.filter((e) => e.capabilities?.columnEnabled).length

  return (
    <div className="flex flex-col">
      <CMSHeader
        title="AI Editörler"
        subtitle="Karakter, yazım tarzı ve prompt yönetimi — talimat bir kez girilir"
      />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Toplam" value={editors.length} />
          <Kpi label="Aktif" value={active} />
          <Kpi label="Köşe açık" value={columns} />
          <Kpi label="Onay politikası" value="REQUIRES_APPROVAL" small />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold text-[rgb(var(--color-text))]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Yenile
          </button>
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => void seed()}
                disabled={seeding}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-primary))] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                8 Editör Seed
              </button>
              <button
                type="button"
                onClick={() => void refreshStyles()}
                disabled={seeding}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold text-[rgb(var(--color-text))] disabled:opacity-60"
              >
                {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Tarz promptlarını yenile
              </button>
            </>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-[rgb(var(--color-muted))]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Yükleniyor…
            </div>
          ) : editors.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-[rgb(var(--color-muted))]">
              Henüz AI editör yok. Seed ile 8 varsayılan persona oluşturun.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[rgb(var(--color-border))] bg-black/[0.02] text-xs uppercase tracking-wide text-[rgb(var(--color-muted))]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Editör</th>
                  <th className="px-4 py-3 font-semibold">Uzmanlık</th>
                  <th className="px-4 py-3 font-semibold">Politika</th>
                  <th className="px-4 py-3 font-semibold">Durum</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {editors.map((editor) => (
                  <tr
                    key={editor.id}
                    className="border-b border-[rgb(var(--color-border))] last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgb(var(--color-primary))]/10 text-[rgb(var(--color-primary))]">
                          <Bot className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-[rgb(var(--color-text))]">{editor.name}</p>
                          <p className="text-xs text-[rgb(var(--color-muted))]">
                            {editor.title} · @{editor.slug}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[rgb(var(--color-muted))]">
                      {editor.primarySpecialization}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        {editor.publishPolicy}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={editor.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/ai-editors/${editor.id}`}
                        className="text-xs font-semibold text-[rgb(var(--color-primary))] hover:underline"
                      >
                        Karakter & tarz
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  small,
}: {
  label: string
  value: string | number
  small?: boolean
}) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-bold text-[rgb(var(--color-text))]',
          small ? 'text-sm' : 'text-2xl'
        )}
      >
        {value}
      </p>
    </div>
  )
}

function StatusBadge({ status }: { status: AiEditorDocument['status'] }) {
  if (status === 'archived') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[rgb(var(--color-muted))]">
        <Archive className="h-3 w-3" />
        Arşiv
      </span>
    )
  }
  if (status === 'disabled') {
    return <span className="text-xs font-medium text-red-600">Pasif</span>
  }
  return <span className="text-xs font-medium text-emerald-600">Aktif</span>
}

'use client'

/** Phase 2D — find a person by @kullanıcı adı (or e-posta for süper admin) to make an editor. */
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Search, X } from 'lucide-react'
import { adminApiFetch } from '@/lib/cms/staffScopeClient'
import type { StaffAccessTarget } from '@/components/admin/staff/StaffAccessEditor'

export function FindStaffUserDialog({
  province,
  allowEmail,
  onFound,
  onClose,
}: {
  province: string
  allowEmail: boolean
  onFound: (t: StaffAccessTarget) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const search = async () => {
    const term = q.trim().replace(/^@/, '')
    if (!term) return
    setBusy(true)
    try {
      const res = await adminApiFetch(
        `/api/admin/staff/assignments?province=${encodeURIComponent(province)}&lookup=${encodeURIComponent(term)}`
      )
      const json = (await res.json()) as { user: StaffAccessTarget | null; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Aranamadı')
      if (!json.user) throw new Error('Bu bilgiyle tek bir kullanıcı bulunamadı')
      onFound(json.user)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aranamadı')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-[rgb(var(--color-card))] p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Editör ekle</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-[rgb(var(--color-surface))]" aria-label="Kapat">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-sm text-[rgb(var(--color-muted))]">
          Kişi önce NaHaber'e üye olmalı. {allowEmail ? 'Kullanıcı adı veya e-posta' : 'Kullanıcı adı'} ile bulun, sonra
          bölümlerini ve yetkilerini seçin.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void search()}
              placeholder={allowEmail ? '@kullaniciadi veya e-posta' : '@kullaniciadi'}
              className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <button type="button" disabled={busy} onClick={() => void search()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? 'Aranıyor…' : 'Bul'}
          </button>
        </div>
      </div>
    </div>
  )
}

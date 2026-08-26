'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { MEMBER_ROLE_LABELS } from '@/lib/publisher/authorization'
import { PublisherStudioShell, studioAuthedFetch, useStudioFetch } from '@/components/publisher/studio/PublisherStudioShell'
import type { PublisherMemberRecord, PublisherMemberRole, PublisherRecord } from '@/types/publisher'

export function PublisherStudioTeamClient({
  slug,
  publisher,
}: {
  slug: string
  publisher: PublisherRecord
}) {
  const { data, loading, error } = useStudioFetch<{ members: PublisherMemberRecord[] }>(
    `/api/publisher-studio/${publisher.id}/team`
  )
  const [busy, setBusy] = useState<string | null>(null)

  const changeRole = async (memberId: string, role: PublisherMemberRole) => {
    setBusy(memberId)
    try {
      await studioAuthedFetch(`/api/publisher-studio/${publisher.id}/team/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      toast.success('Rol güncellendi')
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rol güncellenemedi')
    } finally {
      setBusy(null)
    }
  }

  return (
    <PublisherStudioShell slug={slug} publisher={publisher}>
      <h1 className="text-2xl font-black">Ekip</h1>
      {loading ? <p className="mt-4 text-sm">Yükleniyor…</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      <ul className="mt-4 space-y-2">
        {(data?.members ?? []).map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2"
          >
            <div>
              <p className="font-semibold">{member.userId}</p>
              <p className="text-xs text-[rgb(var(--color-muted))]">{member.status}</p>
            </div>
            {member.role === 'OWNER' ? (
              <span className="text-sm font-bold">{MEMBER_ROLE_LABELS.OWNER}</span>
            ) : (
              <select
                value={member.role}
                disabled={busy === member.id}
                onChange={(e) => void changeRole(member.id, e.target.value as PublisherMemberRole)}
                className="rounded border px-2 py-1 text-sm"
              >
                {(['ADMIN', 'EDITOR', 'AUTHOR', 'AD_MANAGER', 'ANALYST', 'VIEWER'] as const).map((role) => (
                  <option key={role} value={role}>
                    {MEMBER_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
    </PublisherStudioShell>
  )
}

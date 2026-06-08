'use client'

import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Shield, ShieldOff, Ban, CheckCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { User } from '@/types/user'

interface UserTableProps {
  users: User[]
  loading?: boolean
  currentUserId?: string
  onToggleBlock?: (uid: string, blocked: boolean) => void
  onToggleAdmin?: (uid: string, makeAdmin: boolean) => void
  actionLoading?: string | null
}

export function UserTable({
  users,
  loading,
  currentUserId,
  onToggleBlock,
  onToggleAdmin,
  actionLoading,
}: UserTableProps) {
  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[rgb(var(--color-border))] py-16 text-center text-[rgb(var(--color-muted))]">
        Kullanıcı bulunamadı
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[rgb(var(--color-border))]">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
          <tr>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Kullanıcı</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">E-posta</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Rol</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Gönderi</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Kayıt</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">İşlemler</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--color-border))]">
          {users.map((user) => {
            const isSelf = user.uid === currentUserId
            return (
              <tr key={user.uid} className="bg-[rgb(var(--color-card))]">
                <td className="px-4 py-3">
                  <div className="font-medium text-[rgb(var(--color-text))]">@{user.username}</div>
                  <div className="text-xs text-[rgb(var(--color-muted))]">{user.displayName}</div>
                  {user.isBlocked && (
                    <span className="mt-0.5 inline-flex rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                      Engelli
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-[rgb(var(--color-muted))]">{user.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.role === 'admin'
                        ? 'bg-brand-100 text-brand-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {user.role === 'admin' ? 'Admin' : 'Kullanıcı'}
                  </span>
                </td>
                <td className="px-4 py-3 text-[rgb(var(--color-muted))]">{user.postsCount}</td>
                <td className="px-4 py-3 text-[rgb(var(--color-muted))]">
                  {user.createdAt
                    ? formatDistanceToNow(new Date(user.createdAt), { addSuffix: true, locale: tr })
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  {!isSelf && (
                    <div className="flex items-center gap-1">
                      {onToggleBlock && (
                        <Button
                          size="sm"
                          variant={user.isBlocked ? 'primary' : 'danger'}
                          onClick={() => onToggleBlock(user.uid, !user.isBlocked)}
                          disabled={actionLoading === user.uid}
                          title={user.isBlocked ? 'Engeli Kaldır' : 'Engelle'}
                          className="!px-2"
                        >
                          {actionLoading === user.uid ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : user.isBlocked ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <Ban className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      {onToggleAdmin && user.role !== 'admin' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onToggleAdmin(user.uid, true)}
                          disabled={actionLoading === user.uid}
                          title="Admin Yap"
                          className="!px-2"
                        >
                          <Shield className="h-4 w-4" />
                        </Button>
                      )}
                      {onToggleAdmin && user.role === 'admin' && !isSelf && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onToggleAdmin(user.uid, false)}
                          disabled={actionLoading === user.uid}
                          title="Admin Yetkisini Al"
                          className="!px-2"
                        >
                          <ShieldOff className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

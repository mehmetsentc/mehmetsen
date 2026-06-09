'use client'

import { useCallback, useEffect, useState } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { db } from '@/lib/firebase/firestore'
import {
  collection, query, orderBy, limit, getDocs,
  doc, updateDoc, startAfter, where, getCountFromServer,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { Users, Search, Shield, Ban, ChevronDown, CheckCircle2, XCircle, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { CMS_ROLE_LABELS, CMS_ROLE_COLORS, type CmsRole } from '@/types/cms'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { UserRole } from '@/types/user'

interface UserRow {
  uid: string
  email: string
  displayName: string
  username: string
  role: string
  isBlocked: boolean
  isVerified: boolean
  postsCount: number
  followersCount: number
  createdAt: string
}

const ROLE_FILTERS = ['all', 'user', 'author', 'editor', 'managing_editor', 'admin', 'super_admin']
const PAGE_SIZE = 25

export default function UsersAdminPage() {
  const { can, isSuperAdmin } = useCmsAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadUsers = useCallback(async (reset = true) => {
    setLoading(true)
    try {
      let q
      if (roleFilter === 'all') {
        q = reset
          ? query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
          : query(collection(db, 'users'), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE))
      } else {
        q = reset
          ? query(collection(db, 'users'), where('role', '==', roleFilter), orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
          : query(collection(db, 'users'), where('role', '==', roleFilter), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE))
      }
      const snap = await getDocs(q)
      const rows: UserRow[] = snap.docs.map(d => {
        const data = d.data()
        const createdAtRaw = data.createdAt
        const createdAt = typeof createdAtRaw === 'number'
          ? new Date(createdAtRaw).toISOString()
          : (createdAtRaw as string) ?? new Date().toISOString()
        return {
          uid: d.id,
          email: (data.email as string) ?? '',
          displayName: (data.displayName as string) ?? '',
          username: (data.username as string) ?? '',
          role: (data.role as string) ?? 'user',
          isBlocked: data.isBlocked === true,
          isVerified: data.isVerified === true,
          postsCount: (data.postsCount as number) ?? 0,
          followersCount: (data.followersCount as number) ?? 0,
          createdAt,
        }
      })
      setUsers(prev => reset ? rows : [...prev, ...rows])
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null)
      setHasMore(snap.docs.length === PAGE_SIZE)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [roleFilter, lastDoc])

  useEffect(() => {
    setLastDoc(null)
    loadUsers(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter])

  const handleToggleBlock = async (user: UserRow) => {
    if (!can('users:ban')) return
    setActionLoading(user.uid)
    try {
      await updateDoc(doc(db, 'users', user.uid), { isBlocked: !user.isBlocked })
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, isBlocked: !u.isBlocked } : u))
      toast.success(user.isBlocked ? 'Kullanıcı engeli kaldırıldı' : 'Kullanıcı engellendi')
    } catch { toast.error('İşlem başarısız') }
    finally { setActionLoading(null) }
  }

  const handleRoleChange = async (uid: string, newRole: string) => {
    if (!can('users:assign_role')) return
    setActionLoading(uid)
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole })
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role: newRole } : u))
      toast.success('Rol güncellendi')
    } catch { toast.error('Güncelleme başarısız') }
    finally { setActionLoading(null) }
  }

  const filteredUsers = users.filter(u =>
    !search ||
    u.displayName.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase())
  )

  const roleLabelForAny = (role: string): string => {
    return CMS_ROLE_LABELS[role as CmsRole] ?? role
  }

  const roleColorForAny = (role: string): string => {
    return CMS_ROLE_COLORS[role as CmsRole] ?? 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="flex flex-col">
      <CMSHeader title="Kullanıcı Yönetimi" subtitle="Tüm platform kullanıcıları" />
      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ara..."
              className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] py-2.5 pl-9 pr-4 text-sm text-[rgb(var(--color-text))] placeholder-[rgb(var(--color-muted))] focus:border-blue-500 focus:outline-none"
            />
          </div>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2.5 text-sm text-[rgb(var(--color-text))] focus:outline-none"
          >
            <option value="all">Tüm Roller</option>
            {ROLE_FILTERS.filter(r => r !== 'all').map(r => (
              <option key={r} value={r}>{roleLabelForAny(r)}</option>
            ))}
          </select>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 text-sm text-[rgb(var(--color-muted))]">
          <span>{filteredUsers.length} kullanıcı gösteriliyor</span>
          <span>·</span>
          <span className="text-red-600 font-semibold">{filteredUsers.filter(u => u.isBlocked).length} engelli</span>
          <span>·</span>
          <span className="text-blue-600 font-semibold">{filteredUsers.filter(u => u.isVerified).length} doğrulanmış</span>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
                  {['Kullanıcı', 'Rol', 'Haberler', 'Takipçi', 'Katılım', 'Durum', 'İşlem'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--color-border))]">
                {loading && filteredUsers.length === 0 ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}><td colSpan={7} className="px-5 py-3"><div className="h-7 animate-pulse rounded bg-[rgb(var(--color-surface))]" /></td></tr>
                  ))
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-[rgb(var(--color-muted))]">Kullanıcı bulunamadı</td></tr>
                ) : filteredUsers.map(user => (
                  <tr key={user.uid} className={cn('transition-colors hover:bg-[rgb(var(--color-surface))]', user.isBlocked && 'opacity-60')}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-slate-600 text-sm font-bold text-white">
                          {user.displayName[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[rgb(var(--color-text))]">{user.displayName}</p>
                          <p className="truncate text-xs text-[rgb(var(--color-muted))]">@{user.username} · {user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {can('users:assign_role') && user.role !== 'super_admin' ? (
                        <select
                          value={user.role}
                          onChange={e => handleRoleChange(user.uid, e.target.value)}
                          disabled={actionLoading === user.uid}
                          className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-2 py-1 text-xs focus:outline-none"
                        >
                          {['user', 'author', 'editor', 'managing_editor', 'video_editor'].map(r => (
                            <option key={r} value={r}>{roleLabelForAny(r)}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', roleColorForAny(user.role))}>
                          {roleLabelForAny(user.role)}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-[rgb(var(--color-text))]">{user.postsCount}</td>
                    <td className="px-5 py-4 text-sm text-[rgb(var(--color-text))]">{user.followersCount}</td>
                    <td className="px-5 py-4 text-xs text-[rgb(var(--color-muted))]">
                      {formatDistanceToNow(new Date(user.createdAt), { locale: tr, addSuffix: true })}
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn('flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                        user.isBlocked ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                      )}>
                        {user.isBlocked ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                        {user.isBlocked ? 'Engelli' : 'Aktif'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {can('users:ban') && user.role !== 'super_admin' && (
                        <button
                          disabled={actionLoading === user.uid}
                          onClick={() => handleToggleBlock(user)}
                          className={cn('rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50',
                            user.isBlocked
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                          )}>
                          {user.isBlocked ? 'Engeli Kaldır' : 'Engelle'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="border-t border-[rgb(var(--color-border))] px-5 py-3">
              <button
                onClick={() => loadUsers(false)}
                disabled={loading}
                className="text-sm font-semibold text-blue-600 hover:underline disabled:opacity-50"
              >
                Daha fazla yükle
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

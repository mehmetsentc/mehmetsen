'use client'

import { useEffect, useState } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { db } from '@/lib/firebase/firestore'
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc } from 'firebase/firestore'
import { UserCheck, Newspaper, Plus, Search, MoreHorizontal, Mail, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { CMS_ROLE_LABELS, CMS_ROLE_COLORS, type CmsRole } from '@/types/cms'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'

interface StaffMember {
  uid: string
  email: string
  displayName: string
  photoURL?: string
  role: CmsRole
  department?: string
  articlesCount?: number
  updatedAt?: string
  createdAt?: string
}

const AUTHOR_ROLES: CmsRole[] = ['author', 'editor', 'managing_editor', 'video_editor']

export default function AuthorsAdminPage() {
  const { can, isSuperAdmin } = useCmsAuth()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const q = query(
          collection(db, 'users'),
          where('role', 'in', AUTHOR_ROLES),
          orderBy('createdAt', 'desc'),
          limit(100)
        )
        const snap = await getDocs(q)
        setStaff(snap.docs.map(d => {
          const data = d.data()
          return {
            uid: d.id,
            email: (data.email as string) ?? '',
            displayName: (data.displayName as string) ?? data.email ?? '',
            photoURL: data.photoURL as string | undefined,
            role: (data.role as CmsRole) ?? 'author',
            department: data.department as string | undefined,
            articlesCount: data.postsCount as number | undefined,
            updatedAt: data.updatedAt as string | undefined,
            createdAt: data.createdAt as string | undefined,
          }
        }))
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const handleRoleChange = async (uid: string, newRole: CmsRole) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole, updatedAt: new Date().toISOString() })
      setStaff(prev => prev.map(m => m.uid === uid ? { ...m, role: newRole } : m))
      toast.success('Rol güncellendi')
    } catch { toast.error('Güncelleme başarısız') }
  }

  const filtered = staff.filter(m =>
    !search || m.displayName.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col">
      <CMSHeader title="Yazar Yönetimi" subtitle="Editör ve yazar kadrosu" />
      <div className="p-6 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="İsim veya e-posta ara..."
            className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] py-2.5 pl-9 pr-4 text-sm text-[rgb(var(--color-text))] placeholder-[rgb(var(--color-muted))] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Yazar</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Rol</th>
                  <th className="hidden px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))] sm:table-cell">Departman</th>
                  <th className="hidden px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))] md:table-cell">Haberler</th>
                  {can('editors:manage') && <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">İşlem</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--color-border))]">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={5} className="px-5 py-4"><div className="h-8 animate-pulse rounded bg-[rgb(var(--color-surface))]" /></td></tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-[rgb(var(--color-muted))]">Yazar bulunamadı</td></tr>
                ) : filtered.map(member => (
                  <tr key={member.uid} className="transition-colors hover:bg-[rgb(var(--color-surface))]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-bold text-white">
                          {member.displayName[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{member.displayName}</p>
                          <p className="flex items-center gap-1 text-xs text-[rgb(var(--color-muted))]">
                            <Mail className="h-3 w-3" />{member.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', CMS_ROLE_COLORS[member.role])}>
                        {CMS_ROLE_LABELS[member.role]}
                      </span>
                    </td>
                    <td className="hidden px-5 py-4 text-sm text-[rgb(var(--color-muted))] sm:table-cell">
                      {member.department ?? '—'}
                    </td>
                    <td className="hidden px-5 py-4 text-right text-sm font-semibold text-[rgb(var(--color-text))] md:table-cell">
                      {member.articlesCount ?? 0}
                    </td>
                    {can('editors:manage') && (
                      <td className="px-5 py-4 text-right">
                        <select
                          value={member.role}
                          onChange={e => handleRoleChange(member.uid, e.target.value as CmsRole)}
                          className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-2 py-1.5 text-xs text-[rgb(var(--color-text))] focus:outline-none"
                        >
                          {(['author', 'editor', 'managing_editor', 'video_editor'] as CmsRole[]).map(r => (
                            <option key={r} value={r}>{CMS_ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

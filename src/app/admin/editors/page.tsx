'use client'

import { useEffect, useState } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { db } from '@/lib/firebase/firestore'
import { collection, query, where, getDocs, doc, updateDoc, addDoc } from 'firebase/firestore'
import { UserCog, Shield, CheckCircle2, XCircle, Mail, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { CMS_ROLE_LABELS, CMS_ROLE_COLORS, ROLE_PERMISSIONS, type CmsRole, type CmsPermission } from '@/types/cms'

interface EditorProfile {
  uid: string
  email: string
  displayName: string
  role: CmsRole
  isActive: boolean
  createdAt?: string
}

const EDITOR_ROLES: CmsRole[] = ['super_admin', 'managing_editor', 'editor']

export default function EditorsAdminPage() {
  const { can, isSuperAdmin, role: myRole } = useCmsAuth()
  const [editors, setEditors] = useState<EditorProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<EditorProfile | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', 'in', EDITOR_ROLES))
        const snap = await getDocs(q)
        setEditors(snap.docs.map(d => {
          const data = d.data()
          return {
            uid: d.id,
            email: (data.email as string) ?? '',
            displayName: (data.displayName as string) ?? '',
            role: (data.role as CmsRole) ?? 'editor',
            isActive: data.isBlocked !== true,
            createdAt: data.createdAt as string | undefined,
          }
        }))
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const handleToggleActive = async (editor: EditorProfile) => {
    try {
      await updateDoc(doc(db, 'users', editor.uid), { isBlocked: editor.isActive })
      setEditors(prev => prev.map(e => e.uid === editor.uid ? { ...e, isActive: !e.isActive } : e))
      toast.success(editor.isActive ? 'Editör devre dışı bırakıldı' : 'Editör aktifleştirildi')
    } catch { toast.error('Güncelleme başarısız') }
  }

  const handleRoleChange = async (uid: string, newRole: CmsRole) => {
    if (!isSuperAdmin) { toast.error('Yalnızca Süper Admin rol değiştirebilir'); return }
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole })
      setEditors(prev => prev.map(e => e.uid === uid ? { ...e, role: newRole } : e))
      toast.success('Rol güncellendi')
    } catch { toast.error('Güncelleme başarısız') }
  }

  return (
    <div className="flex flex-col">
      <CMSHeader title="Editör Yönetimi" subtitle="Editör kadrosu ve yetki matrisi" />
      <div className="p-6 space-y-6">
        {/* Editors table */}
        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-3">
            <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">Editör Kadrosu</h2>
            <span className="text-xs text-[rgb(var(--color-muted))]">{editors.length} editör</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
                  {['Editör', 'Rol', 'Durum', 'İzinler', 'İşlem'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--color-border))]">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}><td colSpan={5} className="px-5 py-4"><div className="h-8 animate-pulse rounded bg-[rgb(var(--color-surface))]" /></td></tr>
                  ))
                ) : editors.map(editor => (
                  <tr key={editor.uid} className="transition-colors hover:bg-[rgb(var(--color-surface))]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-600 text-sm font-bold text-white">
                          {editor.displayName[0]?.toUpperCase() ?? '?'}
                          {editor.role === 'super_admin' && <Crown className="absolute h-3 w-3 -top-1 -right-1 text-amber-400" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{editor.displayName}</p>
                          <p className="text-xs text-[rgb(var(--color-muted))]">{editor.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {isSuperAdmin && editor.role !== 'super_admin' ? (
                        <select
                          value={editor.role}
                          onChange={e => handleRoleChange(editor.uid, e.target.value as CmsRole)}
                          className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-2 py-1 text-xs text-[rgb(var(--color-text))] focus:outline-none"
                        >
                          {EDITOR_ROLES.filter(r => r !== 'super_admin').map(r => (
                            <option key={r} value={r}>{CMS_ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', CMS_ROLE_COLORS[editor.role])}>
                          {CMS_ROLE_LABELS[editor.role]}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn('flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
                        editor.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      )}>
                        {editor.isActive ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {editor.isActive ? 'Aktif' : 'Devre Dışı'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-[rgb(var(--color-muted))]">
                        {ROLE_PERMISSIONS[editor.role]?.length ?? 0} izin
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {editor.role !== 'super_admin' && can('editors:manage') && (
                        <button
                          onClick={() => handleToggleActive(editor)}
                          className={cn('rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                            editor.isActive ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400'
                          )}>
                          {editor.isActive ? 'Devre Dışı Bırak' : 'Aktifleştir'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Permission Matrix */}
        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="border-b border-[rgb(var(--color-border))] px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[rgb(var(--color-text))]">
              <Shield className="h-4 w-4 text-purple-600" />Yetki Matrisi
            </h2>
          </div>
          <div className="overflow-x-auto p-4">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="py-2 text-left font-bold text-[rgb(var(--color-muted))]">İzin</th>
                  {(['super_admin', 'managing_editor', 'editor', 'author', 'video_editor'] as CmsRole[]).map(r => (
                    <th key={r} className="px-3 py-2 text-center font-bold text-[rgb(var(--color-muted))]">
                      <span className={cn('rounded px-1.5 py-0.5', CMS_ROLE_COLORS[r])}>{CMS_ROLE_LABELS[r]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--color-border))]">
                {(['news:publish', 'news:delete', 'video:publish', 'users:ban', 'users:assign_role', 'cron:trigger', 'system:settings', 'ai:configure'] as CmsPermission[]).map(perm => (
                  <tr key={perm} className="hover:bg-[rgb(var(--color-surface))]">
                    <td className="py-2 font-mono text-[rgb(var(--color-text))]">{perm}</td>
                    {(['super_admin', 'managing_editor', 'editor', 'author', 'video_editor'] as CmsRole[]).map(r => (
                      <td key={r} className="px-3 py-2 text-center">
                        {ROLE_PERMISSIONS[r]?.includes(perm) ? (
                          <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                        ) : (
                          <XCircle className="mx-auto h-4 w-4 text-[rgb(var(--color-border))]" />
                        )}
                      </td>
                    ))}
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

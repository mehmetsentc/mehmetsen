'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { UserTable } from '@/components/admin/UserTable'
import { adminService } from '@/services/adminService'
import { useAuth } from '@/hooks/useAuth'
import type { User } from '@/types/user'
import type { QueryDocumentSnapshot } from 'firebase/firestore'

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const load = useCallback(
    async (reset = true, searchTerm = search) => {
      setLoading(true)
      try {
        const result = await adminService.listUsers({
          search: searchTerm || undefined,
          lastDoc: reset ? undefined : lastDoc ?? undefined,
        })
        setUsers((prev) => (reset ? result.users : [...prev, ...result.users]))
        setLastDoc(result.lastDoc)
        setHasMore(result.hasMore)
      } catch (err) {
        console.error(err)
        toast.error('Kullanıcılar yüklenemedi')
      } finally {
        setLoading(false)
      }
    },
    [search, lastDoc]
  )

  useEffect(() => {
    setLastDoc(null)
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setLastDoc(null)
    load(true, search)
  }

  const handleToggleBlock = async (uid: string, blocked: boolean) => {
    setActionLoading(uid)
    try {
      await adminService.setUserBlocked(uid, blocked)
      toast.success(blocked ? 'Kullanıcı engellendi' : 'Engel kaldırıldı')
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, isBlocked: blocked } : u))
      )
    } catch {
      toast.error('İşlem başarısız')
    } finally {
      setActionLoading(null)
    }
  }

  const handleToggleAdmin = async (uid: string, makeAdmin: boolean) => {
    if (makeAdmin && !confirm('Bu kullanıcıyı admin yapmak istediğinize emin misiniz?')) return
    setActionLoading(uid)
    try {
      await adminService.setUserRole(uid, makeAdmin ? 'admin' : 'user')
      toast.success(makeAdmin ? 'Admin yetkisi verildi' : 'Admin yetkisi alındı')
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, role: makeAdmin ? 'admin' : 'user' } : u))
      )
    } catch {
      toast.error('İşlem başarısız')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[rgb(var(--color-text))]">Kullanıcılar</h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
          Kullanıcıları yönetin, engelleyin veya admin yapın
        </p>
      </div>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kullanıcı adı ara..."
            className="pl-9"
          />
        </div>
        <Button type="submit">Ara</Button>
        {search && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setSearch('')
              setLastDoc(null)
              load(true, '')
            }}
          >
            Temizle
          </Button>
        )}
      </form>

      <UserTable
        users={users}
        loading={loading}
        currentUserId={currentUser?.uid}
        onToggleBlock={handleToggleBlock}
        onToggleAdmin={handleToggleAdmin}
        actionLoading={actionLoading}
      />

      {hasMore && !loading && !search && (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={() => load(false)}>
            Daha Fazla Yükle
          </Button>
        </div>
      )}
    </div>
  )
}

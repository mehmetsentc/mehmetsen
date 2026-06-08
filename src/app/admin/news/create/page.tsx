'use client'

import { useAuth } from '@/hooks/useAuth'
import { AdminNewsForm } from '@/components/admin/AdminNewsForm'

export default function AdminNewsCreatePage() {
  const { user } = useAuth()

  if (!user) return null

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[rgb(var(--color-text))]">Yeni Haber</h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
          Admin haberi doğrudan yayınlanır
        </p>
      </div>
      <AdminNewsForm mode="create" userId={user.uid} username={user.username} />
    </div>
  )
}

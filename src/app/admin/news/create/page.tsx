'use client'

import { useAuth } from '@/hooks/useAuth'
import { AdminNewsEditor } from '@/components/admin/AdminNewsEditor'

export default function AdminNewsCreatePage() {
  const { user } = useAuth()

  if (!user) return null

  return (
    <div className="p-0 md:p-6 lg:p-8">
      <AdminNewsEditor
        mode="create"
        variant="page"
        userId={user.uid}
        username={user.username}
      />
    </div>
  )
}

'use client'

import { AdminGuard } from '@/components/admin/AdminGuard'
import { AdminMobileNav } from '@/components/admin/AdminMobileNav'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <div className="flex min-h-screen bg-[rgb(var(--color-bg))]">
        <div className="hidden md:block">
          <AdminSidebar />
        </div>
        <main className="flex-1 overflow-auto">
          <AdminMobileNav />
          {children}
        </main>
      </div>
    </AdminGuard>
  )
}

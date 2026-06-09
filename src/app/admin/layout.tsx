'use client'

import { AdminGuard } from '@/components/admin/AdminGuard'
import { CMSSidebar } from '@/components/admin/CMSSidebar'
import { AdminMobileNav } from '@/components/admin/AdminMobileNav'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <div className="flex h-screen overflow-hidden bg-[rgb(var(--color-bg))]">
        {/* Enterprise CMS sidebar — desktop only */}
        <div className="hidden lg:block">
          <CMSSidebar />
        </div>

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="lg:hidden">
            <AdminMobileNav />
          </div>
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </AdminGuard>
  )
}

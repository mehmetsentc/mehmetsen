'use client'

import { Suspense } from 'react'
import { AdminGuard } from '@/components/admin/AdminGuard'
import { CMSSidebar } from '@/components/admin/CMSSidebar'
import { MobileAdminProvider, useMobileAdmin } from '@/components/admin/mobile/MobileAdminContext'
import { MobileAdminHeader } from '@/components/admin/mobile/MobileAdminHeader'
import { MobileAdminBottomNav } from '@/components/admin/mobile/MobileAdminBottomNav'
import { MobileCreateSheet } from '@/components/admin/mobile/MobileCreateSheet'
import { MobileSearchSheet } from '@/components/admin/mobile/MobileSearchSheet'
import { MobileNotificationsSheet } from '@/components/admin/mobile/MobileNotificationsSheet'

function AdminMain({ children }: { children: React.ReactNode }) {
  const { hideChrome } = useMobileAdmin()
  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
      <div className={hideChrome ? 'min-w-0' : 'min-w-0 max-md:pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))]'}>
        {children}
      </div>
    </main>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <MobileAdminProvider>
        <div className="admin-shell flex h-screen min-w-0 overflow-hidden bg-[rgb(var(--color-bg))]">
          <div className="hidden md:block">
            <Suspense fallback={<div className="h-screen w-[248px] bg-[rgb(var(--admin-sidebar))]" />}>
              <CMSSidebar />
            </Suspense>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-hidden">
            <MobileAdminHeader />
            <AdminMain>{children}</AdminMain>
            <MobileAdminBottomNav />
            <MobileCreateSheet />
            <MobileSearchSheet />
            <MobileNotificationsSheet />
          </div>
        </div>
      </MobileAdminProvider>
    </AdminGuard>
  )
}

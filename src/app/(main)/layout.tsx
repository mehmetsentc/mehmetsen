import { AuthGuard } from '@/components/auth/AuthGuard'
import { Navbar } from '@/components/layout/Navbar'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireAuth>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex gap-6">
            <Sidebar />
            <main className="min-w-0 flex-1 py-4 pb-24 lg:pb-4">{children}</main>
          </div>
        </div>
        <MobileNav />
      </div>
    </AuthGuard>
  )
}

import { AuthGuard } from '@/components/auth/AuthGuard'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireAuth>
      <div className="min-h-screen bg-gray-50">
        {/* Navbar ve Sidebar Aşama 3'te eklenecek */}
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
      </div>
    </AuthGuard>
  )
}

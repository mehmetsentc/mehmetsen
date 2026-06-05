import { AuthGuard } from '@/components/auth/AuthGuard'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireAuth={false}>
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          {children}
        </div>
      </div>
    </AuthGuard>
  )
}

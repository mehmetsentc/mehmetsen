import { AuthGuard } from '@/components/auth/AuthGuard'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireAuth={false}>
      <div className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-surface))] px-4 py-12">
        <div className="auth-card">{children}</div>
      </div>
    </AuthGuard>
  )
}

import type { Metadata } from 'next'
import { AuthPagesClient } from '@/components/auth/AuthPagesClient'

export const metadata: Metadata = {
  title: 'Giriş ve Kayıt',
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-2xl items-center justify-center">
        <section className="auth-card w-full p-5 sm:p-8">
          <AuthPagesClient>{children}</AuthPagesClient>
        </section>
      </div>
    </main>
  )
}

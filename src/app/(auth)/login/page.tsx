import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata: Metadata = { title: 'Giriş Yap' }

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</div>}>
      <LoginForm />
    </Suspense>
  )
}

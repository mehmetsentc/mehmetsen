import type { Metadata } from 'next'
import { Suspense } from 'react'
import { RegisterForm } from '@/components/auth/RegisterForm'

export const metadata: Metadata = { title: 'Kayıt Ol' }

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</div>}>
      <RegisterForm />
    </Suspense>
  )
}

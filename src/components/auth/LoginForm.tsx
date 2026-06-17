'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { loginSchema, type LoginFormData } from '@/lib/validators/auth'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { getGoogleAuthErrorMessage } from '@/lib/googleAuthErrors'

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const { login, loginWithGoogle } = useAuth()
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    try {
      await login(data)
      router.push(ROUTES.FEED)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      toast.error(getFirebaseErrorMessage(code))
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogle = async () => {
    setIsGoogleLoading(true)
    try {
      await loginWithGoogle()
      router.push(ROUTES.FEED)
    } catch (err: unknown) {
      toast.error(getGoogleAuthErrorMessage(err))
    } finally {
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className="w-full">
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center">
          <BrandLogo size="lg" priority />
        </div>
        <h1 className="auth-title">NaHaber&apos;e Giriş Yap</h1>
        <p className="auth-subtitle">Haberleri takip et, paylaş ve tartış</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">E-posta</label>
          <input
            {...register('email')}
            type="email"
            placeholder="ornek@email.com"
            className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
          {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">Şifre</label>
          <input
            {...register('password')}
            type="password"
            placeholder="••••••••"
            className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3">
        <div className="flex-1 border-t border-[rgb(var(--color-border))]" />
        <span className="text-xs text-[rgb(var(--color-muted))]">veya</span>
        <div className="flex-1 border-t border-[rgb(var(--color-border))]" />
      </div>

      <button
        onClick={handleGoogle}
        disabled={isGoogleLoading}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] py-2.5 text-sm font-medium text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-surface-hover,var(--color-surface)))] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleIcon />
        {isGoogleLoading ? 'Yükleniyor...' : 'Google ile devam et'}
      </button>

      <p className="mt-6 text-center text-sm text-[rgb(var(--color-muted))]">
        Hesabın yok mu?{' '}
        <Link href={ROUTES.REGISTER} className="font-medium text-brand-600 hover:underline">
          Kayıt ol
        </Link>
      </p>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function getFirebaseErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    'auth/user-not-found': 'Bu e-posta ile kayıtlı kullanıcı bulunamadı',
    'auth/wrong-password': 'Şifre hatalı',
    'auth/invalid-credential': 'E-posta veya şifre hatalı',
    'auth/too-many-requests': 'Çok fazla başarısız deneme. Lütfen bekleyin',
    'auth/user-disabled': 'Bu hesap devre dışı bırakılmış',
  }
  return messages[code] || 'Giriş sırasında bir hata oluştu'
}

'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { loginSchema, type LoginFormData } from '@/lib/validators/auth'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { getGoogleAuthErrorMessage } from '@/lib/googleAuthErrors'
import { getAppleAuthErrorMessage } from '@/lib/appleAuthErrors'
import {
  consumeReturnPath,
  registerHrefWithNext,
  rememberReturnPath,
  sanitizeReturnPath,
} from '@/lib/auth/returnTo'

/** iOS Capacitor'da mı çalışıyoruz? (Safari'yi dış browser olarak açmaktan kaçın) */
function isCapacitor(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as Record<string, unknown>).Capacitor !== 'undefined'
  )
}

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isAppleLoading, setIsAppleLoading] = useState(false)
  const onIos = isCapacitor()
  const { login, loginWithGoogle, loginWithApple } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextFromQuery = sanitizeReturnPath(searchParams.get('next'))

  useEffect(() => {
    if (nextFromQuery) rememberReturnPath(nextFromQuery)
  }, [nextFromQuery])

  const goHome = () => {
    router.push(consumeReturnPath() ?? ROUTES.FEED)
  }

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    try {
      await login(data)
      goHome()
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      toast.error(getFirebaseErrorMessage(code))
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogle = async () => {
    if (isGoogleLoading) return
    setIsGoogleLoading(true)
    let isRedirecting = false
    try {
      const firebaseUser = await loginWithGoogle()
      if (firebaseUser === null) {
        isRedirecting = true
        return
      }
      goHome()
    } catch (err: unknown) {
      console.error('[LoginForm] Google sign-in failed:', err)
      const message = getGoogleAuthErrorMessage(err)
      if (message) toast.error(message)
    } finally {
      if (!isRedirecting) setIsGoogleLoading(false)
    }
  }

  const handleApple = async () => {
    if (isAppleLoading) return
    setIsAppleLoading(true)
    let isRedirecting = false
    try {
      const firebaseUser = await loginWithApple()
      if (firebaseUser === null) {
        isRedirecting = true
        return
      }
      goHome()
    } catch (err: unknown) {
      console.error('[LoginForm] Apple sign-in failed:', err)
      const message = getAppleAuthErrorMessage(err)
      if (message) toast.error(message)
    } finally {
      if (!isRedirecting) setIsAppleLoading(false)
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

      {!onIos && (
        <button
          onClick={handleGoogle}
          disabled={isGoogleLoading}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] py-2.5 text-sm font-medium text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-surface-hover,var(--color-surface)))] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleIcon />
          {isGoogleLoading ? 'Yükleniyor...' : 'Google ile devam et'}
        </button>
      )}

      <button
        onClick={handleApple}
        disabled={isAppleLoading}
        className={`${!onIos ? 'mt-3 ' : ''}flex w-full items-center justify-center gap-3 rounded-lg bg-black py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200`}
      >
        <AppleIcon />
        {isAppleLoading ? 'Yükleniyor...' : 'Apple ile devam et'}
      </button>

      <p className="mt-6 text-center text-sm text-[rgb(var(--color-muted))]">
        Hesabın yok mu?{' '}
        <Link
          href={registerHrefWithNext(nextFromQuery ?? '')}
          className="font-medium text-brand-600 hover:underline"
        >
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

function AppleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
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

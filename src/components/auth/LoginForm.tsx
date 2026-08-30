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
import { isEmailAuthEnabledClient } from '@/lib/social/featureFlagClient'
import { AuthSocialProviders } from '@/components/auth/AuthSocialProviders'
import {
  consumeReturnPath,
  registerHrefWithNext,
  rememberReturnPath,
  sanitizeReturnPath,
} from '@/lib/auth/returnTo'

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isAppleLoading, setIsAppleLoading] = useState(false)
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
        <h1 className="auth-title">NaHaber&apos;e Katıl</h1>
        <p className="auth-subtitle">Google, Apple veya e-posta ile devam et</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {isEmailAuthEnabledClient() ? (
          <>
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
          </>
        ) : null}
      </form>

      {isEmailAuthEnabledClient() ? (
      <div className="my-4 flex items-center gap-3">
        <div className="flex-1 border-t border-[rgb(var(--color-border))]" />
        <span className="text-xs text-[rgb(var(--color-muted))]">veya</span>
        <div className="flex-1 border-t border-[rgb(var(--color-border))]" />
      </div>
      ) : null}

      <AuthSocialProviders
        onGoogleClick={handleGoogle}
        onAppleClick={handleApple}
        isGoogleLoading={isGoogleLoading}
        isAppleLoading={isAppleLoading}
      />

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

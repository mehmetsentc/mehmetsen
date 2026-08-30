'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { registerSchema, type RegisterFormData } from '@/lib/validators/auth'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { getGoogleAuthErrorMessage } from '@/lib/googleAuthErrors'
import { getAppleAuthErrorMessage } from '@/lib/appleAuthErrors'
import { AuthSocialProviders } from '@/components/auth/AuthSocialProviders'
import {
  consumeReturnPath,
  loginHrefWithNext,
  rememberReturnPath,
  sanitizeReturnPath,
} from '@/lib/auth/returnTo'

export function RegisterForm() {
    const [isLoading, setIsLoading] = useState(false)
    const [isGoogleLoading, setIsGoogleLoading] = useState(false)
    const [isAppleLoading, setIsAppleLoading] = useState(false)
    const { register: registerUser, loginWithGoogle, loginWithApple } = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()
    const nextFromQuery = sanitizeReturnPath(searchParams.get('next'))

    useEffect(() => {
      if (nextFromQuery) rememberReturnPath(nextFromQuery)
    }, [nextFromQuery])

    const goAfterAuth = (needsOnboarding: boolean) => {
      if (needsOnboarding) {
        router.push(ROUTES.ONBOARDING)
        return
      }
      router.push(consumeReturnPath() ?? ROUTES.FEED)
    }

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<RegisterFormData>({ resolver: zodResolver(registerSchema) })

    const onSubmit = async (data: RegisterFormData) => {
        setIsLoading(true)
        try {
            await registerUser(data)
            toast.success('Hesabın başarıyla oluşturuldu!')
            goAfterAuth(true)
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
            goAfterAuth(false)
        } catch (err: unknown) {
            console.error('[RegisterForm] Google sign-in failed:', err)
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
            goAfterAuth(false)
        } catch (err: unknown) {
            console.error('[RegisterForm] Apple sign-in failed:', err)
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
                <h1 className="auth-title">Hesap Oluştur</h1>
                <p className="auth-subtitle">
                  {nextFromQuery?.startsWith('/oyunlar')
                    ? 'Oyuna devam etmek için üye ol'
                    : 'NaHaber topluluğuna katıl'}
                </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">Ad Soyad</label>
                        <input
                            {...register('displayName')}
                            placeholder="Ahmet Yılmaz"
                            className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                        />
                        {errors.displayName && (
                            <p className="mt-1 text-xs text-red-500">{errors.displayName.message}</p>
                        )}
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">
                            Kullanıcı Adı
                        </label>
                        <input
                            {...register('username')}
                            placeholder="ahmet_yilmaz"
                            className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                        />
                        {errors.username && (
                            <p className="mt-1 text-xs text-red-500">{errors.username.message}</p>
                        )}
                    </div>
                </div>

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

                <div>
                    <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">Şifre Tekrar</label>
                    <input
                        {...register('confirmPassword')}
                        type="password"
                        placeholder="••••••••"
                        className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                    />
                    {errors.confirmPassword && (
                        <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isLoading ? 'Kaydediliyor...' : 'Kayıt Ol'}
                </button>
            </form>

            <div className="my-4 flex items-center gap-3">
                <div className="flex-1 border-t border-[rgb(var(--color-border))]" />
                <span className="text-xs text-[rgb(var(--color-muted))]">veya</span>
                <div className="flex-1 border-t border-[rgb(var(--color-border))]" />
            </div>

            <AuthSocialProviders
                onGoogleClick={handleGoogle}
                onAppleClick={handleApple}
                isGoogleLoading={isGoogleLoading}
                isAppleLoading={isAppleLoading}
            />

            <p className="mt-6 text-center text-sm text-[rgb(var(--color-muted))]">
                Zaten hesabın var mı?{' '}
                <Link href={loginHrefWithNext(nextFromQuery)} className="font-medium text-brand-600 hover:underline">
                    Giriş yap
                </Link>
            </p>
        </div>
    )
}

function getFirebaseErrorMessage(code: string): string {
    const messages: Record<string, string> = {
        'auth/email-already-in-use': 'Bu e-posta adresi zaten kullanılıyor',
        'auth/weak-password': 'Şifre çok zayıf',
        'auth/invalid-email': 'Geçersiz e-posta adresi',
        'auth/username-taken': 'Bu kullanıcı adı zaten alınmış',
    }
    return messages[code] || 'Kayıt sırasında bir hata oluştu'
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Camera, Loader2 } from 'lucide-react'
import { onboardingSchema, type OnboardingFormData } from '@/lib/validators/onboarding'
import { useAuth } from '@/hooks/useAuth'
import { userService } from '@/services/userService'
import { storageService } from '@/services/storageService'
import { Avatar } from '@/components/ui/Avatar'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CITY_CATEGORIES } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'

const MAX_AVATAR_SIZE = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed
}

export function OnboardingFlow() {
  const router = useRouter()
  const { user, refreshUser } = useAuth()
  const [step, setStep] = useState<1 | 2>(1)
  const [submitting, setSubmitting] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    trigger,
    setError,
    formState: { errors },
  } = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      displayName: user?.displayName ?? '',
      username: user?.username ?? '',
      bio: user?.bio ?? '',
      location: user?.location ?? '',
      website: user?.website ?? '',
    },
  })

  // Users who already finished onboarding shouldn't see this flow.
  useEffect(() => {
    if (user && user.onboardingCompleted) {
      router.replace(ROUTES.FEED)
    }
  }, [user, router])

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  if (!user) return null

  const handleAvatarSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toast.error('Yalnızca JPG, PNG, WebP veya GIF yükleyebilirsiniz')
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error("Profil fotoğrafı en fazla 5MB olabilir")
      return
    }

    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleNext = async () => {
    const valid = await trigger(['displayName', 'username'])
    if (valid) setStep(2)
  }

  const onSubmit = async (data: OnboardingFormData) => {
    if (submitting) return
    setSubmitting(true)

    try {
      const normalizedUsername = userService.normalizeUsername(data.username)

      if (normalizedUsername !== user.username) {
        const available = await userService.isUsernameAvailable(normalizedUsername)
        if (!available) {
          setError('username', { message: 'Bu kullanıcı adı zaten alınmış' })
          setStep(1)
          setSubmitting(false)
          return
        }
      }

      let photoURL = user.photoURL
      if (avatarFile) {
        photoURL = await storageService.uploadAvatar(avatarFile, user.uid)
      }

      await userService.completeOnboarding(user.uid, {
        username: normalizedUsername,
        displayName: data.displayName.trim(),
        bio: data.bio?.trim() ? data.bio.trim() : null,
        location: data.location?.trim() ? data.location.trim() : null,
        website: normalizeWebsite(data.website ?? ''),
        photoURL,
      })

      await refreshUser()
      toast.success('Profilin hazır! NaHaber\u2019e hoş geldin')
      router.replace(ROUTES.FEED)
    } catch (error) {
      console.error('[OnboardingFlow] Failed to complete onboarding:', error)
      toast.error('Profil kaydedilemedi, lütfen tekrar deneyin')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-surface))] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <BrandLogo size="lg" priority />
        </div>
        <div className="mb-6">
          <div className="mb-4 flex items-center gap-2">
            <span
              className={`h-1.5 flex-1 rounded-full ${step >= 1 ? 'bg-brand-600' : 'bg-[rgb(var(--color-border))]'}`}
            />
            <span
              className={`h-1.5 flex-1 rounded-full ${step >= 2 ? 'bg-brand-600' : 'bg-[rgb(var(--color-border))]'}`}
            />
          </div>
          <p className="text-xs font-medium text-[rgb(var(--color-muted))]">Adım {step} / 2</p>
          <h1 className="mt-1 text-2xl font-bold text-[rgb(var(--color-text))]">
            {step === 1 ? 'Profilini oluştur' : 'Kendinden bahset'}
          </h1>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            {step === 1
              ? 'Diğer kullanıcıların seni tanıması için temel bilgilerini ekle.'
              : 'Bu alanlar isteğe bağlı — istersen şimdilik geçebilirsin.'}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {step === 1 && (
            <>
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative rounded-full"
                  aria-label="Profil fotoğrafı seç"
                >
                  <Avatar
                    name={user.displayName}
                    src={avatarPreview ?? user.photoURL}
                    size="xl"
                  />
                  <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-md transition-colors group-hover:bg-brand-700">
                    <Camera className="h-4 w-4" />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  Profil fotoğrafı ekle
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarSelect}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">
                  Ad Soyad
                </label>
                <Input {...register('displayName')} placeholder="Ahmet Yılmaz" />
                {errors.displayName && (
                  <p className="mt-1 text-xs text-red-500">{errors.displayName.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">
                  Kullanıcı Adı
                </label>
                <Input {...register('username')} placeholder="ahmet_yilmaz" />
                {errors.username && (
                  <p className="mt-1 text-xs text-red-500">{errors.username.message}</p>
                )}
              </div>

              <Button type="button" onClick={handleNext} className="w-full">
                Devam
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">
                  Biyografi
                </label>
                <textarea
                  {...register('bio')}
                  rows={3}
                  placeholder="Kendinden kısaca bahset..."
                  className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2 text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.bio && <p className="mt-1 text-xs text-red-500">{errors.bio.message}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">
                  Şehir
                </label>
                <select
                  {...register('location')}
                  className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2 text-[rgb(var(--color-text))] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Şehir seçin</option>
                  {CITY_CATEGORIES.map((city) => (
                    <option key={city.id} value={city.name}>
                      {city.name}
                    </option>
                  ))}
                </select>
                {errors.location && (
                  <p className="mt-1 text-xs text-red-500">{errors.location.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">
                  Web Sitesi
                </label>
                <Input {...register('website')} placeholder="ornek.com" />
                {errors.website && (
                  <p className="mt-1 text-xs text-red-500">{errors.website.message}</p>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep(1)}
                  disabled={submitting}
                  className="flex-1"
                >
                  Geri
                </Button>
                <Button type="submit" disabled={submitting} className="flex flex-1 items-center justify-center gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? 'Kaydediliyor...' : 'Tamamla'}
                </Button>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full text-center text-sm font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] disabled:opacity-60"
              >
                Şimdilik geç
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  )
}

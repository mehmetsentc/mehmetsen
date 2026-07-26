'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Camera, Check, Loader2 } from 'lucide-react'
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
import { consumeReturnPath } from '@/lib/auth/returnTo'

const MAX_AVATAR_SIZE = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const TOTAL_STEPS = 5

// ── Haber kategorileri ────────────────────────────────────────────────────────
const NEWS_CATEGORIES = [
  { id: 'gundem',    label: 'Gündem',    emoji: '📰' },
  { id: 'siyaset',  label: 'Siyaset',   emoji: '🏛️' },
  { id: 'ekonomi',  label: 'Ekonomi',   emoji: '📈' },
  { id: 'dunya',    label: 'Dünya',     emoji: '🌍' },
  { id: 'teknoloji',label: 'Teknoloji', emoji: '💻' },
  { id: 'saglik',   label: 'Sağlık',    emoji: '❤️' },
  { id: 'bilim',    label: 'Bilim',     emoji: '🔬' },
  { id: 'spor',     label: 'Spor',      emoji: '⚽' },
  { id: 'magazin',  label: 'Magazin',   emoji: '⭐' },
  { id: 'kultur',   label: 'Kültür',    emoji: '🎭' },
  { id: 'gastronomi',label:'Gastronomi',emoji: '🍽️' },
  { id: 'otomobil', label: 'Otomobil',  emoji: '🚗' },
  { id: 'yerel-haber',label:'Yerel',    emoji: '📍' },
]

// ── Spor branşları ────────────────────────────────────────────────────────────
const SPORT_BRANCHES = [
  { id: 'futbol',    label: 'Futbol',    emoji: '⚽' },
  { id: 'basketbol', label: 'Basketbol', emoji: '🏀' },
  { id: 'voleybol',  label: 'Voleybol',  emoji: '🏐' },
  { id: 'hentbol',   label: 'Hentbol',   emoji: '🤾' },
  { id: 'atletizm',  label: 'Atletizm',  emoji: '🏃' },
  { id: 'gures',     label: 'Güreş',     emoji: '🤼' },
  { id: 'tenis',     label: 'Tenis',     emoji: '🎾' },
  { id: 'yuzme',     label: 'Yüzme',     emoji: '🏊' },
  { id: 'formula1',  label: 'Formula 1', emoji: '🏎️' },
]

// ── Etkinlik / kültür tercihleri ──────────────────────────────────────────────
const INTEREST_TAGS = [
  { id: 'sinema',       label: 'Sinema',       emoji: '🎬' },
  { id: 'tiyatro',      label: 'Tiyatro',      emoji: '🎭' },
  { id: 'konser',       label: 'Konser',        emoji: '🎵' },
  { id: 'festival',     label: 'Festival',     emoji: '🎉' },
  { id: 'sergi',        label: 'Sergi/Sanat',  emoji: '🖼️' },
  { id: 'kitap',        label: 'Kitap',        emoji: '📚' },
  { id: 'seyahat',      label: 'Seyahat',      emoji: '✈️' },
  { id: 'yemek',        label: 'Yemek',        emoji: '🍽️' },
  { id: 'oyun',         label: 'Oyun/Gaming',  emoji: '🎮' },
  { id: 'fotograf',     label: 'Fotoğraf',     emoji: '📷' },
]

// ── Seçilebilir chip bileşeni ─────────────────────────────────────────────────
function SelectChip({
  emoji, label, selected, onToggle,
}: { emoji: string; label: string; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
        selected
          ? 'border-brand-600 bg-brand-600/15 text-brand-600'
          : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:border-brand-400 hover:text-[rgb(var(--color-text))]'
      }`}
    >
      <span>{emoji}</span>
      <span>{label}</span>
      {selected && <Check className="h-3.5 w-3.5" />}
    </button>
  )
}

function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed
}

export function OnboardingFlow() {
  const router = useRouter()
  const { user, refreshUser } = useAuth()
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [submitting, setSubmitting] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 3: kategori tercihleri
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  // Step 4: spor
  const [selectedSport, setSelectedSport] = useState<string>('')
  const [favoriteTeam, setFavoriteTeam] = useState<string>('')
  // Step 5: etkinlik/kültür
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])

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
      username:    user?.username    ?? '',
      bio:         user?.bio         ?? '',
      location:    user?.location    ?? '',
      website:     user?.website     ?? '',
    },
  })

  useEffect(() => {
    if (user && user.onboardingCompleted) {
      router.replace(consumeReturnPath() ?? ROUTES.FEED)
    }
  }, [user, router])

  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }
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
      toast.error('Profil fotoğrafı en fazla 5MB olabilir')
      return
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const toggleCategory = (id: string) =>
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )

  const toggleInterest = (id: string) =>
    setSelectedInterests(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )

  const handleNext = async () => {
    if (step === 1) {
      const valid = await trigger(['displayName', 'username'])
      if (valid) setStep(2)
    } else if (step === 2) {
      setStep(3)
    } else if (step === 3) {
      setStep(4)
    } else if (step === 4) {
      setStep(5)
    }
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
        username:     normalizedUsername,
        displayName:  data.displayName.trim(),
        bio:          data.bio?.trim()      ? data.bio.trim()      : null,
        location:     data.location?.trim() ? data.location.trim() : null,
        website:      normalizeWebsite(data.website ?? ''),
        photoURL,
        favoriteCategories: selectedCategories,
        interests:          selectedInterests,
        favoriteTeam:       favoriteTeam.trim() || undefined,
        favoriteSport:      selectedSport       || undefined,
      })

      await refreshUser()
      toast.success('NaHaber\'e hoş geldin! 🎉')
      router.replace(consumeReturnPath() ?? ROUTES.FEED)
    } catch (error) {
      console.error('[OnboardingFlow] Failed:', error)
      toast.error('Profil kaydedilemedi, lütfen tekrar deneyin')
      setSubmitting(false)
    }
  }

  const stepTitles = [
    'Profilini oluştur',
    'Kendinden bahset',
    'Haber tercihlerini seç',
    'Spor dünyası',
    'Etkinlik ve ilgi alanları',
  ]
  const stepDescs = [
    'Diğer kullanıcıların seni tanıması için temel bilgilerini ekle.',
    'Bu alanlar isteğe bağlı — istersen şimdilik geçebilirsin.',
    'Hangi kategorilerdeki haberleri takip etmek istersin?',
    'Favori takımın ve spor branşın hangisi?',
    'Etkinlik ve kültür ilgi alanlarını seç.',
  ]

  return (
    <div className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-surface))] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <BrandLogo size="lg" priority />
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="mb-3 flex gap-1.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i + 1 <= step ? 'bg-brand-600' : 'bg-[rgb(var(--color-border))]'
                }`}
              />
            ))}
          </div>
          <p className="text-xs font-medium text-[rgb(var(--color-muted))]">
            Adım {step} / {TOTAL_STEPS}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[rgb(var(--color-text))]">
            {stepTitles[step - 1]}
          </h1>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            {stepDescs[step - 1]}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* ── ADIM 1: Profil fotoğrafı + ad + kullanıcı adı ── */}
          {step === 1 && (
            <>
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative rounded-full"
                  aria-label="Profil fotoğrafı seç"
                >
                  <Avatar name={user.displayName} src={avatarPreview ?? user.photoURL} size="xl" />
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
                <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">Ad Soyad</label>
                <Input {...register('displayName')} placeholder="Ahmet Yılmaz" />
                {errors.displayName && <p className="mt-1 text-xs text-red-500">{errors.displayName.message}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">Kullanıcı Adı</label>
                <Input {...register('username')} placeholder="ahmet_yilmaz" />
                {errors.username && <p className="mt-1 text-xs text-red-500">{errors.username.message}</p>}
              </div>

              <Button type="button" onClick={handleNext} className="w-full">Devam</Button>
            </>
          )}

          {/* ── ADIM 2: Biyografi + şehir + website ── */}
          {step === 2 && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">Biyografi</label>
                <textarea
                  {...register('bio')}
                  rows={3}
                  placeholder="Kendinden kısaca bahset..."
                  className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2 text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">Şehrin</label>
                <select
                  {...register('location')}
                  className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2 text-[rgb(var(--color-text))] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Şehir seçin</option>
                  {CITY_CATEGORIES.map((city) => (
                    <option key={city.id} value={city.name}>{city.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">Web Sitesi</label>
                <Input {...register('website')} placeholder="ornek.com" />
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={() => setStep(1)} className="flex-1">Geri</Button>
                <Button type="button" onClick={handleNext} className="flex-1">Devam</Button>
              </div>
              <button type="button" onClick={handleNext} className="w-full text-center text-sm font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
                Şimdilik geç
              </button>
            </>
          )}

          {/* ── ADIM 3: Haber kategorisi tercihleri ── */}
          {step === 3 && (
            <>
              <div className="flex flex-wrap gap-2">
                {NEWS_CATEGORIES.map((cat) => (
                  <SelectChip
                    key={cat.id}
                    emoji={cat.emoji}
                    label={cat.label}
                    selected={selectedCategories.includes(cat.id)}
                    onToggle={() => toggleCategory(cat.id)}
                  />
                ))}
              </div>
              {selectedCategories.length > 0 && (
                <p className="text-xs text-[rgb(var(--color-muted))]">
                  {selectedCategories.length} kategori seçildi
                </p>
              )}

              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={() => setStep(2)} className="flex-1">Geri</Button>
                <Button type="button" onClick={handleNext} className="flex-1">Devam</Button>
              </div>
              <button type="button" onClick={handleNext} className="w-full text-center text-sm font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
                Şimdilik geç
              </button>
            </>
          )}

          {/* ── ADIM 4: Spor tercihleri ── */}
          {step === 4 && (
            <>
              <div>
                <p className="mb-2 text-sm font-medium text-[rgb(var(--color-text))]">Favori spor branşın</p>
                <div className="flex flex-wrap gap-2">
                  {SPORT_BRANCHES.map((sport) => (
                    <button
                      key={sport.id}
                      type="button"
                      onClick={() => setSelectedSport(prev => prev === sport.id ? '' : sport.id)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
                        selectedSport === sport.id
                          ? 'border-brand-600 bg-brand-600/15 text-brand-600'
                          : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:border-brand-400 hover:text-[rgb(var(--color-text))]'
                      }`}
                    >
                      <span>{sport.emoji}</span>
                      <span>{sport.label}</span>
                      {selectedSport === sport.id && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">
                  Favori takımın <span className="text-[rgb(var(--color-muted))] font-normal">(isteğe bağlı)</span>
                </label>
                <Input
                  value={favoriteTeam}
                  onChange={e => setFavoriteTeam(e.target.value)}
                  placeholder="ör. Fenerbahçe, Galatasaray, Beşiktaş..."
                />
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={() => setStep(3)} className="flex-1">Geri</Button>
                <Button type="button" onClick={handleNext} className="flex-1">Devam</Button>
              </div>
              <button type="button" onClick={handleNext} className="w-full text-center text-sm font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
                Şimdilik geç
              </button>
            </>
          )}

          {/* ── ADIM 5: Etkinlik ve kültür ilgi alanları ── */}
          {step === 5 && (
            <>
              <div className="flex flex-wrap gap-2">
                {INTEREST_TAGS.map((tag) => (
                  <SelectChip
                    key={tag.id}
                    emoji={tag.emoji}
                    label={tag.label}
                    selected={selectedInterests.includes(tag.id)}
                    onToggle={() => toggleInterest(tag.id)}
                  />
                ))}
              </div>
              {selectedInterests.length > 0 && (
                <p className="text-xs text-[rgb(var(--color-muted))]">
                  {selectedInterests.length} ilgi alanı seçildi
                </p>
              )}

              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={() => setStep(4)} disabled={submitting} className="flex-1">Geri</Button>
                <Button type="submit" disabled={submitting} className="flex flex-1 items-center justify-center gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? 'Kaydediliyor...' : 'Tamamla 🎉'}
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

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Check, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { userService } from '@/services/userService'
import { storageService } from '@/services/storageService'
import { CITY_CATEGORIES } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'

// ── Sabit listeler (onboarding ile aynı) ─────────────────────────────────────
const NEWS_CATEGORIES = [
  { id: 'gundem',     label: 'Gündem',     emoji: '📰' },
  { id: 'siyaset',   label: 'Siyaset',    emoji: '🏛️' },
  { id: 'ekonomi',   label: 'Ekonomi',    emoji: '📈' },
  { id: 'dunya',     label: 'Dünya',      emoji: '🌍' },
  { id: 'teknoloji', label: 'Teknoloji',  emoji: '💻' },
  { id: 'saglik',    label: 'Sağlık',     emoji: '❤️' },
  { id: 'bilim',     label: 'Bilim',      emoji: '🔬' },
  { id: 'spor',      label: 'Spor',       emoji: '⚽' },
  { id: 'magazin',   label: 'Magazin',    emoji: '⭐' },
  { id: 'kultur',    label: 'Kültür',     emoji: '🎭' },
  { id: 'gastronomi',label: 'Gastronomi', emoji: '🍽️' },
  { id: 'otomobil',  label: 'Otomobil',   emoji: '🚗' },
  { id: 'yerel-haber',label:'Yerel',      emoji: '📍' },
]

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

const INTEREST_TAGS = [
  { id: 'sinema',    label: 'Sinema',      emoji: '🎬' },
  { id: 'tiyatro',   label: 'Tiyatro',     emoji: '🎭' },
  { id: 'konser',    label: 'Konser',      emoji: '🎵' },
  { id: 'festival',  label: 'Festival',    emoji: '🎉' },
  { id: 'sergi',     label: 'Sergi/Sanat', emoji: '🖼️' },
  { id: 'kitap',     label: 'Kitap',       emoji: '📚' },
  { id: 'seyahat',   label: 'Seyahat',     emoji: '✈️' },
  { id: 'yemek',     label: 'Yemek',       emoji: '🍽️' },
  { id: 'oyun',      label: 'Oyun/Gaming', emoji: '🎮' },
  { id: 'fotograf',  label: 'Fotoğraf',    emoji: '📷' },
]

const MAX_AVATAR_SIZE = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// ── Chip bileşeni ─────────────────────────────────────────────────────────────
function Chip({ emoji, label, selected, onToggle }: {
  emoji: string; label: string; selected: boolean; onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
        selected
          ? 'border-brand-600 bg-brand-600/15 text-brand-600'
          : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:border-brand-400'
      }`}
    >
      <span>{emoji}</span>
      <span>{label}</span>
      {selected && <Check className="h-3.5 w-3.5" />}
    </button>
  )
}

// ── Bölüm başlığı ─────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-1 text-sm font-semibold uppercase tracking-wider text-[rgb(var(--color-muted))]">
      {children}
    </h2>
  )
}

export default function SettingsProfilePage() {
  const router = useRouter()
  const { user, refreshUser } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Profil alanları
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [website, setWebsite] = useState('')

  // Avatar
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  // Tercihler
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedSport, setSelectedSport] = useState('')
  const [favoriteTeam, setFavoriteTeam] = useState('')
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])

  const [saving, setSaving] = useState(false)

  // Mevcut verileri form'a doldur
  useEffect(() => {
    if (!user) return
    setDisplayName(user.displayName ?? '')
    setBio(user.bio ?? '')
    setLocation(user.location ?? '')
    setWebsite(user.website ?? '')
    setSelectedCategories(user.favoriteCategories ?? [])
    setSelectedSport(user.favoriteSport ?? '')
    setFavoriteTeam(user.favoriteTeam ?? '')
    setSelectedInterests(user.interests ?? [])
  }, [user])

  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }
  }, [avatarPreview])

  useEffect(() => {
    if (!user) router.replace(ROUTES.LOGIN)
  }, [user, router])

  if (!user) return null

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) { toast.error('Desteklenmeyen dosya tipi'); return }
    if (file.size > MAX_AVATAR_SIZE) { toast.error('Fotoğraf en fazla 5MB olabilir'); return }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const toggleCategory = (id: string) =>
    setSelectedCategories(p => p.includes(id) ? p.filter(c => c !== id) : [...p, id])

  const toggleInterest = (id: string) =>
    setSelectedInterests(p => p.includes(id) ? p.filter(i => i !== id) : [...p, id])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      let photoURL = user.photoURL ?? null
      if (avatarFile) {
        photoURL = await storageService.uploadAvatar(avatarFile, user.uid)
      }

      const trimmedDisplayName = displayName.trim() || user.displayName?.trim() || ''
      if (!trimmedDisplayName) {
        toast.error('Ad Soyad boş bırakılamaz')
        return
      }

      await userService.updateProfile(user.uid, {
        displayName: trimmedDisplayName,
        bio: bio.trim() || null,
        location: location.trim() || null,
        website: website.trim() || null,
        photoURL,
      })

      await userService.updateInterests(user.uid, {
        favoriteCategories: selectedCategories,
        interests: selectedInterests,
        favoriteTeam: favoriteTeam.trim() || null,
        favoriteSport: selectedSport || null,
      })

      try {
        localStorage.removeItem(`nahaber_profile_prompt_v1_${user.uid}`)
      } catch { /* ignore */ }

      await refreshUser()
      toast.success('Profil güncellendi ✓')
      router.push(ROUTES.SETTINGS)
    } catch (err) {
      console.error('[profile/save]', err)
      const message =
        err instanceof Error && err.message
          ? `Kaydedilemedi: ${err.message}`
          : 'Kaydedilemedi, tekrar dene'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-8">
      <SettingsHeader title="Profil ve İlgi Alanları" backHref={ROUTES.SETTINGS} />

      <div className="space-y-6 px-4 pt-4">

        {/* ── Avatar ── */}
        <section className="flex flex-col items-center gap-3 py-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group relative rounded-full"
            aria-label="Profil fotoğrafı değiştir"
          >
            <Avatar name={user.displayName} src={avatarPreview ?? user.photoURL} size="xl" />
            <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--color-primary))] text-white shadow">
              <Camera className="h-4 w-4" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-sm font-medium text-[rgb(var(--color-primary))] hover:underline"
          >
            Fotoğrafı değiştir
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleAvatarSelect}
          />
        </section>

        {/* ── Temel profil bilgileri ── */}
        <section>
          <SectionTitle>Profil Bilgileri</SectionTitle>
          <div className="space-y-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[rgb(var(--color-muted))]">Ad Soyad</label>
              <Input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Adın Soyadın"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[rgb(var(--color-muted))]">Biyografi</label>
              <textarea
                rows={3}
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Kendinden kısaca bahset..."
                className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[rgb(var(--color-muted))]">Şehir</label>
              <select
                value={location}
                onChange={e => setLocation(e.target.value)}
                className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2 text-sm text-[rgb(var(--color-text))] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Şehir seçin</option>
                {CITY_CATEGORIES.map(city => (
                  <option key={city.id} value={city.name}>{city.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[rgb(var(--color-muted))]">Web Sitesi</label>
              <Input
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="ornek.com"
              />
            </div>
          </div>
        </section>

        {/* ── Haber kategorileri ── */}
        <section>
          <SectionTitle>Haber Kategorileri</SectionTitle>
          <p className="mb-3 text-xs text-[rgb(var(--color-muted))]">
            Seçtiğin kategoriler "Sana Özel" akışını oluşturur.
          </p>
          <div className="flex flex-wrap gap-2">
            {NEWS_CATEGORIES.map(cat => (
              <Chip
                key={cat.id}
                emoji={cat.emoji}
                label={cat.label}
                selected={selectedCategories.includes(cat.id)}
                onToggle={() => toggleCategory(cat.id)}
              />
            ))}
          </div>
          {selectedCategories.length > 0 && (
            <p className="mt-2 text-xs text-[rgb(var(--color-muted))]">{selectedCategories.length} kategori seçili</p>
          )}
        </section>

        {/* ── Spor tercihleri ── */}
        <section>
          <SectionTitle>Spor Tercihleri</SectionTitle>
          <div className="space-y-4 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
            <div>
              <p className="mb-2 text-xs font-medium text-[rgb(var(--color-muted))]">Favori spor branşı</p>
              <div className="flex flex-wrap gap-2">
                {SPORT_BRANCHES.map(sport => (
                  <button
                    key={sport.id}
                    type="button"
                    onClick={() => setSelectedSport(p => p === sport.id ? '' : sport.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
                      selectedSport === sport.id
                        ? 'border-brand-600 bg-brand-600/15 text-brand-600'
                        : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:border-brand-400'
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
              <label className="mb-1 block text-xs font-medium text-[rgb(var(--color-muted))]">
                Favori takım <span className="font-normal">(isteğe bağlı)</span>
              </label>
              <Input
                value={favoriteTeam}
                onChange={e => setFavoriteTeam(e.target.value)}
                placeholder="ör. Fenerbahçe, Galatasaray..."
              />
            </div>
          </div>
        </section>

        {/* ── Etkinlik & ilgi alanları ── */}
        <section>
          <SectionTitle>Etkinlik ve İlgi Alanları</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {INTEREST_TAGS.map(tag => (
              <Chip
                key={tag.id}
                emoji={tag.emoji}
                label={tag.label}
                selected={selectedInterests.includes(tag.id)}
                onToggle={() => toggleInterest(tag.id)}
              />
            ))}
          </div>
        </section>
      </div>

      {/* ── Kaydet butonu ── */}
      <div className="px-4 pt-6 pb-safe">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
        </Button>
      </div>
    </div>
  )
}

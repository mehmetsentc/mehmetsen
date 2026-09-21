'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BadgeCheck, Camera, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import type { User } from '@/types/user'
import { Avatar } from '@/components/ui/Avatar'
import { FollowButton } from './FollowButton'
import { MessageButton } from '@/components/messages/MessageButton'
import { AvatarPickerSheet } from './AvatarPickerSheet'
import { AvatarCropModal } from './AvatarCropModal'
import { storageService } from '@/services/storageService'
import { userService } from '@/services/userService'
import { saveService } from '@/services/saveService'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { formatCount } from '@/lib/postUtils'

interface ProfileHeaderProps {
  user: User
  isOwnProfile: boolean
  isFollowing: boolean
  onFollowChange?: (isFollowing: boolean) => void
}

function joinLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}

export function ProfileHeader({
  user,
  isOwnProfile,
  isFollowing,
  onFollowChange,
}: ProfileHeaderProps) {
  const { refreshUser } = useAuth()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [savedCount, setSavedCount] = useState<number | null>(null)

  useEffect(() => {
    if (!isOwnProfile) {
      setSavedCount(null)
      return
    }
    let cancelled = false
    void saveService.getSavedPostIds(user.uid).then((ids) => {
      if (!cancelled) setSavedCount(ids.length)
    }).catch(() => {
      if (!cancelled) setSavedCount(0)
    })
    return () => {
      cancelled = true
    }
  }, [isOwnProfile, user.uid])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
    if (!allowed.includes(file.type)) {
      toast.error('Desteklenmeyen format — JPEG, PNG veya WebP seç')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('En fazla 10MB')
      return
    }
    setCropFile(file)
    e.target.value = ''
  }

  const handlePickerCamera = () => {
    setShowPicker(false)
    setTimeout(() => cameraInputRef.current?.click(), 100)
  }

  const handlePickerGallery = () => {
    setShowPicker(false)
    setTimeout(() => galleryInputRef.current?.click(), 100)
  }

  const handlePickerRemove = async () => {
    setShowPicker(false)
    setUploading(true)
    try {
      await userService.updateProfile(user.uid, { photoURL: null })
      await refreshUser()
      setAvatarPreview(null)
      toast.success('Profil fotoğrafı kaldırıldı')
    } catch (err) {
      console.error('[Avatar remove error]', err)
      toast.error('Kaldırılamadı, tekrar dene')
    } finally {
      setUploading(false)
    }
  }

  const handleCropConfirm = async (blob: Blob) => {
    setCropFile(null)
    setUploading(true)
    try {
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
      const url = await storageService.uploadAvatar(file, user.uid)
      setAvatarPreview(url)
      await userService.updateProfile(user.uid, { photoURL: url })
      await refreshUser()
      toast.success('Profil fotoğrafı güncellendi ✓')
    } catch (err) {
      console.error('[Avatar upload error]', err)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('storage/unauthorized') || msg.includes('permission-denied')) {
        toast.error('Yükleme izni yok — lütfen tekrar giriş yap')
      } else {
        toast.error('Yükleme başarısız, tekrar dene')
      }
    } finally {
      setUploading(false)
    }
  }

  const joined = joinLabel(user.createdAt)

  return (
    <>
      <header className="nah-profile-hero">
        <div className="nah-profile-cover" data-testid="profile-cover">
          {isOwnProfile ? (
            <span className="absolute right-3 bottom-3 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-semibold text-white/80">
              Kapak yakında
            </span>
          ) : null}
        </div>

        <div className="px-4 pb-4">
          <div className="relative flex items-end justify-between">
            <div className="relative">
              <div className="nah-profile-avatar overflow-hidden bg-[rgb(var(--nah-surface))]">
                <Avatar
                  name={user.displayName}
                  src={avatarPreview ?? user.photoURL}
                  size="xl"
                  className={uploading ? 'h-full w-full opacity-50' : 'h-full w-full'}
                />
              </div>
              {isOwnProfile ? (
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  disabled={uploading}
                  aria-label="Profil fotoğrafı değiştir"
                  className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--nah-red))] text-white shadow-md disabled:opacity-60"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {isOwnProfile ? (
              <Link
                href={ROUTES.SETTINGS_PROFILE}
                className="mb-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white"
              >
                Profili Düzenle
              </Link>
            ) : (
              <div className="mb-2 flex items-center gap-2">
                <FollowButton
                  targetUserId={user.uid}
                  isFollowing={isFollowing}
                  onFollowChange={onFollowChange}
                />
                <MessageButton targetUser={user} />
              </div>
            )}
          </div>

          <div className="mt-3">
            <h1 className="flex items-center gap-1.5 text-[1.35rem] font-extrabold tracking-tight text-white">
              {user.displayName || user.username}
              {user.isVerified ? (
                <BadgeCheck className="h-5 w-5 text-sky-400" aria-label="Doğrulanmış" />
              ) : null}
            </h1>
            <p className="text-sm text-[rgb(var(--nah-text-muted))]">@{user.username}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[rgb(var(--nah-text-muted))]">
              {user.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {user.location}
                </span>
              ) : null}
              {joined ? <span>{joined} tarihinde katıldı</span> : null}
            </div>
            {user.bio ? <p className="mt-2 text-sm leading-relaxed text-white/90">{user.bio}</p> : null}
          </div>

          <div className="nah-stat-grid mt-4 text-center">
            <div>
              <strong>{formatCount(user.postsCount || 0)}</strong>
              <span>Gönderi</span>
            </div>
            <div>
              <strong>{formatCount(user.followersCount || 0)}</strong>
              <span>Takipçi</span>
            </div>
            <div>
              <strong>{formatCount(user.followingCount || 0)}</strong>
              <span>Takip</span>
            </div>
            <div>
              <strong>{isOwnProfile ? formatCount(savedCount ?? 0) : '—'}</strong>
              <span>Kaydedilen</span>
            </div>
          </div>
        </div>
      </header>

      {showPicker ? (
        <AvatarPickerSheet
          hasPhoto={!!(avatarPreview ?? user.photoURL)}
          onCamera={handlePickerCamera}
          onGallery={handlePickerGallery}
          onRemove={handlePickerRemove}
          onClose={() => setShowPicker(false)}
        />
      ) : null}

      {cropFile ? (
        <AvatarCropModal
          file={cropFile}
          onConfirm={handleCropConfirm}
          onClose={() => setCropFile(null)}
        />
      ) : null}
    </>
  )
}

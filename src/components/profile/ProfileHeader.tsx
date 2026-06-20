'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Settings, PlusCircle, Newspaper } from 'lucide-react'
import toast from 'react-hot-toast'
import type { User } from '@/types/user'
import { Avatar } from '@/components/ui/Avatar'
import { FollowButton } from './FollowButton'
import { MessageButton } from '@/components/messages/MessageButton'
import { AvatarCropModal } from './AvatarCropModal'
import { SubmitNewsModal } from './SubmitNewsModal'
import { storageService } from '@/services/storageService'
import { userService } from '@/services/userService'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { formatCount } from '@/lib/postUtils'

interface ProfileHeaderProps {
  user: User
  isOwnProfile: boolean
  isFollowing: boolean
  onFollowChange?: (isFollowing: boolean) => void
}

export function ProfileHeader({
  user,
  isOwnProfile,
  isFollowing,
  onFollowChange,
}: ProfileHeaderProps) {
  const { refreshUser } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [cropFile, setCropFile] = useState<File | null>(null)
  const [showNewsModal, setShowNewsModal] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) { toast.error('Desteklenmeyen format'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('En fazla 5MB'); return }
    setCropFile(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
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
    } catch {
      toast.error('Yükleme başarısız')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <header className="px-4 py-5 sm:px-0 sm:py-7">

        {/* ── Üst kısım: avatar + butonlar ── */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-10 md:gap-14">

          {/* Avatar */}
          <div className="flex justify-center sm:justify-start">
            <div className="relative">
              <div className="profile-avatar-ring">
                <div className="rounded-full bg-[rgb(var(--color-surface))] p-[3px]">
                  <Avatar
                    name={user.displayName}
                    src={avatarPreview ?? user.photoURL}
                    size="xl"
                    className={uploading ? 'opacity-60' : ''}
                  />
                </div>
              </div>

              {/* "+" butonu — sadece kendi profili */}
              {isOwnProfile && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  aria-label="Profil fotoğrafı değiştir"
                  className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[rgb(var(--color-card))] bg-[rgb(var(--color-brand))] text-white shadow-md transition hover:scale-110 active:scale-95 disabled:opacity-60"
                >
                  <span className="text-lg font-light leading-none">+</span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          </div>

          {/* Sağ taraf: isim + butonlar + istatistikler */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center">
                <h1 className="text-xl font-normal text-[rgb(var(--color-text))] sm:text-[26px]">
                  {user.username}
                </h1>
                {isOwnProfile ? (
                  <div className="flex gap-2">
                    <Link href={ROUTES.SETTINGS_PROFILE} className="profile-edit-btn">
                      Profili düzenle
                    </Link>
                    <Link
                      href={ROUTES.SETTINGS}
                      className="profile-edit-btn"
                      aria-label="Ayarlar"
                    >
                      <Settings className="h-4 w-4" />
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <MessageButton targetUser={user} />
                    <FollowButton
                      targetUserId={user.uid}
                      isFollowing={isFollowing}
                      onFollowChange={onFollowChange}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* İstatistikler */}
            <div className="mt-4 flex justify-center gap-8 text-sm sm:justify-start md:gap-10">
              <div>
                <span className="font-semibold text-[rgb(var(--color-text))]">{formatCount(user.postsCount)}</span>{' '}
                <span className="text-[rgb(var(--color-text))]">gönderi</span>
              </div>
              <div>
                <span className="font-semibold text-[rgb(var(--color-text))]">{formatCount(user.followersCount)}</span>{' '}
                <span className="text-[rgb(var(--color-text))]">takipçi</span>
              </div>
              <div>
                <span className="font-semibold text-[rgb(var(--color-text))]">{formatCount(user.followingCount)}</span>{' '}
                <span className="text-[rgb(var(--color-text))]">takip</span>
              </div>
            </div>

            {/* Bio */}
            <div className="mt-3 text-center sm:text-left">
              <p className="font-semibold text-[rgb(var(--color-text))]">{user.displayName}</p>
              {user.bio && <p className="profile-body mt-1">{user.bio}</p>}
              <div className="profile-muted mt-2 flex flex-wrap justify-center gap-3 sm:justify-start">
                {user.location && <span>{user.location}</span>}
                {user.website && (
                  <a
                    href={user.website.startsWith('http') ? user.website : `https://${user.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-blue-400 hover:underline"
                  >
                    {user.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Haber butonları — sadece kendi profili ── */}
        {isOwnProfile && (
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => setShowNewsModal(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-brand))] py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
            >
              <Newspaper className="h-4 w-4" />
              Haber Ekle
            </button>
            <button
              type="button"
              onClick={() => setShowNewsModal(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[rgb(var(--color-brand))]/40 py-2.5 text-sm font-semibold text-[rgb(var(--color-brand))] transition hover:bg-[rgb(var(--color-brand))]/8 active:scale-[0.98]"
            >
              <PlusCircle className="h-4 w-4" />
              Haber Öner
            </button>
          </div>
        )}
      </header>

      {/* ── Modals ── */}
      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onConfirm={handleCropConfirm}
          onClose={() => setCropFile(null)}
        />
      )}
      {showNewsModal && (
        <SubmitNewsModal onClose={() => setShowNewsModal(false)} />
      )}
    </>
  )
}

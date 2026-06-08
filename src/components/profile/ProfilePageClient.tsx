'use client'

import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { ProfileHeader } from './ProfileHeader'
import { ProfileTabs } from './ProfileTabs'
import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/Button'

interface ProfilePageClientProps {
  username: string
}

export function ProfilePageClient({ username }: ProfilePageClientProps) {
  const { user: authUser } = useAuth()
  const { profile, loading, error, isFollowing, setIsFollowing, refreshCounts } = useProfile(
    username,
    authUser?.uid
  )

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-[rgb(var(--color-muted))]">Profil yükleniyor...</p>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="profile-card flex min-h-[50vh] flex-col items-center justify-center gap-4 border-dashed p-8 text-center">
        <p className="text-lg font-semibold text-[rgb(var(--color-text))]">Kullanıcı bulunamadı</p>
        <p className="max-w-sm text-sm text-[rgb(var(--color-muted))]">
          @{username} geçerli bir profil değil veya henüz kayıt tamamlanmamış.
        </p>
        <Link href={ROUTES.FEED}>
          <Button variant="primary">Ana sayfaya dön</Button>
        </Link>
      </div>
    )
  }

  const isOwnProfile = authUser?.uid === profile.uid

  return (
    <div className="mx-auto w-full space-y-2">
      <ProfileHeader
        user={profile}
        isOwnProfile={isOwnProfile}
        isFollowing={isFollowing}
        onFollowChange={(next) => {
          setIsFollowing(next)
          refreshCounts(next ? 1 : -1)
        }}
      />
      <ProfileTabs
        userId={profile.uid}
        username={profile.username}
        isOwnProfile={isOwnProfile}
      />
    </div>
  )
}

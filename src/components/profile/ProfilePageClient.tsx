'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { ProfileHeader } from './ProfileHeader'
import { ProfileTabs } from './ProfileTabs'
import { ProfileCompleteModal } from './ProfileCompleteModal'
import { ProfileBadges } from './ProfileBadges'
import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/Button'
import type { User } from '@/types/user'
import type { Post } from '@/types/post'

interface ProfilePageClientProps {
  username: string
  initialProfile?: User | null
  initialPosts?: Post[]
}

export function ProfilePageClient({
  username,
  initialProfile = null,
  initialPosts = [],
}: ProfilePageClientProps) {
  const { user: authUser, loading: authLoading } = useAuth()
  const { profile, loading, error, isFollowing, setIsFollowing, refreshCounts, refresh } = useProfile(
    username,
    authUser?.uid,
    { initialProfile, fromServer: true }
  )

  useEffect(() => {
    if (profile || loading || authLoading || !authUser) return
    if (authUser.username !== username && authUser.uid !== username) return
    const timer = setTimeout(() => void refresh(), 1500)
    return () => clearTimeout(timer)
  }, [profile, loading, authLoading, authUser, username, refresh])

  if (authLoading || loading) {
    return (
      <div className="profile-page-shell ui-v2-screen flex min-h-[50vh] flex-col items-center justify-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--nah-red))]" />
        <p className="text-sm text-[rgb(var(--nah-text-muted))]">Profil yükleniyor...</p>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="profile-page-shell ui-v2-screen py-8">
        <div className="mx-4 flex min-h-[50vh] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/15 p-8 text-center">
          <p className="text-lg font-semibold text-white">Kullanıcı bulunamadı</p>
          <p className="max-w-sm text-sm text-[rgb(var(--nah-text-muted))]">
            @{username} geçerli bir profil değil veya henüz kayıt tamamlanmamış.
          </p>
          <Link href={ROUTES.FEED}>
            <Button variant="primary">Ana sayfaya dön</Button>
          </Link>
        </div>
      </div>
    )
  }

  const isOwnProfile = Boolean(authUser && authUser.uid === profile.uid)

  return (
    <div className="profile-page-shell ui-v2-screen w-full pb-8">
      {isOwnProfile && authUser && <ProfileCompleteModal user={authUser} />}

      <ProfileHeader
        user={profile}
        isOwnProfile={isOwnProfile}
        isFollowing={isFollowing}
        onFollowChange={(next) => {
          setIsFollowing(next)
          refreshCounts(next ? 1 : -1)
        }}
      />

      <div className="space-y-3 pb-3">
        <ProfileBadges user={profile} />
      </div>

      <ProfileTabs
        userId={profile.uid}
        username={profile.username}
        isOwnProfile={isOwnProfile}
        user={profile}
        initialPosts={initialPosts}
      />
    </div>
  )
}

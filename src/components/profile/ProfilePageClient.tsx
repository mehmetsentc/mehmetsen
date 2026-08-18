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
import { ProfileReadingStats } from './ProfileReadingStats'
import { ProfileMostRead } from './ProfileMostRead'
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

  // Race condition recovery: Apple Sign-In writes the Firestore doc asynchronously.
  // If the user taps the profile icon before the write completes, the server renders
  // "not found". Once auth settles and we confirm the URL matches the logged-in
  // user's username, retry the client-side fetch.
  useEffect(() => {
    if (profile || loading || authLoading || !authUser) return
    if (authUser.username !== username) return // not the user's own profile
    const timer = setTimeout(() => void refresh(), 1500)
    return () => clearTimeout(timer)
  }, [profile, loading, authLoading, authUser, username, refresh])

  if (loading) {
    return (
      <div className="profile-page-shell flex min-h-[50vh] flex-col items-center justify-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-[rgb(var(--color-muted))]">Profil yükleniyor...</p>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="profile-page-shell py-8">
        <div className="profile-card flex min-h-[50vh] flex-col items-center justify-center gap-4 border-dashed p-8 text-center">
          <p className="text-lg font-semibold text-[rgb(var(--color-text))]">Kullanıcı bulunamadı</p>
          <p className="max-w-sm text-sm text-[rgb(var(--color-muted))]">
            @{username} geçerli bir profil değil veya henüz kayıt tamamlanmamış.
          </p>
          <Link href={ROUTES.FEED}>
            <Button variant="primary">Ana sayfaya dön</Button>
          </Link>
        </div>
      </div>
    )
  }

  const isOwnProfile = authUser?.uid === profile.uid

  return (
    <div className="profile-page-shell w-full space-y-2 pb-6">
      {/* Kendi profilindeyse ve profil eksikse tamamlama popup'ı göster */}
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

      {/* F5: Rozetler + okuma istatistikleri */}
      <div className="profile-page-section">
        <ProfileBadges user={profile} />
        <ProfileReadingStats userId={profile.uid} isOwnProfile={isOwnProfile} />
      </div>

      {/* Most-read horizontal scroll */}
      {initialPosts.length > 0 && (
        <ProfileMostRead posts={initialPosts} />
      )}

      <ProfileTabs
        userId={profile.uid}
        username={profile.username}
        isOwnProfile={isOwnProfile}
        initialPosts={initialPosts}
      />
    </div>
  )
}

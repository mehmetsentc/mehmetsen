'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useMyPublishers } from '@/hooks/useMyPublishers'
import { useProfile } from '@/hooks/useProfile'
import { ProfileHeader } from './ProfileHeader'
import { ProfileTabs } from './ProfileTabs'
import { ProfileCompleteModal } from './ProfileCompleteModal'
import { ProfileBadges } from './ProfileBadges'
import { ProfileReadingStats } from './ProfileReadingStats'
import { ProfileMostRead } from './ProfileMostRead'
import { resolvePublisherProfileHref } from '@/lib/nav/publisherProfileNav'
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
  const router = useRouter()
  const { user: authUser, loading: authLoading } = useAuth()
  const { publishers, loading: publishersLoading, isPublisher } = useMyPublishers()
  const { profile, loading, error, isFollowing, setIsFollowing, refreshCounts, refresh } = useProfile(
    username,
    authUser?.uid,
    { initialProfile, fromServer: true }
  )

  // Race recovery: auth username ready before Firestore doc exists.
  useEffect(() => {
    if (profile || loading || authLoading || !authUser) return
    if (authUser.username !== username && authUser.uid !== username) return
    const timer = setTimeout(() => void refresh(), 1500)
    return () => clearTimeout(timer)
  }, [profile, loading, authLoading, authUser, username, refresh])

  // Own profile → publisher brand page (usable yayıncı profili).
  useEffect(() => {
    if (authLoading || publishersLoading || !authUser || !isPublisher) return
    const isOwn =
      Boolean(profile && authUser.uid === profile.uid) ||
      authUser.username === username ||
      authUser.uid === username
    if (!isOwn) return
    const href = resolvePublisherProfileHref(publishers)
    if (href) router.replace(href)
  }, [
    authLoading,
    publishersLoading,
    authUser,
    isPublisher,
    publishers,
    profile,
    username,
    router,
  ])

  if (authLoading || publishersLoading || loading) {
    return (
      <div className="profile-page-shell flex min-h-[50vh] flex-col items-center justify-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-[rgb(var(--color-muted))]">Profil yükleniyor...</p>
      </div>
    )
  }

  if (!authUser) {
    return (
      <div className="profile-page-shell py-8">
        <div className="profile-card flex min-h-[50vh] flex-col items-center justify-center gap-4 border-dashed p-8 text-center">
          <p className="text-lg font-semibold text-[rgb(var(--color-text))]">
            Profil yalnızca yayıncılara açık
          </p>
          <p className="max-w-sm text-sm text-[rgb(var(--color-muted))]">
            Görüntülemek için giriş yapın. Profil sayfası yayıncı hesapları içindir.
          </p>
          <Link href={ROUTES.LOGIN}>
            <Button variant="primary">Giriş yap</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (!isPublisher) {
    return (
      <div className="profile-page-shell py-8">
        <div className="profile-card flex min-h-[50vh] flex-col items-center justify-center gap-4 border-dashed p-8 text-center">
          <p className="text-lg font-semibold text-[rgb(var(--color-text))]">
            Yayıncı profili gerekli
          </p>
          <p className="max-w-sm text-sm text-[rgb(var(--color-muted))]">
            Bu sayfa yalnızca yayıncı üyelerine görünür. Yayına üye değilseniz profil
            kullanılamaz.
          </p>
          <Link href={ROUTES.FEED}>
            <Button variant="primary">Ana sayfaya dön</Button>
          </Link>
        </div>
      </div>
    )
  }

  // Own publisher redirect in flight
  const isOwnProfile =
    Boolean(profile && authUser.uid === profile.uid) ||
    authUser.username === username ||
    authUser.uid === username
  if (isOwnProfile && resolvePublisherProfileHref(publishers)) {
    return (
      <div className="profile-page-shell flex min-h-[50vh] flex-col items-center justify-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-[rgb(var(--color-muted))]">Yayıncı profiline yönlendiriliyor...</p>
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

  return (
    <div className="profile-page-shell w-full space-y-2 pb-6">
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

      <div className="profile-page-section">
        <ProfileBadges user={profile} />
        <ProfileReadingStats userId={profile.uid} isOwnProfile={isOwnProfile} />
      </div>

      {initialPosts.length > 0 && <ProfileMostRead posts={initialPosts} />}

      <ProfileTabs
        userId={profile.uid}
        username={profile.username}
        isOwnProfile={isOwnProfile}
        initialPosts={initialPosts}
      />
    </div>
  )
}

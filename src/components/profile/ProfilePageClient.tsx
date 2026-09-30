'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { ProfileHeader } from './ProfileHeader'
import { ProfileTabs } from './ProfileTabs'
import { ProfileCompleteModal } from './ProfileCompleteModal'
import { ProfileBadges } from './ProfileBadges'
import { ProfileReadingStats } from './ProfileReadingStats'
import { ProfileAboutCard } from './platform/ProfileAboutCard'
import { ProfilePageSkeleton } from './platform/ProfilePageSkeleton'
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

  // Race recovery: auth username ready before Firestore doc exists.
  useEffect(() => {
    if (profile || loading || authLoading || !authUser) return
    if (authUser.username !== username && authUser.uid !== username) return
    const timer = setTimeout(() => void refresh(), 1500)
    return () => clearTimeout(timer)
  }, [profile, loading, authLoading, authUser, username, refresh])

  if (authLoading || loading) {
    return <ProfilePageSkeleton />
  }

  if (error || !profile) {
    return (
      <div className="profile-page-shell py-8">
        <div className="profile-card flex min-h-[50vh] flex-col items-center justify-center gap-4 border-dashed p-8 text-center">
          <p className="text-lg font-semibold text-[rgb(var(--color-text))]">Kullanıcı bulunamadı</p>
          <p className="max-w-sm text-sm text-[rgb(var(--color-muted))]">
            @{username} geçerli bir profil değil veya henüz kayıt tamamlanmamış.
          </p>
          <Link prefetch={false} href={ROUTES.FEED}>
            <Button variant="primary">Ana sayfaya dön</Button>
          </Link>
        </div>
      </div>
    )
  }

  const isOwnProfile = Boolean(authUser && authUser.uid === profile.uid)

  const about = profile.bio || profile.location || profile.website ? (
    <ProfileAboutCard title="Hakkında">
      {profile.bio ? <p className="whitespace-pre-wrap break-words">{profile.bio}</p> : null}
      {profile.location ? <p className="text-[rgb(var(--color-muted))]">{profile.location}</p> : null}
      {profile.website ? (
        <a
          href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[rgb(var(--color-brand))] hover:underline"
        >
          {profile.website.replace(/^https?:\/\//, '')}
        </a>
      ) : null}
    </ProfileAboutCard>
  ) : null

  return (
    <div className="profile-page-shell w-full pb-[calc(var(--mobile-nav-pill-h,3rem)+var(--mobile-nav-float-gap,1.15rem)+env(safe-area-inset-bottom,0px)+1.5rem)]" data-profile-view={isOwnProfile ? 'own' : 'user'}>
      {isOwnProfile && authUser && <ProfileCompleteModal user={authUser} />}

      <div className={isOwnProfile || about ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-8' : undefined}>
        <div className="min-w-0">
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
            initialPosts={initialPosts}
          />
        </div>

        <div className={isOwnProfile || about ? 'mt-6 hidden space-y-4 lg:mt-7 lg:block' : 'hidden'}>
          {about}
          {isOwnProfile ? (
            <>
              <ProfileBadges user={profile} showLocked />
              <ProfileReadingStats userId={profile.uid} isOwnProfile />
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

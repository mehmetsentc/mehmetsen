'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Bookmark, Settings, SlidersHorizontal } from 'lucide-react'
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
          <Link href={ROUTES.FEED}>
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

  const ownerLinks = isOwnProfile ? (
    <nav aria-label="Profil sahibi" className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-2">
      <OwnerLink href={ROUTES.SETTINGS_PROFILE} icon={SlidersHorizontal} label="Profili düzenle" />
      <OwnerLink href={ROUTES.SETTINGS} icon={Settings} label="Ayarlar" />
      <OwnerLink href={ROUTES.SAVED} icon={Bookmark} label="Kaydedilenler" />
    </nav>
  ) : null

  return (
    <div className="profile-page-shell w-full pb-8" data-profile-view={isOwnProfile ? 'own' : 'user'}>
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

          <div className="mb-4 space-y-3 lg:hidden">
            {ownerLinks}
          </div>

          <ProfileTabs
            userId={profile.uid}
            username={profile.username}
            isOwnProfile={isOwnProfile}
            initialPosts={initialPosts}
          />
        </div>

        <div className={isOwnProfile || about ? 'mt-6 hidden space-y-4 lg:mt-7 lg:block' : 'hidden'}>
          {about}
          {ownerLinks}
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

function OwnerLink({
  href,
  label,
  icon: Icon,
}: {
  href: string
  label: string
  icon: typeof Settings
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-nav-hover))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--color-brand))]"
    >
      <Icon className="h-4 w-4 text-[rgb(var(--color-muted))]" aria-hidden />
      {label}
    </Link>
  )
}

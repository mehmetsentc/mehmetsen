'use client'

import Link from 'next/link'
import { Settings } from 'lucide-react'
import type { User } from '@/types/user'
import { Avatar } from '@/components/ui/Avatar'
import { FollowButton } from './FollowButton'
import { MessageButton } from '@/components/messages/MessageButton'
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
  return (
    <header className="px-4 py-6 sm:px-0 sm:py-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10 md:gap-14">
        <div className="flex justify-center sm:justify-start">
          <div className="profile-avatar-ring">
            <div className="rounded-full bg-[rgb(var(--color-surface))] p-[3px]">
              <Avatar name={user.displayName} src={user.photoURL} size="xl" />
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
              <h1 className="text-xl font-normal text-[rgb(var(--color-text))] sm:text-[28px]">
                {user.username}
              </h1>
              {isOwnProfile ? (
                <div className="flex gap-2">
                  <Link href={ROUTES.SETTINGS} className="profile-edit-btn">
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

          <div className="mt-4 flex justify-center gap-8 text-sm sm:justify-start md:gap-10">
            <div>
              <span className="font-semibold text-[rgb(var(--color-text))]">
                {formatCount(user.postsCount)}
              </span>{' '}
              <span className="text-[rgb(var(--color-text))]">gönderi</span>
            </div>
            <div>
              <span className="font-semibold text-[rgb(var(--color-text))]">
                {formatCount(user.followersCount)}
              </span>{' '}
              <span className="text-[rgb(var(--color-text))]">takipçi</span>
            </div>
            <div>
              <span className="font-semibold text-[rgb(var(--color-text))]">
                {formatCount(user.followingCount)}
              </span>{' '}
              <span className="text-[rgb(var(--color-text))]">takip</span>
            </div>
          </div>

          <div className="mt-4 text-center sm:text-left">
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
    </header>
  )
}

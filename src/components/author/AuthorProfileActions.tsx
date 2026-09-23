'use client'

import { Bookmark, Heart, Loader2, Star } from 'lucide-react'
import { FollowButton } from '@/components/profile/FollowButton'
import { MessageButton } from '@/components/messages/MessageButton'
import { useFavoriteAuthor } from '@/hooks/useFavoriteAuthor'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import type { PublicAuthorProfile } from '@/services/newsService.server'
import type { User } from '@/types/user'

function authorAsUser(author: PublicAuthorProfile): User {
  return {
    uid: author.uid,
    username: author.username,
    displayName: author.displayName,
    email: '',
    photoURL: author.photoURL,
    bio: author.bio,
    website: author.website,
    location: author.location,
    role: 'author',
    department: author.department,
    isVerified: author.isVerified,
    isBlocked: false,
    followersCount: 0,
    followingCount: 0,
    postsCount: author.postsCount,
    onboardingCompleted: true,
    createdAt: '',
    updatedAt: '',
  }
}

export function AuthorProfileActions({ author }: { author: PublicAuthorProfile }) {
  const { user } = useAuth()
  const isOwn = Boolean(user?.uid && user.uid === author.uid)
  const { saved, loading, toggle } = useFavoriteAuthor(author.uid)

  if (isOwn) return null

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="author-profile-actions">
      <FollowButton targetUserId={author.uid} isFollowing={false} />
      <MessageButton
        targetUser={authorAsUser(author)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm font-semibold"
      />
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={loading}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-60',
          saved
            ? 'border-[rgb(var(--color-brand))] bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]'
            : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))]'
        )}
        aria-label={saved ? 'Favorilerden çıkar' : 'Favorilere ekle'}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : saved ? (
          <Star className="h-4 w-4 fill-current" />
        ) : (
          <Bookmark className="h-4 w-4" />
        )}
        {saved ? 'Kaydedildi' : 'Kaydet'}
      </button>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={loading}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-60',
          saved
            ? 'border-[rgb(var(--color-brand))] text-[rgb(var(--color-brand))]'
            : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-text))]'
        )}
      >
        <Heart className={cn('h-4 w-4', saved && 'fill-current')} />
        {saved ? 'Favorilerde' : 'Favorilere ekle'}
      </button>
    </div>
  )
}

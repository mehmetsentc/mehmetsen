'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { useFollow } from '@/hooks/useFollow'

interface FollowButtonProps {
  targetUserId: string
  isFollowing: boolean
  onFollowChange?: (isFollowing: boolean) => void
}

export function FollowButton({ targetUserId, isFollowing, onFollowChange }: FollowButtonProps) {
  const { user } = useAuth()
  const { following, loading, toggle, setFollowing } = useFollow(
    user?.uid,
    targetUserId,
    isFollowing
  )

  useEffect(() => {
    setFollowing(isFollowing)
  }, [isFollowing, setFollowing])

  const handleClick = async () => {
    const next = await toggle()
    if (typeof next === 'boolean') {
      onFollowChange?.(next)
    }
  }

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      variant={following ? 'secondary' : 'primary'}
      size="md"
    >
      {loading ? 'İşleniyor...' : following ? 'Takipten Çık' : 'Takip Et'}
    </Button>
  )
}

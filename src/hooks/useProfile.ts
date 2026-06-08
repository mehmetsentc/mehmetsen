'use client'

import { useState, useEffect, useCallback } from 'react'
import { userService } from '@/services/userService'
import { followService } from '@/services/followService'
import type { User } from '@/types/user'

export function useProfile(username: string, currentUserId?: string) {
  const [profile, setProfile] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const user = await userService.getByUsername(username)
      if (!user) {
        setProfile(null)
        setError('Kullanıcı bulunamadı')
        return
      }

      setProfile(user)

      if (currentUserId && currentUserId !== user.uid) {
        const following = await followService.isFollowing(currentUserId, user.uid)
        setIsFollowing(following)
      } else {
        setIsFollowing(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profil yüklenemedi')
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [username, currentUserId])

  useEffect(() => {
    load()
  }, [load])

  const refreshCounts = useCallback(
    async (followersDelta = 0) => {
      if (!profile) return
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              followersCount: Math.max(0, prev.followersCount + followersDelta),
            }
          : prev
      )
    },
    [profile]
  )

  return {
    profile,
    loading,
    error,
    isFollowing,
    setIsFollowing,
    refresh: load,
    refreshCounts,
  }
}

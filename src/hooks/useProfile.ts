'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { userService } from '@/services/userService'
import { followService } from '@/services/followService'
import type { User } from '@/types/user'

export function useProfile(username: string, currentUserId?: string) {
  const [profile, setProfile] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)

  // Profil yüklemesi auth state'ten bağımsız — sadece username değişince tekrar çalışır.
  // Bu sayede auth geç geldiğinde (uid undefined→uid) ikinci bir yükleme tetiklenmez.
  const loadProfile = useCallback(async () => {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profil yüklenemedi')
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [username])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  // Takip durumu ayrı bir effect — profil ve auth hazır olunca bir kez çalışır.
  // Profile load'u tetiklemez, sadece isFollowing günceller.
  const followChecked = useRef<string | null>(null)
  useEffect(() => {
    if (!profile || !currentUserId || currentUserId === profile.uid) {
      setIsFollowing(false)
      followChecked.current = null
      return
    }
    const key = `${currentUserId}:${profile.uid}`
    if (followChecked.current === key) return
    followChecked.current = key

    followService.isFollowing(currentUserId, profile.uid)
      .then((following) => setIsFollowing(following))
      .catch(() => setIsFollowing(false))
  }, [profile, currentUserId])

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
    refresh: loadProfile,
    refreshCounts,
  }
}

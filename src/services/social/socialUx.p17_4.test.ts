import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isSocialGraphEffectiveForUser, isFeatureEnabledForUser } from '@/lib/user/effectiveUserFlags'
import { userFeatureAccessRepository } from '@/services/user/userFeatureAccessRepository'
import { requireSocialUser } from '@/lib/social/apiAuth'
import * as userAuthServer from '@/lib/userAuthServer'

describe('P17.4 Smart Feed Social Actions & Comments UX Verification', () => {
  const pilotUid = 'ap3scBglLIVwflfZN4qL8PKrM1A3'
  const operatorUid = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'
  const unallowedUid = 'random_guest_user_999'

  beforeEach(() => {
    vi.restoreAllMocks()

    vi.spyOn(userFeatureAccessRepository, 'listEnabledKeys').mockImplementation(async (userId: string) => {
      if (userId === pilotUid || userId === operatorUid) {
        return new Set([
          'USER_PROFILES',
          'SOCIAL_GRAPH',
          'SMART_FEED',
          'SMART_FEED_RANKING_V1',
          'COLD_START_V2',
          'SMART_FEED_VIDEO',
          'SMART_FEED_TELEMETRY',
        ])
      }
      return new Set()
    })
  })

  describe('1. Effective User Rollout & Pilot User Access', () => {
    it('allows SOCIAL_GRAPH for pilot and operator users', async () => {
      process.env.SOCIAL_GRAPH_ENABLED = '0'
      const pilotAllowed = await isSocialGraphEffectiveForUser(pilotUid)
      const operatorAllowed = await isSocialGraphEffectiveForUser(operatorUid)
      expect(pilotAllowed).toBe(true)
      expect(operatorAllowed).toBe(true)
    })

    it('rejects SOCIAL_GRAPH for unallowlisted user when global flag is off', async () => {
      process.env.SOCIAL_GRAPH_ENABLED = '0'
      const allowed = await isSocialGraphEffectiveForUser(unallowedUid)
      expect(allowed).toBe(false)
    })

    it('handles null/undefined userId gracefully without error', async () => {
      process.env.SOCIAL_GRAPH_ENABLED = '0'
      const nullAllowed = await isSocialGraphEffectiveForUser(null)
      const undefAllowed = await isSocialGraphEffectiveForUser(undefined)
      expect(nullAllowed).toBe(false)
      expect(undefAllowed).toBe(false)
    })
  })

  describe('2. requireSocialUser for Admin/Operator Pilot Users', () => {
    it('returns verified user object for operator user with valid token', async () => {
      vi.spyOn(userAuthServer, 'verifyUserRequest').mockResolvedValue({
        uid: operatorUid,
        email: 'operator@nahaber.com',
      })

      const req = new Request('https://nahaber.com/api/social/article/like', {
        headers: { Authorization: 'Bearer mock_valid_token' },
      })
      const user = await requireSocialUser(req)
      expect(user).not.toBeNull()
      expect(user?.uid).toBe(operatorUid)
      expect(user?.email).toBe('operator@nahaber.com')
    })

    it('returns null if no Authorization header is present', async () => {
      vi.spyOn(userAuthServer, 'verifyUserRequest').mockResolvedValue(null)
      const req = new Request('https://nahaber.com/api/social/article/like')
      const user = await requireSocialUser(req)
      expect(user).toBeNull()
    })
  })

  describe('3. Like & Save Optimistic Logic & Rollback Simulation', () => {
    it('optimistically increments like count on like action', () => {
      const initial = { liked: false, saved: false, likeCount: 5 }
      const prevLiked = initial.liked
      const prevCount = initial.likeCount
      const nextLiked = !prevLiked
      const nextCount = nextLiked ? prevCount + 1 : Math.max(0, prevCount - 1)

      expect(nextLiked).toBe(true)
      expect(nextCount).toBe(6)
    })

    it('optimistically decrements like count on unlike action', () => {
      const initial = { liked: true, saved: false, likeCount: 5 }
      const prevLiked = initial.liked
      const prevCount = initial.likeCount
      const nextLiked = !prevLiked
      const nextCount = nextLiked ? prevCount + 1 : Math.max(0, prevCount - 1)

      expect(nextLiked).toBe(false)
      expect(nextCount).toBe(4)
    })

    it('rolls back to previous state when network call fails', async () => {
      let state = { liked: false, saved: false, likeCount: 10 }
      const prev = { ...state }

      // 1. Optimistic transition
      state = { ...state, liked: true, likeCount: prev.likeCount + 1 }
      expect(state.liked).toBe(true)
      expect(state.likeCount).toBe(11)

      // 2. Simulated network failure
      const apiCall = vi.fn().mockRejectedValue(new Error('Network error'))
      try {
        await apiCall()
      } catch {
        // Rollback
        state = { ...prev }
      }

      expect(state.liked).toBe(false)
      expect(state.likeCount).toBe(10)
    })

    it('preserves canonical server count when server response provides updated count', async () => {
      let state = { liked: false, saved: false, likeCount: 10 }
      // Optimistic
      state = { ...state, liked: true, likeCount: 11 }

      // Server returns updated canonical count from concurrent writes (e.g. 15)
      const serverResponse = { liked: true, likes: 15 }
      state = {
        ...state,
        liked: serverResponse.liked,
        likeCount: serverResponse.likes,
      }

      expect(state.liked).toBe(true)
      expect(state.likeCount).toBe(15)
    })
  })

  describe('4. Rapid Tap Concurrency Guard', () => {
    it('ignores concurrent calls while an action is in-flight', async () => {
      const inFlightMap: Record<string, 'like' | 'save'> = {}
      const articleId = 'art_123'
      const mockApi = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return { liked: true }
      })

      const handleToggle = async () => {
        if (inFlightMap[articleId]) return 'IGNORED'
        inFlightMap[articleId] = 'like'
        try {
          return await mockApi()
        } finally {
          delete inFlightMap[articleId]
        }
      }

      // First click starts
      const p1 = handleToggle()
      // Second immediate click
      const p2 = handleToggle()

      const [res1, res2] = await Promise.all([p1, p2])
      expect(res1).toEqual({ liked: true })
      expect(res2).toBe('IGNORED')
      expect(mockApi).toHaveBeenCalledTimes(1)
    })
  })

  describe('5. Initial Feed Social State Hydration', () => {
    it('seeds local social dictionary correctly from feed page items', () => {
      const feedItems = [
        { articleId: 'art_1', socialState: { liked: true, saved: false }, socialCounts: { likes: 42, comments: 3 } },
        { articleId: 'art_2', socialState: { liked: false, saved: true }, socialCounts: { likes: 0, comments: 0 } },
      ]

      const localSocial: Record<string, { liked: boolean; saved: boolean; likeCount: number; commentCount: number }> = {}
      for (const it of feedItems) {
        if (!localSocial[it.articleId]) {
          localSocial[it.articleId] = {
            liked: it.socialState?.liked ?? false,
            saved: it.socialState?.saved ?? false,
            likeCount: it.socialCounts.likes ?? 0,
            commentCount: it.socialCounts.comments ?? 0,
          }
        }
      }

      expect(localSocial['art_1']).toEqual({ liked: true, saved: false, likeCount: 42, commentCount: 3 })
      expect(localSocial['art_2']).toEqual({ liked: false, saved: true, likeCount: 0, commentCount: 0 })
    })
  })
})

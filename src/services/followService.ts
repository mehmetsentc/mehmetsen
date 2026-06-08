import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocsFromServer,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
  query,
  where,
} from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'
import { enqueueFirestoreRead } from '@/lib/firestoreQueue'
import { generateFollowId } from '@/lib/utils'
import { userService } from '@/services/userService'
import { notificationService } from '@/services/notificationService'

const FOLLOWS_CACHE_TTL_MS = 60_000

type FollowsList = {
  ids: string[]
  usernames: Set<string>
  at: number
}

const followsListCache = new Map<string, FollowsList>()
const followsListInflight = new Map<string, Promise<FollowsList>>()

function invalidateFollowsCache(followerId: string) {
  followsListCache.delete(followerId)
}

async function fetchUsernamesByUids(uids: string[]): Promise<string[]> {
  if (uids.length === 0) return []

  const unique = [...new Set(uids)]
  const usernames: string[] = []

  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10)
    const snap = await enqueueFirestoreRead(() =>
      getDocsFromServer(
        query(collection(db, Collections.USERS), where(documentId(), 'in', chunk))
      )
    )
    for (const userDoc of snap.docs) {
      const username = userDoc.data().username as string | undefined
      if (username) usernames.push(username.toLowerCase())
    }
  }

  return usernames
}

async function fetchFollowsList(followerId: string): Promise<FollowsList> {
  const cached = followsListCache.get(followerId)
  if (cached && Date.now() - cached.at < FOLLOWS_CACHE_TTL_MS) {
    return cached
  }

  const inflight = followsListInflight.get(followerId)
  if (inflight) return inflight

  const promise = (async () => {
    const snap = await enqueueFirestoreRead(() =>
      getDocsFromServer(
        query(collection(db, Collections.FOLLOWS), where('followerId', '==', followerId))
      )
    )

    const ids: string[] = []
    const usernamesFromDoc: string[] = []
    const missingUsernameIds: string[] = []

    for (const followDoc of snap.docs) {
      const data = followDoc.data()
      const followingId = data.followingId as string | undefined
      if (!followingId) continue

      ids.push(followingId)

      const storedUsername = data.followingUsername as string | undefined
      if (storedUsername) {
        usernamesFromDoc.push(storedUsername.toLowerCase())
      } else {
        missingUsernameIds.push(followingId)
      }
    }

    const batchUsernames = await fetchUsernamesByUids(missingUsernameIds)
    const usernames = new Set([...usernamesFromDoc, ...batchUsernames])
    const result: FollowsList = { ids, usernames, at: Date.now() }

    followsListCache.set(followerId, result)
    return result
  })()

  followsListInflight.set(followerId, promise)

  try {
    return await promise
  } finally {
    followsListInflight.delete(followerId)
  }
}

export const followService = {
  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    if (!followerId || !followingId || followerId === followingId) return false
    try {
      const snap = await getDoc(
        doc(db, Collections.FOLLOWS, generateFollowId(followerId, followingId))
      )
      return snap.exists()
    } catch {
      return false
    }
  },

  async follow(followerId: string, followingId: string): Promise<void> {
    if (followerId === followingId) {
      throw new Error('Kendi kendinizi takip edemezsiniz')
    }

    const followId = generateFollowId(followerId, followingId)
    const followRef = doc(db, Collections.FOLLOWS, followId)
    const existing = await getDoc(followRef)
    if (existing.exists()) return

    const targetUser = await userService.getByUid(followingId)
    const followingUsername = targetUser?.username?.toLowerCase() ?? null

    await setDoc(followRef, {
      followerId,
      followingId,
      ...(followingUsername ? { followingUsername } : {}),
      createdAt: new Date().toISOString(),
    })

    invalidateFollowsCache(followerId)

    await Promise.all([
      updateDoc(doc(db, Collections.USERS, followerId), {
        followingCount: increment(1),
        updatedAt: new Date().toISOString(),
      }),
      updateDoc(doc(db, Collections.USERS, followingId), {
        followersCount: increment(1),
        updatedAt: new Date().toISOString(),
      }),
    ])

    // Notify the followed user (best-effort — never breaks the follow).
    try {
      await notificationService.createNotification({
        userId: followingId,
        type: 'follow',
        actorId: followerId,
      })
    } catch {
      // Notification failures are non-fatal.
    }
  },

  async unfollow(followerId: string, followingId: string): Promise<void> {
    const followId = generateFollowId(followerId, followingId)
    const followRef = doc(db, Collections.FOLLOWS, followId)
    const existing = await getDoc(followRef)
    if (!existing.exists()) return

    await deleteDoc(followRef)
    invalidateFollowsCache(followerId)

    await Promise.all([
      updateDoc(doc(db, Collections.USERS, followerId), {
        followingCount: increment(-1),
        updatedAt: new Date().toISOString(),
      }),
      updateDoc(doc(db, Collections.USERS, followingId), {
        followersCount: increment(-1),
        updatedAt: new Date().toISOString(),
      }),
    ])
  },

  async getFollowingIds(followerId: string): Promise<string[]> {
    if (!followerId) return []

    try {
      const { ids } = await fetchFollowsList(followerId)
      return ids
    } catch {
      return []
    }
  },

  async getFollowingUsernames(followerId: string): Promise<Set<string>> {
    if (!followerId) return new Set()

    try {
      const { usernames } = await fetchFollowsList(followerId)
      return usernames
    } catch {
      return new Set()
    }
  },

  async toggle(followerId: string, followingId: string, currentlyFollowing: boolean): Promise<boolean> {
    if (currentlyFollowing) {
      await this.unfollow(followerId, followingId)
      return false
    }
    await this.follow(followerId, followingId)
    return true
  },
}

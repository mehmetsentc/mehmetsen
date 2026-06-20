import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  updateDoc,
} from 'firebase/firestore'
import { slugifyCity } from '@/lib/location'
import { db, Collections, VIDEO_FEED_COLLECTION } from '@/lib/firebase/firestore'
import { enqueueFirestoreRead } from '@/lib/firestoreQueue'
import type { User } from '@/types/user'

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

function isValidUserData(data: Record<string, unknown>): boolean {
  return (
    typeof data.uid === 'string' &&
    typeof data.username === 'string' &&
    typeof data.displayName === 'string' &&
    typeof data.email === 'string' &&
    'createdAt' in data
  )
}

function normalizeUser(uid: string, data: Record<string, unknown>): User {
  return {
    uid: (data.uid as string) ?? uid,
    username: (data.username as string) ?? '',
    displayName: (data.displayName as string) ?? 'Kullanıcı',
    email: (data.email as string) ?? '',
    photoURL: (data.photoURL as string | null) ?? null,
    bio: (data.bio as string | null) ?? null,
    website: (data.website as string | null) ?? null,
    location: (data.location as string | null) ?? null,
    role: (data.role as User['role']) ?? 'user',
    isVerified: Boolean(data.isVerified),
    isBlocked: Boolean(data.isBlocked),
    followersCount: Number(data.followersCount ?? 0),
    followingCount: Number(data.followingCount ?? 0),
    postsCount: Number(data.postsCount ?? 0),
    // Legacy users predating onboarding lack this field — treat them as
    // already onboarded so they are never trapped in the onboarding flow.
    onboardingCompleted: data.onboardingCompleted === undefined ? true : Boolean(data.onboardingCompleted),
    citySlug: (data.citySlug as string | null | undefined) ?? null,
    interests: Array.isArray(data.interests) ? (data.interests as string[]) : [],
    favoriteCategories: Array.isArray(data.favoriteCategories)
      ? (data.favoriteCategories as string[])
      : [],
    createdAt: (data.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (data.updatedAt as string) ?? new Date().toISOString(),
  }
}

export const userService = {
  normalizeUsername,

  async getByUid(uid: string): Promise<User | null> {
    const snap = await enqueueFirestoreRead(() => getDoc(doc(db, Collections.USERS, uid)))
    if (!snap.exists()) return null
    const data = snap.data() as Record<string, unknown>
    if (!isValidUserData(data)) return null
    return normalizeUser(uid, data)
  },

  async getByUsername(username: string): Promise<User | null> {
    const normalized = normalizeUsername(username)
    const snap = await getDocs(
      query(
        collection(db, Collections.USERS),
        where('username', '==', normalized),
        limit(1)
      )
    )
    if (snap.empty) return null
    const docSnap = snap.docs[0]
    const data = docSnap.data() as Record<string, unknown>
    if (!isValidUserData(data)) return null
    return normalizeUser(docSnap.id, data)
  },

  async isUsernameAvailable(username: string): Promise<boolean> {
    const existing = await this.getByUsername(username)
    return existing === null
  },

  async updateProfile(
    uid: string,
    data: Partial<
      Pick<
        User,
        'username' | 'displayName' | 'bio' | 'photoURL' | 'website' | 'location' | 'onboardingCompleted'
      >
    >
  ) {
    const payload: Record<string, unknown> = { ...data }
    if (typeof payload.username === 'string') {
      payload.username = normalizeUsername(payload.username)
    }
    await updateDoc(doc(db, Collections.USERS, uid), {
      ...payload,
      updatedAt: new Date().toISOString(),
    })
  },

  async completeOnboarding(
    uid: string,
    data: {
      username?: string
      displayName?: string
      bio?: string | null
      photoURL?: string | null
      website?: string | null
      location?: string | null
      favoriteCategories?: string[]
      interests?: string[]
      favoriteTeam?: string
      favoriteSport?: string
    }
  ) {
    const { favoriteCategories, interests, favoriteTeam, favoriteSport, ...profileData } = data
    const citySlug = profileData.location?.trim() ? slugifyCity(profileData.location.trim()) : null
    await updateDoc(doc(db, Collections.USERS, uid), {
      ...profileData,
      ...(typeof profileData.username === 'string'
        ? { username: normalizeUsername(profileData.username) }
        : {}),
      citySlug,
      ...(favoriteCategories !== undefined ? { favoriteCategories } : {}),
      ...(interests !== undefined ? { interests } : {}),
      ...(favoriteTeam !== undefined ? { favoriteTeam } : {}),
      ...(favoriteSport !== undefined ? { favoriteSport } : {}),
      onboardingCompleted: true,
      updatedAt: new Date().toISOString(),
    })
  },

  async updateInterests(
    uid: string,
    data: { favoriteCategories?: string[]; interests?: string[]; favoriteTeam?: string; favoriteSport?: string }
  ) {
    await updateDoc(doc(db, Collections.USERS, uid), {
      ...data,
      updatedAt: new Date().toISOString(),
    })
  },

  async refreshPostsCount(uid: string, username: string): Promise<number> {
    const snap = await getDocs(
      query(collection(db, VIDEO_FEED_COLLECTION), where('author', '==', username))
    )
    const count = snap.size
    await updateDoc(doc(db, Collections.USERS, uid), {
      postsCount: count,
      updatedAt: new Date().toISOString(),
    })
    return count
  },
}

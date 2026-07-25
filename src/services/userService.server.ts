import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { User, UserRole } from '@/types/user'

function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase('tr-TR')
}

/**
 * Public profile for SSR — never expose email or auth-only fields.
 * Uses Admin SDK so the page does not wait on client Firestore.
 */
export async function getPublicUserByUsername(username: string): Promise<User | null> {
  const normalized = normalizeUsername(username)
  if (!normalized) return null

  try {
    const db = getAdminFirestore()
    const snap = await db
      .collection(Collections.USERS)
      .where('username', '==', normalized)
      .limit(1)
      .get()

    if (snap.empty) return null
    const doc = snap.docs[0]!
    const data = doc.data() as Record<string, unknown>
    if (data.isBlocked === true) return null

    const createdAt =
      typeof data.createdAt === 'string'
        ? data.createdAt
        : typeof (data.createdAt as { toDate?: () => Date } | undefined)?.toDate === 'function'
          ? (data.createdAt as { toDate: () => Date }).toDate().toISOString()
          : new Date().toISOString()
    const updatedAt =
      typeof data.updatedAt === 'string'
        ? data.updatedAt
        : typeof (data.updatedAt as { toDate?: () => Date } | undefined)?.toDate === 'function'
          ? (data.updatedAt as { toDate: () => Date }).toDate().toISOString()
          : createdAt

    return {
      uid: doc.id,
      username: String(data.username ?? normalized),
      displayName: String(data.displayName ?? data.username ?? 'Kullanıcı'),
      email: '',
      photoURL: (data.photoURL as string | null | undefined) ?? null,
      bio: (data.bio as string | null | undefined) ?? null,
      website: (data.website as string | null | undefined) ?? null,
      location: (data.location as string | null | undefined) ?? null,
      role: (data.role as UserRole | undefined) ?? 'user',
      department: data.department as string | undefined,
      isVerified: Boolean(data.isVerified),
      isBlocked: false,
      followersCount: Number(data.followersCount ?? 0),
      followingCount: Number(data.followingCount ?? 0),
      postsCount: Number(data.postsCount ?? 0),
      onboardingCompleted: true,
      citySlug: (data.citySlug as string | null | undefined) ?? null,
      interests: Array.isArray(data.interests) ? (data.interests as string[]) : [],
      favoriteCategories: Array.isArray(data.favoriteCategories)
        ? (data.favoriteCategories as string[])
        : [],
      favoriteTeam: (data.favoriteTeam as string | null | undefined) ?? null,
      favoriteSport: (data.favoriteSport as string | null | undefined) ?? null,
      termsAcceptedAt: null,
      createdAt,
      updatedAt,
    }
  } catch (error) {
    console.warn('[userService.server] getPublicUserByUsername failed:', error)
    return null
  }
}

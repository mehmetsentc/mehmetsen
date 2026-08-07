import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { auth, ensureAuthReady } from '@/lib/firebase/auth'
import { db, Collections } from '@/lib/firebase/firestore'
import { userService } from '@/services/userService'
import { syncCmsRoleFromServer } from '@/lib/admin'
import { signInWithGoogle } from '@/lib/googleAuth'
import { signInWithApple, consumeAppleProfile, type AppleProfile } from '@/lib/appleAuth'
import { enqueueFirestoreRead } from '@/lib/firestoreQueue'
import type { User } from '@/types/user'

function buildGoogleUsername(firebaseUser: FirebaseUser): string {
  const email = firebaseUser.email ?? ''
  const base = (email.split('@')[0] || 'user')
    .replace(/[^a-z0-9_]/gi, '_')
    .toLowerCase()
    .slice(0, 24)
  return `${base}_${firebaseUser.uid.slice(0, 6)}`
}

/**
 * Apple Sign-In sonrası Firestore profilini kurar.
 *
 * Apple ilk girişte email/name döner, sonraki girişlerde sadece UID gelir.
 * Kullanıcı "Hide my email" derse Firebase relay adresi (privaterelay.appleid.com)
 * gelir — yine de geçerli bir email'dir.
 *
 * **App Store Guideline 4 — Sign in with Apple**: Apple'ın sağladığı isim ve
 * e-posta bilgileri doğrudan profile yazılır ve `onboardingCompleted` true
 * olarak işaretlenir. Böylece kullanıcıya Apple'ın zaten verdiği bilgiler
 * tekrar sorulmaz. (Rejection fix: Submission 6e704c80, Aug 2026)
 */
export async function finalizeAppleSignIn(
  firebaseUser: FirebaseUser,
  appleProfile?: AppleProfile | null,
): Promise<void> {
  try {
    const userRef = doc(db, Collections.USERS, firebaseUser.uid)
    const userSnap = await enqueueFirestoreRead(() => getDoc(userRef))

    const appleGiven = appleProfile?.givenName?.trim() ?? ''
    const appleFamily = appleProfile?.familyName?.trim() ?? ''
    const appleName = [appleGiven, appleFamily].filter(Boolean).join(' ')
    const appleEmail = appleProfile?.email?.trim() ?? ''

    const displayName =
      appleName ||
      firebaseUser.displayName ||
      (firebaseUser.email?.split('@')[0] ?? firebaseUser.uid.slice(0, 8))

    const email = appleEmail || firebaseUser.email || ''

    if (appleName && firebaseUser.displayName !== appleName) {
      updateProfile(firebaseUser, { displayName: appleName }).catch(() => {})
    }

    if (!userSnap.exists()) {
      const username = buildGoogleUsername(firebaseUser)
      const userData: User = {
        uid: firebaseUser.uid,
        username,
        displayName,
        email,
        photoURL: firebaseUser.photoURL,
        bio: null,
        website: null,
        location: null,
        role: 'user',
        isVerified: false,
        isBlocked: false,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        onboardingCompleted: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await setDoc(userRef, userData)
    } else {
      const existing = userSnap.data() as Record<string, unknown>
      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }

      if (appleName && !existing.displayName) {
        updates.displayName = appleName
      }
      if (appleEmail && !existing.email) {
        updates.email = appleEmail
      }
      if (!existing.onboardingCompleted) {
        updates.onboardingCompleted = true
      }

      if (Object.keys(updates).length > 1) {
        await setDoc(userRef, updates, { merge: true })
      }
    }
  } catch (error) {
    console.error('[finalizeAppleSignIn] Firestore profile setup failed:', error)
  }

  try {
    const token = await firebaseUser.getIdToken()
    await syncCmsRoleFromServer(token)
  } catch {
    // CMS sync is best-effort.
  }
}

/** Create/update Firestore profile after Google popup or redirect sign-in. */
export async function finalizeGoogleSignIn(firebaseUser: FirebaseUser): Promise<void> {
  try {
    const userRef = doc(db, Collections.USERS, firebaseUser.uid)
    const userSnap = await enqueueFirestoreRead(() => getDoc(userRef))

    if (!userSnap.exists()) {
      const username = buildGoogleUsername(firebaseUser)
      const userData: User = {
        uid: firebaseUser.uid,
        username,
        displayName: firebaseUser.displayName ?? username,
        email: firebaseUser.email ?? '',
        photoURL: firebaseUser.photoURL,
        bio: null,
        website: null,
        location: null,
        role: 'user',
        isVerified: false,
        isBlocked: false,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        onboardingCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await setDoc(userRef, userData)
    }
  } catch (error) {
    console.error('[finalizeGoogleSignIn] Firestore profile setup failed:', error)
    // Firebase Auth already succeeded — AuthProvider falls back to a minimal profile.
  }

  try {
    const token = await firebaseUser.getIdToken()
    await syncCmsRoleFromServer(token)
  } catch {
    // CMS sync is best-effort — login should still succeed.
  }
}

export const authService = {
  async register(
    email: string,
    password: string,
    username: string,
    displayName: string
  ): Promise<User> {
    await ensureAuthReady()
    const normalizedUsername = userService.normalizeUsername(username)
    const available = await userService.isUsernameAvailable(normalizedUsername)
    if (!available) {
      throw Object.assign(new Error('Bu kullanıcı adı zaten alınmış'), { code: 'auth/username-taken' })
    }

    const credential = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(credential.user, { displayName })

    const userData: User = {
      uid: credential.user.uid,
      username: normalizedUsername,
      displayName,
      email,
      photoURL: null,
      bio: null,
      website: null,
      location: null,
      role: 'user',
      isVerified: false,
      isBlocked: false,
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      onboardingCompleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await setDoc(doc(db, Collections.USERS, credential.user.uid), userData)
    return userData
  },

  async login(email: string, password: string) {
    await ensureAuthReady()
    const credential = await signInWithEmailAndPassword(auth, email, password)
    return credential.user
  },

  async loginWithGoogle() {
    await ensureAuthReady()
    const result = await signInWithGoogle(auth)
    if (result === 'redirect') return null
    await finalizeGoogleSignIn(result.user)
    return result.user
  },

  async loginWithApple() {
    await ensureAuthReady()
    const result = await signInWithApple(auth)
    if (result === 'redirect') return null
    const appleProfile = consumeAppleProfile()
    await finalizeAppleSignIn(result.user, appleProfile)
    return result.user
  },

  async logout() {
    await signOut(auth)
    // CMS session cookie'sini temizle ki middleware admin sayfalarına erişimi engellesin
    try {
      await fetch('/api/auth/cms-logout', { method: 'POST', credentials: 'same-origin' })
    } catch {
      // Non-fatal — cookie expire olunca da kendiliğinden temizlenir.
    }
  },

  async getUserProfile(uid: string): Promise<User | null> {
    return userService.getByUid(uid)
  },
}

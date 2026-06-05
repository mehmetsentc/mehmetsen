import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import { db, Collections } from '@/lib/firebase/firestore'
import type { User } from '@/types/user'

export const authService = {
  async register(
    email: string,
    password: string,
    username: string,
    displayName: string
  ): Promise<User> {
    const credential = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(credential.user, { displayName })

    const userData: User = {
      uid: credential.user.uid,
      username,
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await setDoc(doc(db, Collections.USERS, credential.user.uid), userData)
    return userData
  },

  async login(email: string, password: string) {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    return credential.user
  },

  async loginWithGoogle() {
    const provider = new GoogleAuthProvider()
    const credential = await signInWithPopup(auth, provider)
    const userRef = doc(db, Collections.USERS, credential.user.uid)
    const userSnap = await getDoc(userRef)

    if (!userSnap.exists()) {
      const base = credential.user.email!.split('@')[0]
      const username = base.replace(/[^a-z0-9_]/gi, '_').toLowerCase()

      const userData: User = {
        uid: credential.user.uid,
        username,
        displayName: credential.user.displayName ?? username,
        email: credential.user.email!,
        photoURL: credential.user.photoURL,
        bio: null,
        website: null,
        location: null,
        role: 'user',
        isVerified: false,
        isBlocked: false,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await setDoc(userRef, userData)
    }

    return credential.user
  },

  async logout() {
    await signOut(auth)
  },

  async getUserProfile(uid: string): Promise<User | null> {
    const snap = await getDoc(doc(db, Collections.USERS, uid))
    if (!snap.exists()) return null
    return snap.data() as User
  },
}

// TODO: Implement in Phase 1
import { getFirestore, collection } from 'firebase/firestore'
import { firebaseApp } from './config'

export const db = getFirestore(firebaseApp)

export const Collections = {
  USERS:      'users',
  POSTS:      'posts',
  COMMENTS:   'comments',
  LIKES:      'likes',
  SAVES:      'saves',
  FOLLOWS:    'follows',
  CATEGORIES: 'categories',
  REPORTS:    'reports',
} as const

export const usersRef      = () => collection(db, Collections.USERS)
export const postsRef      = () => collection(db, Collections.POSTS)
export const commentsRef   = () => collection(db, Collections.COMMENTS)
export const likesRef      = () => collection(db, Collections.LIKES)
export const savesRef      = () => collection(db, Collections.SAVES)
export const followsRef    = () => collection(db, Collections.FOLLOWS)
export const categoriesRef = () => collection(db, Collections.CATEGORIES)
export const reportsRef    = () => collection(db, Collections.REPORTS)

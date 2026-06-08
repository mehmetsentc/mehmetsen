// TODO: Implement in Phase 1
import { getFirestore, collection } from 'firebase/firestore'
import { firebaseApp } from './config'
import { Collections, VIDEO_FEED_COLLECTION } from './collections'

export { Collections, VIDEO_FEED_COLLECTION }

export const db = getFirestore(firebaseApp)

export const usersRef      = () => collection(db, Collections.USERS)
export const postsRef      = () => collection(db, Collections.POSTS)
export const newsRef       = () => collection(db, Collections.NEWS)
export const commentsRef   = () => collection(db, Collections.COMMENTS)
export const likesRef      = () => collection(db, Collections.LIKES)
export const savesRef      = () => collection(db, Collections.SAVES)
export const followsRef    = () => collection(db, Collections.FOLLOWS)
export const categoriesRef = () => collection(db, Collections.CATEGORIES)
export const eventsRef     = () => collection(db, Collections.EVENTS)
export const reportsRef        = () => collection(db, Collections.REPORTS)
export const notificationsRef  = () => collection(db, Collections.NOTIFICATIONS)
export const conversationsRef  = () => collection(db, Collections.CONVERSATIONS)
export const messagesRef       = (conversationId: string) =>
  collection(db, Collections.CONVERSATIONS, conversationId, Collections.MESSAGES)

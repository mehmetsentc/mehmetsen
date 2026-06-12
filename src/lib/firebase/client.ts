/**
 * Browser-safe Firebase client SDK barrel.
 * Use this in client components; server routes should use `@/lib/firebase/admin`.
 */
export { firebaseApp } from './config'
export { auth } from './auth'
export {
  db,
  Collections,
  VIDEO_FEED_COLLECTION,
  usersRef,
  postsRef,
  newsRef,
  commentsRef,
  likesRef,
  savesRef,
  followsRef,
  categoriesRef,
  eventsRef,
  reportsRef,
  notificationsRef,
  conversationsRef,
  messagesRef,
} from './firestore'
export { storage, StoragePaths } from './storage'

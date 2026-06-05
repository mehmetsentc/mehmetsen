// TODO: Implement in Phase 1
import { getStorage } from 'firebase/storage'
import { firebaseApp } from './config'

export const storage = getStorage(firebaseApp)

export const StoragePaths = {
  AVATAR: (userId: string) => `avatars/${userId}`,
  POST_MEDIA: (userId: string) => `posts/${userId}`,
} as const

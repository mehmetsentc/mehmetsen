import { getStorage } from 'firebase/storage'
import { firebaseApp } from './config'

export const storage = getStorage(firebaseApp)

/** Canonical Firebase Storage path helpers — keep upload services in sync with storage.rules */
export const StoragePaths = {
  AVATAR: (userId: string, fileName: string) => `avatars/${userId}/${fileName}`,
  /** User post images and videos live under the same post folder. */
  POST_MEDIA: (userId: string, postId: string, fileName: string) =>
    `posts/${userId}/${postId}/${fileName}`,
  /** Cached or admin-uploaded cover art for a specific event. */
  EVENT_IMAGE: (eventId: string, fileName: string) => `events/${eventId}/${fileName}`,
  /** Shared event imagery (e.g. placeholders, category art). */
  EVENT_SHARED_IMAGE: (fileName: string) => `events/images/${fileName}`,
  /** Legacy paths — existing uploads only; new writes use POST_MEDIA. */
  NEWS_IMAGE: (userId: string, fileName: string) => `news-images/${userId}/${fileName}`,
  NEWS_VIDEO: (userId: string, fileName: string) => `news-videos/${userId}/${fileName}`,
} as const

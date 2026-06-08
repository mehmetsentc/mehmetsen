import {
  addDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  limit,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db, Collections, notificationsRef } from '@/lib/firebase/firestore'
import { enqueueFirestoreRead } from '@/lib/firestoreQueue'
import { withTimeout, devLog } from '@/lib/asyncUtils'
import { userService } from '@/services/userService'
import type { Notification, CreateNotificationInput } from '@/types/notification'

const READ_TIMEOUT_MS = 12_000
// Equality-only query (where userId == uid) needs no composite index. We cap
// the raw fetch and sort/slice client-side to surface the newest entries.
const FETCH_CAP = 300
const MAX_RESULTS = 100

function mapNotification(id: string, data: Record<string, unknown>): Notification {
  return {
    id,
    userId: (data.userId as string) ?? '',
    type: (data.type as Notification['type']) ?? 'system',
    actorId: (data.actorId as string | undefined) ?? undefined,
    actorUsername: (data.actorUsername as string | undefined) ?? undefined,
    actorDisplayName: (data.actorDisplayName as string | undefined) ?? undefined,
    actorPhotoURL: (data.actorPhotoURL as string | null | undefined) ?? null,
    postId: (data.postId as string | undefined) ?? undefined,
    commentId: (data.commentId as string | undefined) ?? undefined,
    text: (data.text as string | undefined) ?? undefined,
    read: Boolean(data.read),
    createdAt: (data.createdAt as string) ?? new Date().toISOString(),
  }
}

function sortByNewest(a: Notification, b: Notification): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt)
}

export const notificationService = {
  /**
   * Writes a notification for the recipient. Never notifies the actor about
   * their own action. Callers should still guard with try/catch — this also
   * swallows its own errors so a notification failure never breaks the core
   * action that triggered it.
   */
  async createNotification(input: CreateNotificationInput): Promise<void> {
    try {
      if (!input.userId) return
      // Never notify yourself.
      if (input.actorId && input.actorId === input.userId) return

      let { actorUsername, actorDisplayName, actorPhotoURL } = input

      // Enrich actor info if the caller only had an id.
      if (input.actorId && !actorUsername) {
        try {
          const actor = await userService.getByUid(input.actorId)
          if (actor) {
            actorUsername = actor.username
            actorDisplayName = actor.displayName
            actorPhotoURL = actor.photoURL
          }
        } catch {
          // Enrichment is best-effort; fall through with what we have.
        }
      }

      const payload: Record<string, unknown> = {
        userId: input.userId,
        type: input.type,
        read: false,
        createdAt: new Date().toISOString(),
      }
      if (input.actorId) payload.actorId = input.actorId
      if (actorUsername) payload.actorUsername = actorUsername
      if (actorDisplayName) payload.actorDisplayName = actorDisplayName
      if (actorPhotoURL) payload.actorPhotoURL = actorPhotoURL
      if (input.postId) payload.postId = input.postId
      if (input.commentId) payload.commentId = input.commentId
      if (input.text) payload.text = input.text

      await addDoc(notificationsRef(), payload)
      devLog('notificationService', 'created', { type: input.type, userId: input.userId })
    } catch (error) {
      console.warn('[notificationService] createNotification failed:', error)
    }
  },

  async getNotifications(
    userId: string,
    options?: { type?: Notification['type'] }
  ): Promise<Notification[]> {
    if (!userId) return []
    try {
      const snap = await withTimeout(
        enqueueFirestoreRead(() =>
          getDocs(
            query(notificationsRef(), where('userId', '==', userId), limit(FETCH_CAP))
          )
        ),
        READ_TIMEOUT_MS,
        'notifications'
      )

      let items = snap.docs.map((d) => mapNotification(d.id, d.data()))
      if (options?.type) {
        items = items.filter((n) => n.type === options.type)
      }
      items.sort(sortByNewest)
      return items.slice(0, MAX_RESULTS)
    } catch (error) {
      console.warn('[notificationService] getNotifications failed:', error)
      return []
    }
  },

  /**
   * Real-time subscription so notifications display live. Sorts client-side and
   * returns an unsubscribe function. Errors are logged, not thrown.
   */
  subscribeNotifications(
    userId: string,
    cb: (notifications: Notification[]) => void
  ): () => void {
    if (!userId) return () => {}
    const q = query(notificationsRef(), where('userId', '==', userId), limit(FETCH_CAP))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => mapNotification(d.id, d.data()))
        items.sort(sortByNewest)
        cb(items.slice(0, MAX_RESULTS))
      },
      (error) => {
        console.warn('[notificationService] subscribeNotifications failed:', error)
      }
    )
    return unsubscribe
  },

  async markAsRead(id: string): Promise<void> {
    if (!id) return
    try {
      await updateDoc(doc(db, Collections.NOTIFICATIONS, id), { read: true })
    } catch (error) {
      console.warn('[notificationService] markAsRead failed:', error)
    }
  },

  async markAllAsRead(userId: string): Promise<void> {
    if (!userId) return
    try {
      const snap = await enqueueFirestoreRead(() =>
        getDocs(
          query(
            notificationsRef(),
            where('userId', '==', userId),
            where('read', '==', false),
            limit(FETCH_CAP)
          )
        )
      )
      if (snap.empty) return
      const batch = writeBatch(db)
      snap.docs.forEach((d) => batch.update(d.ref, { read: true }))
      await batch.commit()
    } catch (error) {
      console.warn('[notificationService] markAllAsRead failed:', error)
    }
  },

  async getUnreadCount(userId: string): Promise<number> {
    if (!userId) return 0
    try {
      const snap = await withTimeout(
        enqueueFirestoreRead(() =>
          getDocs(
            query(
              notificationsRef(),
              where('userId', '==', userId),
              where('read', '==', false),
              limit(FETCH_CAP)
            )
          )
        ),
        READ_TIMEOUT_MS,
        'notifications-unread'
      )
      return snap.size
    } catch (error) {
      console.warn('[notificationService] getUnreadCount failed:', error)
      return 0
    }
  },
}

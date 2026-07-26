import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { NaEvent } from '@/types/event'

/**
 * Ana etkinlik listesi için SSR prefetch — boş HTML + client fetch CLS’ini keser.
 */
export async function getUpcomingEventsServer(limitCount = 12): Promise<NaEvent[]> {
  try {
    const db = getAdminFirestore()
    const nowIso = new Date().toISOString()
    const snap = await db
      .collection(Collections.EVENTS)
      .where('startsAt', '>=', nowIso)
      .orderBy('startsAt', 'asc')
      .limit(limitCount)
      .get()

    return snap.docs.map((doc) => {
      const d = doc.data()
      return {
        id: doc.id,
        ...(d as Omit<NaEvent, 'id'>),
      } as NaEvent
    })
  } catch (error) {
    console.warn('[eventService.server] getUpcomingEventsServer failed:', error)
    return []
  }
}

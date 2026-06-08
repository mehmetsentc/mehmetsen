import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  updateDoc,
  getCountFromServer,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db, Collections, VIDEO_FEED_COLLECTION } from '@/lib/firebase/firestore'
import { enqueueFirestoreRead } from '@/lib/firestoreQueue'
import { userService } from '@/services/userService'
import type { User, UserRole } from '@/types/user'
import type { Report, ReportStatus } from '@/types/common'

const PAGE_SIZE = 20

function normalizeReport(id: string, data: Record<string, unknown>): Report {
  const createdAtRaw = data.createdAt
  let createdAt = new Date().toISOString()
  if (typeof createdAtRaw === 'number') {
    createdAt = new Date(createdAtRaw).toISOString()
  } else if (typeof createdAtRaw === 'string') {
    createdAt = createdAtRaw
  }

  return {
    id,
    reporterId: (data.reporterId as string) ?? '',
    targetId: (data.targetId as string) ?? '',
    targetType: (data.targetType as Report['targetType']) ?? 'post',
    reason: (data.reason as Report['reason']) ?? 'other',
    description: (data.description as string) ?? '',
    status: (data.status as ReportStatus) ?? 'pending',
    reviewedBy: (data.reviewedBy as string | null) ?? null,
    reviewedAt: (data.reviewedAt as string | null) ?? null,
    action: (data.action as string | null) ?? null,
    createdAt,
  }
}

export interface AdminDashboardStats {
  totalNews: number
  pendingNews: number
  totalUsers: number
  pendingReports: number
}

export const adminService = {
  async getDashboardStats(): Promise<AdminDashboardStats> {
    const [newsSnap, pendingSnap, usersSnap, reportsSnap] = await Promise.all([
      getCountFromServer(collection(db, VIDEO_FEED_COLLECTION)).catch(() => null),
      getDocs(
        query(collection(db, VIDEO_FEED_COLLECTION), where('status', '==', 'pending'), limit(200))
      ).catch(() => null),
      getCountFromServer(collection(db, Collections.USERS)).catch(() => null),
      getDocs(
        query(collection(db, Collections.REPORTS), where('status', '==', 'pending'), limit(200))
      ).catch(() => null),
    ])

    return {
      totalNews: newsSnap?.data().count ?? 0,
      pendingNews: pendingSnap?.size ?? 0,
      totalUsers: usersSnap?.data().count ?? 0,
      pendingReports: reportsSnap?.size ?? 0,
    }
  },

  async listUsers(options?: {
    search?: string
    lastDoc?: QueryDocumentSnapshot
  }): Promise<{ users: User[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> {
    const search = options?.search?.trim().toLowerCase()

    if (search) {
      const found = await userService.getByUsername(search)
      return { users: found ? [found] : [], lastDoc: null, hasMore: false }
    }

    const constraints: Parameters<typeof query>[1][] = [
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    ]
    if (options?.lastDoc) constraints.push(startAfter(options.lastDoc))

    const snap = await enqueueFirestoreRead(() =>
      getDocs(query(collection(db, Collections.USERS), ...constraints))
    )

    const users = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>
      return {
        uid: d.id,
        username: (data.username as string) ?? '',
        displayName: (data.displayName as string) ?? '',
        email: (data.email as string) ?? '',
        photoURL: (data.photoURL as string | null) ?? null,
        bio: (data.bio as string | null) ?? null,
        website: (data.website as string | null) ?? null,
        location: (data.location as string | null) ?? null,
        role: (data.role as UserRole) ?? 'user',
        isVerified: Boolean(data.isVerified),
        isBlocked: Boolean(data.isBlocked),
        followersCount: Number(data.followersCount ?? 0),
        followingCount: Number(data.followingCount ?? 0),
        postsCount: Number(data.postsCount ?? 0),
        onboardingCompleted: Boolean(data.onboardingCompleted ?? true),
        createdAt: (data.createdAt as string) ?? '',
        updatedAt: (data.updatedAt as string) ?? '',
      } satisfies User
    })

    return {
      users,
      lastDoc: snap.docs[snap.docs.length - 1] ?? null,
      hasMore: snap.docs.length === PAGE_SIZE,
    }
  },

  async setUserBlocked(uid: string, isBlocked: boolean): Promise<void> {
    await updateDoc(doc(db, Collections.USERS, uid), {
      isBlocked,
      updatedAt: new Date().toISOString(),
    })
  },

  async setUserRole(uid: string, role: UserRole): Promise<void> {
    await updateDoc(doc(db, Collections.USERS, uid), {
      role,
      updatedAt: new Date().toISOString(),
    })
  },

  async listReports(
    status: ReportStatus | 'all' = 'pending',
    lastDoc?: QueryDocumentSnapshot
  ): Promise<{ reports: Report[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> {
    const constraints: Parameters<typeof query>[1][] = []
    if (status !== 'all') constraints.push(where('status', '==', status))
    constraints.push(orderBy('createdAt', 'desc'))
    if (lastDoc) constraints.push(startAfter(lastDoc))
    constraints.push(limit(PAGE_SIZE))

    const snap = await enqueueFirestoreRead(() =>
      getDocs(query(collection(db, Collections.REPORTS), ...constraints))
    )

    return {
      reports: snap.docs.map((d) => normalizeReport(d.id, d.data() as Record<string, unknown>)),
      lastDoc: snap.docs[snap.docs.length - 1] ?? null,
      hasMore: snap.docs.length === PAGE_SIZE,
    }
  },

  async dismissReport(reportId: string, reviewerId: string): Promise<void> {
    await updateDoc(doc(db, Collections.REPORTS, reportId), {
      status: 'dismissed',
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
      action: 'dismissed',
    })
  },

  async reviewReport(
    reportId: string,
    reviewerId: string,
    action: 'content_removed' | 'reviewed'
  ): Promise<void> {
    await updateDoc(doc(db, Collections.REPORTS, reportId), {
      status: 'reviewed',
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
      action,
    })
  },

  async removeReportedContent(targetId: string, reportId: string, reviewerId: string): Promise<void> {
    const { adminNewsService } = await import('@/services/adminNewsService')
    await adminNewsService.remove(targetId, 'Rapor sonucu kaldırıldı')
    await this.reviewReport(reportId, reviewerId, 'content_removed')
  },

  async getEventsCount(): Promise<number> {
    try {
      const snap = await getCountFromServer(collection(db, Collections.EVENTS))
      return snap.data().count
    } catch {
      return 0
    }
  },

  async getEventSyncMeta(): Promise<{
    completedAt?: string
    scraped?: number
    inserted?: number
    updated?: number
    skipped?: number
    markedPast?: number
    markedRemoved?: number
    durationMs?: number
    failedProviders?: string[]
  } | null> {
    try {
      const snap = await enqueueFirestoreRead(() => getDoc(doc(db, 'meta', 'eventSync')))
      if (!snap.exists()) return null
      return snap.data() as {
        completedAt?: string
        scraped?: number
        inserted?: number
        updated?: number
        skipped?: number
        markedPast?: number
        markedRemoved?: number
        durationMs?: number
        failedProviders?: string[]
      }
    } catch {
      return null
    }
  },
}

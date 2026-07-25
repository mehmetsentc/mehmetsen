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

/** Last 7 days publish volume series (F4) */
export interface PublishSeriesPoint {
  date: string // ISO yyyy-mm-dd
  count: number
}

export interface DashboardOverview {
  stats: AdminDashboardStats
  publishSeries: PublishSeriesPoint[]
  topNews: Array<{
    id: string
    slug: string
    title: string
    coverImageUrl: string | null
    viewsCount: number
    categoryId: string
    publishedAt: string | null
  }>
  recentActivity: Array<{
    id: string
    type: 'publish' | 'pending'
    title: string
    when: string
    category: string
  }>
}

// ── Module-level caches — survive across component mounts ─────────────────
let _statsCache: { data: AdminDashboardStats; t: number } | null = null
let _overviewCache: { data: DashboardOverview; t: number } | null = null
const STATS_TTL    = 5  * 60 * 1000  // 5 min
const OVERVIEW_TTL = 10 * 60 * 1000  // 10 min

export const adminService = {
  async getDashboardStats(): Promise<AdminDashboardStats> {
    if (_statsCache && Date.now() - _statsCache.t < STATS_TTL) return _statsCache.data

    // Use getCountFromServer everywhere — reads index entries, not full docs
    const [newsSnap, pendingSnap, usersSnap, reportsSnap] = await Promise.all([
      getCountFromServer(collection(db, VIDEO_FEED_COLLECTION)).catch(() => null),
      getCountFromServer(
        query(collection(db, VIDEO_FEED_COLLECTION), where('status', '==', 'pending'))
      ).catch(() => null),
      getCountFromServer(collection(db, Collections.USERS)).catch(() => null),
      getCountFromServer(
        query(collection(db, Collections.REPORTS), where('status', '==', 'pending'))
      ).catch(() => null),
    ])

    const data: AdminDashboardStats = {
      totalNews: newsSnap?.data().count ?? 0,
      pendingNews: pendingSnap?.data().count ?? 0,
      totalUsers: usersSnap?.data().count ?? 0,
      pendingReports: reportsSnap?.data().count ?? 0,
    }
    _statsCache = { data, t: Date.now() }
    return data
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

  /**
   * F4 — Dashboard v2 için tek seferde tüm gerekli veriyi getirir.
   * (Stat sayaçları + 7 gün publish series + popüler haber + aktivite feed.)
   *
   * Hata yutar — kısmi başarısızlıkta diğer kısımları döndürür.
   */
  async getDashboardOverview(): Promise<DashboardOverview> {
    if (_overviewCache && Date.now() - _overviewCache.t < OVERVIEW_TTL) return _overviewCache.data

    // 7-gün publish serisi için gün başına COUNT sorgusu — 400 dok okumak yerine
    // Her gün için [gün_başlangıcı, gün_sonu) aralığında COUNT çekiyoruz (index-only)
    const dayCountPromises: Promise<number>[] = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date()
      dayStart.setDate(dayStart.getDate() - i)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)
      dayCountPromises.push(
        getCountFromServer(
          query(
            collection(db, VIDEO_FEED_COLLECTION),
            where('createdAt', '>=', dayStart.toISOString()),
            where('createdAt', '<', dayEnd.toISOString())
          )
        )
          .then((s) => s.data().count)
          .catch(() => 0)
      )
    }

    const [stats, topNewsSnap, recentActivitySnap, ...dayCounts] = await Promise.all([
      this.getDashboardStats().catch(() => ({
        totalNews: 0,
        pendingNews: 0,
        totalUsers: 0,
        pendingReports: 0,
      })),
      enqueueFirestoreRead(() =>
        getDocs(
          query(
            collection(db, VIDEO_FEED_COLLECTION),
            where('status', '==', 'published'),
            orderBy('viewsCount', 'desc'),
            limit(8)
          )
        )
      ).catch(() => null),
      // Sadece en son 12 haber — aktivite feed için yeterli (12 dok okuma)
      enqueueFirestoreRead(() =>
        getDocs(
          query(
            collection(db, VIDEO_FEED_COLLECTION),
            orderBy('createdAt', 'desc'),
            limit(12)
          )
        )
      ).catch(() => null),
      ...dayCountPromises,
    ])

    // Top news mapping
    const topNews =
      topNewsSnap?.docs.map((d) => {
        const data = d.data() as Record<string, unknown>
        return {
          id: d.id,
          slug: (data.slug as string) ?? d.id,
          title: (data.title as string) ?? '',
          coverImageUrl: (data.coverImageUrl as string | null) ?? null,
          viewsCount: Number(data.viewsCount ?? 0),
          categoryId: (data.categoryId as string) ?? 'gundem',
          publishedAt: (data.publishedAt as string | null) ?? null,
        }
      }) ?? []

    // 7-day publish series — count sorgularından oluşturuldu (dok okuma yok)
    const publishSeries: PublishSeriesPoint[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      publishSeries.push({
        date: d.toISOString().slice(0, 10),
        count: dayCounts[6 - i] ?? 0,
      })
    }

    // Recent activity feed (latest 12 — sadece 12 dok)
    const recentActivity =
      recentActivitySnap?.docs.map((d) => {
        const data = d.data() as Record<string, unknown>
        const status = (data.status as string) ?? 'published'
        return {
          id: d.id,
          type: (status === 'pending' ? 'pending' : 'publish') as 'publish' | 'pending',
          title: (data.title as string) ?? '(başlıksız)',
          when: (data.createdAt as string) ?? new Date().toISOString(),
          category: (data.categoryId as string) ?? 'gundem',
        }
      }) ?? []

    const result: DashboardOverview = { stats, publishSeries, topNews, recentActivity }
    _overviewCache = { data: result, t: Date.now() }
    return result
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

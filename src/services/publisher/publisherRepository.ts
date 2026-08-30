import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import {
  news,
  newsClusters,
  newsSources,
  publisherClaimRequests,
  publisherMembers,
  publisherSources,
  publishers,
  rawArticles,
  users,
} from '@/db/schema'
import { newPublisherId } from '@/lib/publisher/id'
import type {
  PublisherAdminFilter,
  PublisherArticleItem,
  PublisherArticlePage,
  PublisherClaimRequestRecord,
  PublisherClaimStatus,
  PublisherMemberRecord,
  PublisherMemberRole,
  PublisherRecord,
  PublisherSourceRecord,
  PublisherStatus,
  PublisherVerificationStatus,
} from '@/types/publisher'

function mapPublisher(row: typeof publishers.$inferSelect): PublisherRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    displayName: row.displayName,
    publisherType: row.publisherType as PublisherRecord['publisherType'],
    status: row.status as PublisherStatus,
    description: row.description,
    logoUrl: row.logoUrl,
    coverImageUrl: row.coverImageUrl,
    websiteUrl: row.websiteUrl,
    primaryDomain: row.primaryDomain,
    countryCode: row.countryCode,
    city: row.city,
    district: row.district,
    verificationStatus: row.verificationStatus as PublisherVerificationStatus,
    claimedAt: row.claimedAt,
    verifiedAt: row.verifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mapPublisherSource(row: typeof publisherSources.$inferSelect): PublisherSourceRecord {
  return {
    id: row.id,
    publisherId: row.publisherId,
    sourceId: row.sourceId,
    relationshipType: row.relationshipType as PublisherSourceRecord['relationshipType'],
    isPrimary: row.isPrimary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mapMember(row: typeof publisherMembers.$inferSelect): PublisherMemberRecord {
  return {
    id: row.id,
    publisherId: row.publisherId,
    userId: row.userId,
    role: row.role as PublisherMemberRecord['role'],
    status: row.status as PublisherMemberRecord['status'],
    invitedAt: row.invitedAt,
    acceptedAt: row.acceptedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mapClaim(row: typeof publisherClaimRequests.$inferSelect): PublisherClaimRequestRecord {
  return {
    id: row.id,
    publisherId: row.publisherId,
    userId: row.userId,
    claimType: row.claimType as PublisherClaimRequestRecord['claimType'],
    status: row.status as PublisherClaimStatus,
    requestedDomain: row.requestedDomain,
    businessEmail: row.businessEmail,
    verificationMethod: row.verificationMethod as PublisherClaimRequestRecord['verificationMethod'],
    verificationPayload: row.verificationPayload ?? null,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function adminFilterClause(filter: PublisherAdminFilter): SQL | undefined {
  if (filter === 'unclaimed') {
    return and(eq(publishers.status, 'UNCLAIMED'), eq(publishers.verificationStatus, 'UNCLAIMED'))
  }
  if (filter === 'verified') return eq(publishers.verificationStatus, 'VERIFIED')
  if (filter === 'pending') return eq(publishers.verificationStatus, 'PENDING')
  if (filter === 'rejected') return eq(publishers.verificationStatus, 'REJECTED')
  return undefined
}

export class PublisherRepository {
  private requireDb() {
    if (!hasDatabaseUrl()) throw new Error('DATABASE_URL not configured')
    return getDb()
  }

  async ensureUserExists(firebaseUid: string, email?: string | null): Promise<void> {
    const db = this.requireDb()
    const normalizedEmail = email?.trim().toLowerCase() || null
    const displayName = normalizedEmail ? normalizedEmail.split('@')[0]?.slice(0, 100) || null : null
    await db
      .insert(users)
      .values({
        firebaseUid,
        email: normalizedEmail,
        displayName,
        role: 'user',
      })
      .onConflictDoNothing()
  }

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const db = this.requireDb()
    const rows = await db
      .select({ id: publishers.id })
      .from(publishers)
      .where(eq(publishers.slug, slug))
      .limit(1)
    if (!rows.length) return false
    if (excludeId && rows[0].id === excludeId) return false
    return true
  }

  async findBySlug(slug: string): Promise<PublisherRecord | null> {
    const db = this.requireDb()
    const rows = await db.select().from(publishers).where(eq(publishers.slug, slug)).limit(1)
    return rows[0] ? mapPublisher(rows[0]) : null
  }

  async findById(id: string): Promise<PublisherRecord | null> {
    const db = this.requireDb()
    const rows = await db.select().from(publishers).where(eq(publishers.id, id)).limit(1)
    return rows[0] ? mapPublisher(rows[0]) : null
  }

  async findPublisherBySourceId(sourceId: string): Promise<PublisherRecord | null> {
    const db = this.requireDb()
    const rows = await db
      .select({ publisher: publishers })
      .from(publisherSources)
      .innerJoin(publishers, eq(publishers.id, publisherSources.publisherId))
      .where(eq(publisherSources.sourceId, sourceId))
      .limit(1)
    return rows[0] ? mapPublisher(rows[0].publisher) : null
  }

  async findByPrimaryDomain(domain: string): Promise<PublisherRecord | null> {
    const db = this.requireDb()
    const rows = await db
      .select()
      .from(publishers)
      .where(eq(publishers.primaryDomain, domain))
      .limit(1)
    return rows[0] ? mapPublisher(rows[0]) : null
  }

  async findPublisherBySubdomainParent(domain: string): Promise<PublisherRecord | null> {
    const db = this.requireDb()
    const normalized = domain.trim().toLowerCase()
    if (!normalized.includes('.')) return null
    const parts = normalized.split('.').filter(Boolean)
    if (parts.length <= 2) return null
    const apex = parts.slice(-2).join('.')
    if (apex === normalized) return null
    const rows = await db
      .select()
      .from(publishers)
      .where(eq(publishers.primaryDomain, apex))
      .limit(1)
    return rows[0] ? mapPublisher(rows[0]) : null
  }

  async listPublishers(opts: {
    filter?: PublisherAdminFilter
    limit?: number
    offset?: number
  }): Promise<{ items: PublisherRecord[]; total: number }> {
    const db = this.requireDb()
    const filter = opts.filter ?? 'all'
    const where = adminFilterClause(filter)
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
    const offset = Math.max(opts.offset ?? 0, 0)

    const base = db.select().from(publishers)
    const filtered = where ? base.where(where) : base
    const items = await filtered.orderBy(desc(publishers.createdAt)).limit(limit).offset(offset)

    const countRows = where
      ? await db.select({ c: sql<number>`count(*)::int` }).from(publishers).where(where)
      : await db.select({ c: sql<number>`count(*)::int` }).from(publishers)

    return {
      items: items.map(mapPublisher),
      total: countRows[0]?.c ?? 0,
    }
  }

  async insertPublisher(input: {
    name: string
    slug: string
    displayName: string
    publisherType?: PublisherRecord['publisherType']
    status?: PublisherStatus
    description?: string | null
    logoUrl?: string | null
    coverImageUrl?: string | null
    websiteUrl?: string | null
    primaryDomain?: string | null
    countryCode?: string | null
    city?: string | null
    district?: string | null
    verificationStatus?: PublisherVerificationStatus
  }): Promise<PublisherRecord> {
    const db = this.requireDb()
    const now = new Date()
    const id = newPublisherId('pub')
    const [row] = await db
      .insert(publishers)
      .values({
        id,
        name: input.name,
        slug: input.slug,
        displayName: input.displayName,
        publisherType: input.publisherType ?? 'NEWS_ORGANIZATION',
        status: input.status ?? 'UNCLAIMED',
        description: input.description ?? null,
        logoUrl: input.logoUrl ?? null,
        coverImageUrl: input.coverImageUrl ?? null,
        websiteUrl: input.websiteUrl ?? null,
        primaryDomain: input.primaryDomain ?? null,
        countryCode: input.countryCode ?? null,
        city: input.city ?? null,
        district: input.district ?? null,
        verificationStatus: input.verificationStatus ?? 'UNCLAIMED',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    return mapPublisher(row)
  }

  async updatePublisher(
    id: string,
    patch: Partial<{
      status: PublisherStatus
      verificationStatus: PublisherVerificationStatus
      claimedAt: Date | null
      verifiedAt: Date | null
    }>
  ): Promise<PublisherRecord | null> {
    const db = this.requireDb()
    const [row] = await db
      .update(publishers)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(publishers.id, id))
      .returning()
    return row ? mapPublisher(row) : null
  }

  async updatePublisherProfile(
    id: string,
    patch: Partial<{
      displayName: string
      description: string | null
      logoUrl: string | null
      coverImageUrl: string | null
      websiteUrl: string | null
      city: string | null
      district: string | null
      countryCode: string | null
    }>
  ): Promise<PublisherRecord | null> {
    const db = this.requireDb()
    const allowed: Partial<typeof publishers.$inferInsert> = {}
    if (patch.displayName !== undefined) allowed.displayName = patch.displayName
    if (patch.description !== undefined) allowed.description = patch.description
    if (patch.logoUrl !== undefined) allowed.logoUrl = patch.logoUrl
    if (patch.coverImageUrl !== undefined) allowed.coverImageUrl = patch.coverImageUrl
    if (patch.websiteUrl !== undefined) allowed.websiteUrl = patch.websiteUrl
    if (patch.city !== undefined) allowed.city = patch.city
    if (patch.district !== undefined) allowed.district = patch.district
    if (patch.countryCode !== undefined) allowed.countryCode = patch.countryCode
    if (!Object.keys(allowed).length) return this.findById(id)

    const [row] = await db
      .update(publishers)
      .set({ ...allowed, updatedAt: new Date() })
      .where(eq(publishers.id, id))
      .returning()
    return row ? mapPublisher(row) : null
  }

  async findActiveMember(publisherId: string, userId: string): Promise<PublisherMemberRecord | null> {
    const db = this.requireDb()
    const rows = await db
      .select()
      .from(publisherMembers)
      .where(
        and(
          eq(publisherMembers.publisherId, publisherId),
          eq(publisherMembers.userId, userId),
          eq(publisherMembers.status, 'ACTIVE')
        )
      )
      .limit(1)
    return rows[0] ? mapMember(rows[0]) : null
  }

  async listMembersForPublisher(publisherId: string): Promise<PublisherMemberRecord[]> {
    const db = this.requireDb()
    const rows = await db
      .select()
      .from(publisherMembers)
      .where(eq(publisherMembers.publisherId, publisherId))
      .orderBy(desc(publisherMembers.createdAt))
    return rows.map(mapMember)
  }

  async listPublishersForUser(userId: string): Promise<Array<PublisherRecord & { role: PublisherMemberRole }>> {
    const db = this.requireDb()
    const rows = await db
      .select({ publisher: publishers, role: publisherMembers.role })
      .from(publisherMembers)
      .innerJoin(publishers, eq(publisherMembers.publisherId, publishers.id))
      .where(and(eq(publisherMembers.userId, userId), eq(publisherMembers.status, 'ACTIVE')))
      .orderBy(desc(publishers.updatedAt))
    return rows.map((r) => ({ ...mapPublisher(r.publisher), role: r.role as PublisherMemberRole }))
  }

  async updateMemberRole(
    publisherId: string,
    memberId: string,
    role: PublisherMemberRole
  ): Promise<PublisherMemberRecord | null> {
    const db = this.requireDb()
    const [row] = await db
      .update(publisherMembers)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(publisherMembers.id, memberId), eq(publisherMembers.publisherId, publisherId)))
      .returning()
    return row ? mapMember(row) : null
  }

  async findSourceLinkBySourceId(sourceId: string): Promise<PublisherSourceRecord | null> {
    const db = this.requireDb()
    const rows = await db
      .select()
      .from(publisherSources)
      .where(eq(publisherSources.sourceId, sourceId))
      .limit(1)
    return rows[0] ? mapPublisherSource(rows[0]) : null
  }

  async listSourcesForPublisher(publisherId: string): Promise<
    Array<PublisherSourceRecord & { sourceName: string; sourceDomain: string }>
  > {
    const db = this.requireDb()
    const rows = await db
      .select({
        link: publisherSources,
        sourceName: newsSources.name,
        sourceDomain: newsSources.domain,
      })
      .from(publisherSources)
      .innerJoin(newsSources, eq(publisherSources.sourceId, newsSources.id))
      .where(eq(publisherSources.publisherId, publisherId))

    return rows.map((r) => ({
      ...mapPublisherSource(r.link),
      sourceName: r.sourceName,
      sourceDomain: r.sourceDomain,
    }))
  }

  async insertPublisherSource(input: {
    publisherId: string
    sourceId: string
    relationshipType?: PublisherSourceRecord['relationshipType']
    isPrimary?: boolean
  }): Promise<PublisherSourceRecord> {
    const db = this.requireDb()
    const now = new Date()
    const [row] = await db
      .insert(publisherSources)
      .values({
        id: newPublisherId('psrc'),
        publisherId: input.publisherId,
        sourceId: input.sourceId,
        relationshipType: input.relationshipType ?? 'PRIMARY',
        isPrimary: input.isPrimary ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    return mapPublisherSource(row)
  }

  async getSourceIdsForPublisher(publisherId: string): Promise<string[]> {
    const db = this.requireDb()
    const rows = await db
      .select({ sourceId: publisherSources.sourceId })
      .from(publisherSources)
      .where(eq(publisherSources.publisherId, publisherId))
    return rows.map((r) => r.sourceId)
  }

  async listNewsSources(limit: number, offset = 0, sourceIds?: string[]) {
    const db = this.requireDb()
    if (sourceIds?.length) {
      const ids = [...new Set(sourceIds.filter(Boolean))].slice(0, 50)
      return db
        .select()
        .from(newsSources)
        .where(inArray(newsSources.id, ids))
        .orderBy(desc(newsSources.createdAt))
        .limit(Math.min(ids.length, limit))
    }
    return db
      .select()
      .from(newsSources)
      .orderBy(desc(newsSources.createdAt))
      .limit(limit)
      .offset(offset)
  }

  async findActiveOwner(publisherId: string): Promise<PublisherMemberRecord | null> {
    const db = this.requireDb()
    const rows = await db
      .select()
      .from(publisherMembers)
      .where(
        and(
          eq(publisherMembers.publisherId, publisherId),
          eq(publisherMembers.role, 'OWNER'),
          eq(publisherMembers.status, 'ACTIVE')
        )
      )
      .limit(1)
    return rows[0] ? mapMember(rows[0]) : null
  }

  async insertMember(input: {
    publisherId: string
    userId: string
    role: PublisherMemberRole
    status?: PublisherMemberRecord['status']
    acceptedAt?: Date | null
  }): Promise<PublisherMemberRecord> {
    const db = this.requireDb()
    const now = new Date()
    const [row] = await db
      .insert(publisherMembers)
      .values({
        id: newPublisherId('pmem'),
        publisherId: input.publisherId,
        userId: input.userId,
        role: input.role,
        status: input.status ?? 'ACTIVE',
        acceptedAt: input.acceptedAt ?? (input.role === 'OWNER' ? now : null),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    return mapMember(row)
  }

  async insertClaimRequest(input: {
    publisherId: string
    userId: string
    requestedDomain?: string | null
    businessEmail?: string | null
    verificationMethod?: PublisherClaimRequestRecord['verificationMethod']
    verificationPayload?: Record<string, unknown> | null
  }): Promise<PublisherClaimRequestRecord> {
    const db = this.requireDb()
    const now = new Date()
    const [row] = await db
      .insert(publisherClaimRequests)
      .values({
        id: newPublisherId('pclaim'),
        publisherId: input.publisherId,
        userId: input.userId,
        claimType: 'OWNERSHIP',
        status: 'PENDING',
        requestedDomain: input.requestedDomain ?? null,
        businessEmail: input.businessEmail ?? null,
        verificationMethod: input.verificationMethod ?? 'MANUAL',
        verificationPayload: input.verificationPayload ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    return mapClaim(row)
  }

  async findClaimById(id: string): Promise<PublisherClaimRequestRecord | null> {
    const db = this.requireDb()
    const rows = await db
      .select()
      .from(publisherClaimRequests)
      .where(eq(publisherClaimRequests.id, id))
      .limit(1)
    return rows[0] ? mapClaim(rows[0]) : null
  }

  async listClaimsForPublisher(publisherId: string): Promise<PublisherClaimRequestRecord[]> {
    const db = this.requireDb()
    const rows = await db
      .select()
      .from(publisherClaimRequests)
      .where(eq(publisherClaimRequests.publisherId, publisherId))
      .orderBy(desc(publisherClaimRequests.createdAt))
    return rows.map(mapClaim)
  }

  async findLatestClaimForUser(
    publisherId: string,
    userId: string
  ): Promise<PublisherClaimRequestRecord | null> {
    const db = this.requireDb()
    const rows = await db
      .select()
      .from(publisherClaimRequests)
      .where(
        and(
          eq(publisherClaimRequests.publisherId, publisherId),
          eq(publisherClaimRequests.userId, userId)
        )
      )
      .orderBy(desc(publisherClaimRequests.createdAt))
      .limit(1)
    return rows[0] ? mapClaim(rows[0]) : null
  }

  async listPendingClaims(limit = 100): Promise<PublisherClaimRequestRecord[]> {
    const db = this.requireDb()
    const rows = await db
      .select()
      .from(publisherClaimRequests)
      .where(eq(publisherClaimRequests.status, 'PENDING'))
      .orderBy(desc(publisherClaimRequests.createdAt))
      .limit(limit)
    return rows.map(mapClaim)
  }

  async updateClaimRequest(
    id: string,
    patch: Partial<{
      status: PublisherClaimStatus
      reviewedBy: string | null
      reviewedAt: Date | null
      rejectionReason: string | null
    }>
  ): Promise<PublisherClaimRequestRecord | null> {
    const db = this.requireDb()
    const [row] = await db
      .update(publisherClaimRequests)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(publisherClaimRequests.id, id))
      .returning()
    return row ? mapClaim(row) : null
  }

  async updateClaimRequestIfPending(
    id: string,
    patch: Partial<{
      status: PublisherClaimStatus
      reviewedBy: string | null
      reviewedAt: Date | null
      rejectionReason: string | null
    }>
  ): Promise<PublisherClaimRequestRecord | null> {
    const db = this.requireDb()
    const [row] = await db
      .update(publisherClaimRequests)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(publisherClaimRequests.id, id), eq(publisherClaimRequests.status, 'PENDING')))
      .returning()
    return row ? mapClaim(row) : null
  }

  async approveClaimAtomic(input: {
    claimId: string
    reviewedBy: string
    publisherId: string
    userId: string
  }): Promise<{ publisher: PublisherRecord; claim: PublisherClaimRequestRecord }> {
    const db = this.requireDb()
    const now = new Date()

    const updatedClaim = await this.updateClaimRequestIfPending(input.claimId, {
      status: 'APPROVED',
      reviewedBy: input.reviewedBy,
      reviewedAt: now,
      rejectionReason: null,
    })
    if (!updatedClaim) {
      const latest = await this.findClaimById(input.claimId)
      if (latest?.status === 'APPROVED') {
        const publisher = await this.findById(input.publisherId)
        if (!publisher) throw new Error('PUBLISHER_NOT_FOUND')
        return { publisher, claim: latest }
      }
      const owner = await this.findActiveOwner(input.publisherId)
      if (owner) throw new Error('OWNER_ALREADY_EXISTS')
      throw new Error('CLAIM_NOT_PENDING')
    }

    try {
      await this.insertMember({
        publisherId: input.publisherId,
        userId: input.userId,
        role: 'OWNER',
        status: 'ACTIVE',
        acceptedAt: now,
      })
    } catch (err) {
      const code = (err as { code?: string }).code
      const message = err instanceof Error ? err.message : ''
      if (code === '23505' || message.includes('publisher_members_one_active_owner')) {
        await this.updateClaimRequest(input.claimId, {
          status: 'REJECTED',
          reviewedBy: input.reviewedBy,
          reviewedAt: now,
          rejectionReason: 'Another owner was approved concurrently',
        })
        throw new Error('OWNER_ALREADY_EXISTS')
      }
      throw err
    }

    const publisher = await this.updatePublisher(input.publisherId, {
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      claimedAt: now,
      verifiedAt: now,
    })
    if (!publisher) throw new Error('PUBLISHER_UPDATE_FAILED')

    return { publisher, claim: updatedClaim }
  }

  async revokeClaim(input: {
    claimId: string
    reviewedBy: string
    revocationReason?: string
  }): Promise<{ publisher: PublisherRecord; claim: PublisherClaimRequestRecord; alreadyRevoked: boolean }> {
    const claim = await this.findClaimById(input.claimId)
    if (!claim) throw new Error('CLAIM_NOT_FOUND')

    if (claim.status === 'REVOKED') {
      const publisher = await this.findById(claim.publisherId)
      if (!publisher) throw new Error('PUBLISHER_NOT_FOUND')
      return { publisher, claim, alreadyRevoked: true }
    }

    if (claim.status !== 'APPROVED') {
      throw new Error('CLAIM_NOT_APPROVED')
    }

    const now = new Date()
    const updatedClaim = await this.updateClaimRequest(input.claimId, {
      status: 'REVOKED',
      reviewedBy: input.reviewedBy,
      reviewedAt: now,
      rejectionReason: input.revocationReason ?? 'Claim revoked by administrator',
    })
    if (!updatedClaim) throw new Error('CLAIM_UPDATE_FAILED')

    const db = this.requireDb()
    await db
      .update(publisherMembers)
      .set({ status: 'REMOVED', updatedAt: now })
      .where(
        and(
          eq(publisherMembers.publisherId, claim.publisherId),
          eq(publisherMembers.userId, claim.userId)
        )
      )

    const remainingOwner = await this.findActiveOwner(claim.publisherId)
    const publisher = await this.updatePublisher(claim.publisherId, {
      status: remainingOwner ? 'ACTIVE' : 'UNCLAIMED',
      verificationStatus: remainingOwner ? 'VERIFIED' : 'UNCLAIMED',
      claimedAt: remainingOwner ? undefined : null,
      verifiedAt: remainingOwner ? undefined : null,
    })
    if (!publisher) throw new Error('PUBLISHER_UPDATE_FAILED')

    return { publisher, claim: updatedClaim, alreadyRevoked: false }
  }

  async resolvePublishedArticles(
    sourceIds: string[],
    limit = 24,
    cursor?: string | null
  ): Promise<PublisherArticlePage> {
    if (!sourceIds.length) return { items: [], nextCursor: null }
    const db = this.requireDb()
    const pageSize = Math.min(Math.max(limit, 1), 48)

    const seen = new Set<string>()
    const out: PublisherArticleItem[] = []

    // 1. Direct news from PostgreSQL joined with clusters matching sourceIds
    const clusterNewsRows = await db
      .select({
        id: news.id,
        slug: news.slug,
        title: news.title,
        summary: news.summary,
        thumbnailUrl: news.thumbnailUrl,
        coverImageUrl: news.coverImageUrl,
        publishedAt: news.publishedAt,
        categoryId: news.categoryId,
        sourceId: newsClusters.primarySourceId,
      })
      .from(news)
      .innerJoin(newsClusters, eq(newsClusters.publishedNewsId, news.id))
      .where(
        and(
          eq(news.status, 'published'),
          inArray(newsClusters.primarySourceId, sourceIds)
        )
      )
      .orderBy(desc(news.publishedAt))
      .limit(pageSize)

    for (const n of clusterNewsRows) {
      if (seen.has(n.id)) continue
      seen.add(n.id)
      out.push({
        id: n.id,
        slug: n.slug,
        title: n.title,
        summary: n.summary,
        thumbnailUrl: n.coverImageUrl ?? n.thumbnailUrl,
        publishedAt: n.publishedAt,
        sourceId: n.sourceId ?? sourceIds[0],
        categoryId: n.categoryId,
      })
    }

    // 2. Also check raw_articles linked news
    if (out.length < pageSize) {
      const rawRows = await db
        .select({
          editorialNewsId: rawArticles.editorialNewsId,
          sourceId: rawArticles.sourceId,
          title: rawArticles.title,
          publishedAt: rawArticles.publishedAt,
          mainImageUrl: rawArticles.mainImageUrl,
        })
        .from(rawArticles)
        .where(
          and(
            inArray(rawArticles.sourceId, sourceIds),
            isNotNull(rawArticles.editorialNewsId)
          )
        )
        .orderBy(desc(rawArticles.publishedAt))
        .limit(pageSize * 3)

      const newsIds = [
        ...new Set(rawRows.map((r) => r.editorialNewsId).filter((id): id is string => Boolean(id))),
      ].filter((id) => !seen.has(id))

      const newsRows = newsIds.length
        ? await db
            .select({
              id: news.id,
              legacyFirestoreId: news.legacyFirestoreId,
              slug: news.slug,
              title: news.title,
              summary: news.summary,
              thumbnailUrl: news.thumbnailUrl,
              coverImageUrl: news.coverImageUrl,
              publishedAt: news.publishedAt,
              categoryId: news.categoryId,
            })
            .from(news)
            .where(
              and(
                eq(news.status, 'published'),
                or(inArray(news.id, newsIds), inArray(news.legacyFirestoreId, newsIds))
              )
            )
        : []

      const newsByKey = new Map<string, (typeof newsRows)[number]>()
      for (const row of newsRows) {
        newsByKey.set(row.id, row)
        if (row.legacyFirestoreId) newsByKey.set(row.legacyFirestoreId, row)
      }

      for (const raw of rawRows) {
        const nid = raw.editorialNewsId
        if (!nid) continue
        const n = newsByKey.get(nid)
        if (!n) continue
        const stableId = n.id
        if (seen.has(stableId)) continue
        seen.add(stableId)
        out.push({
          id: stableId,
          slug: n.slug,
          title: n.title,
          summary: n.summary,
          thumbnailUrl: n.coverImageUrl ?? n.thumbnailUrl ?? raw.mainImageUrl,
          publishedAt: n.publishedAt ?? raw.publishedAt,
          sourceId: raw.sourceId,
          categoryId: n.categoryId,
        })
        if (out.length >= pageSize) break
      }
    }

    // 3. Fallback to Firestore disabled for publication safety (P17.7H.3)
    // Only PostgreSQL canonical published articles linked to publisher sources or studio are served.


    out.sort((a, b) => {
      const am = a.publishedAt?.getTime() ?? 0
      const bm = b.publishedAt?.getTime() ?? 0
      return bm - am
    })

    const items = out.slice(0, pageSize)
    const last = items[items.length - 1]
    const nextCursor =
      out.length > pageSize && last?.publishedAt
        ? Buffer.from(`${last.publishedAt.getTime()}:${last.id}`, 'utf8').toString('base64url')
        : null

    return { items, nextCursor }
  }

  /**
   * Publisher-authored Content Studio articles (MANUAL / imported) that have a
   * canonical published_news_id — complements crawler source-linked resolution.
   */
  async resolveStudioPublishedArticles(
    publisherId: string,
    limit = 24
  ): Promise<PublisherArticleItem[]> {
    if (!hasDatabaseUrl()) return []
    const db = this.requireDb()
    const pageSize = Math.min(Math.max(limit, 1), 48)
    const { publisherContentItems } = await import('@/db/schema/publisherContent')

    const rows = await db
      .select({
        id: news.id,
        slug: news.slug,
        title: news.title,
        summary: news.summary,
        thumbnailUrl: news.thumbnailUrl,
        coverImageUrl: news.coverImageUrl,
        publishedAt: news.publishedAt,
      })
      .from(publisherContentItems)
      .innerJoin(news, eq(news.id, publisherContentItems.publishedNewsId))
      .where(
        and(
          eq(publisherContentItems.publisherId, publisherId),
          eq(publisherContentItems.status, 'PUBLISHED'),
          isNotNull(publisherContentItems.publishedNewsId),
          eq(news.status, 'published')
        )
      )
      .orderBy(desc(news.publishedAt))
      .limit(pageSize)

    return rows.map((n) => ({
      id: n.id,
      slug: n.slug,
      title: n.title,
      summary: n.summary,
      thumbnailUrl: n.coverImageUrl ?? n.thumbnailUrl,
      publishedAt: n.publishedAt,
      sourceId: 'publisher_studio',
    }))
  }
}

export const publisherRepository = new PublisherRepository()

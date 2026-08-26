/**
 * Phase P1/P1.1 publisher service tests — in-memory repository (no live DB).
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { PublisherRepository } from './publisherRepository'
import { bootstrapPublishersFromNewsSources } from './publisherBootstrapService'
import { PublisherClaimService } from './publisherClaimService'
import { PublisherService } from './publisherService'
import { serializePublicPublisher } from '@/lib/publisher/public'
import type {
  PublisherClaimRequestRecord,
  PublisherMemberRecord,
  PublisherRecord,
  PublisherSourceRecord,
} from '@/types/publisher'
import { newPublisherId } from '@/lib/publisher/id'

type NewsSourceRow = {
  id: string
  name: string
  domain: string
  baseUrl: string
  countryCode: string
  city: string | null
  district: string | null
  createdAt: Date
}

class MemoryPublisherRepo implements Pick<
  PublisherRepository,
  | 'slugExists'
  | 'findBySlug'
  | 'findById'
  | 'findByPrimaryDomain'
  | 'findPublisherBySubdomainParent'
  | 'findSourceLinkBySourceId'
  | 'insertPublisher'
  | 'insertPublisherSource'
  | 'listNewsSources'
  | 'findActiveOwner'
  | 'insertMember'
  | 'insertClaimRequest'
  | 'findClaimById'
  | 'listClaimsForPublisher'
  | 'updateClaimRequest'
  | 'updateClaimRequestIfPending'
  | 'approveClaimAtomic'
  | 'updatePublisher'
  | 'getSourceIdsForPublisher'
  | 'resolvePublishedArticles'
  | 'ensureUserExists'
> {
  publishers: PublisherRecord[] = []
  sources: PublisherSourceRecord[] = []
  members: PublisherMemberRecord[] = []
  claims: PublisherClaimRequestRecord[] = []
  newsSources: NewsSourceRow[] = []
  articlesBySource: Record<string, Array<{ newsId: string; title: string; slug: string }>> = {}
  firestoreOnlyBySource: Record<string, Array<{ newsId: string; title: string; slug: string }>> = {}
  usersCreated: Array<{ uid: string; email: string | null; role: string }> = []
  ownerConstraintEnabled = true

  async ensureUserExists(firebaseUid: string, email?: string | null): Promise<void> {
    this.usersCreated.push({ uid: firebaseUid, email: email ?? null, role: 'user' })
  }

  async slugExists(slug: string): Promise<boolean> {
    return this.publishers.some((p) => p.slug === slug)
  }

  async findBySlug(slug: string) {
    return this.publishers.find((p) => p.slug === slug) ?? null
  }

  async findById(id: string) {
    return this.publishers.find((p) => p.id === id) ?? null
  }

  async findByPrimaryDomain(domain: string) {
    return this.publishers.find((p) => p.primaryDomain === domain) ?? null
  }

  async findPublisherBySubdomainParent(domain: string) {
    const parts = domain.split('.').filter(Boolean)
    if (parts.length <= 2) return null
    const apex = parts.slice(-2).join('.')
    return this.publishers.find((p) => p.primaryDomain === apex) ?? null
  }

  async findSourceLinkBySourceId(sourceId: string) {
    return this.sources.find((s) => s.sourceId === sourceId) ?? null
  }

  async insertPublisher(input: Parameters<PublisherRepository['insertPublisher']>[0]) {
    const now = new Date()
    const row: PublisherRecord = {
      id: newPublisherId('pub'),
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
      claimedAt: null,
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    this.publishers.push(row)
    return row
  }

  async insertPublisherSource(input: Parameters<PublisherRepository['insertPublisherSource']>[0]) {
    const existing = await this.findSourceLinkBySourceId(input.sourceId)
    if (existing) return existing
    const now = new Date()
    const row: PublisherSourceRecord = {
      id: newPublisherId('psrc'),
      publisherId: input.publisherId,
      sourceId: input.sourceId,
      relationshipType: input.relationshipType ?? 'PRIMARY',
      isPrimary: input.isPrimary ?? true,
      createdAt: now,
      updatedAt: now,
    }
    this.sources.push(row)
    return row
  }

  async listNewsSources(limit: number, _offset = 0, sourceIds?: string[]) {
    if (sourceIds?.length) {
      const set = new Set(sourceIds)
      return this.newsSources.filter((s) => set.has(s.id)).slice(0, limit) as never
    }
    return this.newsSources.slice(0, limit) as never
  }

  async findActiveOwner(publisherId: string) {
    return (
      this.members.find(
        (m) => m.publisherId === publisherId && m.role === 'OWNER' && m.status === 'ACTIVE'
      ) ?? null
    )
  }

  async insertMember(input: Parameters<PublisherRepository['insertMember']>[0]) {
    if (
      this.ownerConstraintEnabled &&
      input.role === 'OWNER' &&
      (input.status ?? 'ACTIVE') === 'ACTIVE'
    ) {
      const existingOwner = await this.findActiveOwner(input.publisherId)
      if (existingOwner) {
        const err = new Error('duplicate active owner') as Error & { code?: string }
        err.code = '23505'
        throw err
      }
    }
    const dup = this.members.find(
      (m) => m.publisherId === input.publisherId && m.userId === input.userId
    )
    if (dup) return dup
    const now = new Date()
    const row: PublisherMemberRecord = {
      id: newPublisherId('pmem'),
      publisherId: input.publisherId,
      userId: input.userId,
      role: input.role,
      status: input.status ?? 'ACTIVE',
      invitedAt: null,
      acceptedAt: input.acceptedAt ?? now,
      createdAt: now,
      updatedAt: now,
    }
    this.members.push(row)
    return row
  }

  async insertClaimRequest(input: Parameters<PublisherRepository['insertClaimRequest']>[0]) {
    const now = new Date()
    const row: PublisherClaimRequestRecord = {
      id: newPublisherId('pclaim'),
      publisherId: input.publisherId,
      userId: input.userId,
      claimType: 'OWNERSHIP',
      status: 'PENDING',
      requestedDomain: input.requestedDomain ?? null,
      businessEmail: input.businessEmail ?? null,
      verificationMethod: input.verificationMethod ?? 'MANUAL',
      verificationPayload: input.verificationPayload ?? null,
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    }
    this.claims.push(row)
    return row
  }

  async findClaimById(id: string) {
    return this.claims.find((c) => c.id === id) ?? null
  }

  async listClaimsForPublisher(publisherId: string) {
    return this.claims.filter((c) => c.publisherId === publisherId)
  }

  async updateClaimRequest(id: string, patch: Parameters<PublisherRepository['updateClaimRequest']>[1]) {
    const idx = this.claims.findIndex((c) => c.id === id)
    if (idx < 0) return null
    this.claims[idx] = { ...this.claims[idx], ...patch, updatedAt: new Date() }
    return this.claims[idx]
  }

  async updateClaimRequestIfPending(
    id: string,
    patch: Parameters<PublisherRepository['updateClaimRequestIfPending']>[1]
  ) {
    const claim = this.claims.find((c) => c.id === id)
    if (!claim || claim.status !== 'PENDING') return null
    return this.updateClaimRequest(id, patch)
  }

  async approveClaimAtomic(input: Parameters<PublisherRepository['approveClaimAtomic']>[0]) {
    const updatedClaim = await this.updateClaimRequestIfPending(input.claimId, {
      status: 'APPROVED',
      reviewedBy: input.reviewedBy,
      reviewedAt: new Date(),
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
        acceptedAt: new Date(),
      })
    } catch {
      await this.updateClaimRequest(input.claimId, {
        status: 'REJECTED',
        reviewedBy: input.reviewedBy,
        reviewedAt: new Date(),
        rejectionReason: 'Another owner was approved concurrently',
      })
      throw new Error('OWNER_ALREADY_EXISTS')
    }

    const publisher = await this.updatePublisher(input.publisherId, {
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      claimedAt: new Date(),
      verifiedAt: new Date(),
    })
    if (!publisher) throw new Error('PUBLISHER_UPDATE_FAILED')
    return { publisher, claim: updatedClaim }
  }

  async updatePublisher(id: string, patch: Parameters<PublisherRepository['updatePublisher']>[1]) {
    const idx = this.publishers.findIndex((p) => p.id === id)
    if (idx < 0) return null
    this.publishers[idx] = { ...this.publishers[idx], ...patch, updatedAt: new Date() }
    return this.publishers[idx]
  }

  async getSourceIdsForPublisher(publisherId: string) {
    return this.sources.filter((s) => s.publisherId === publisherId).map((s) => s.sourceId)
  }

  async resolvePublishedArticles(sourceIds: string[], limit = 24) {
    const seen = new Set<string>()
    const out: Array<{
      id: string
      slug: string
      title: string
      summary: string | null
      thumbnailUrl: string | null
      publishedAt: Date | null
      sourceId: string
    }> = []
    for (const sid of sourceIds) {
      for (const a of this.articlesBySource[sid] ?? []) {
        if (seen.has(a.newsId)) continue
        seen.add(a.newsId)
        out.push({
          id: a.newsId,
          slug: a.slug,
          title: a.title,
          summary: null,
          thumbnailUrl: null,
          publishedAt: new Date(),
          sourceId: sid,
        })
      }
      for (const a of this.firestoreOnlyBySource[sid] ?? []) {
        if (seen.has(a.newsId)) continue
        seen.add(a.newsId)
        out.push({
          id: a.newsId,
          slug: a.slug,
          title: a.title,
          summary: null,
          thumbnailUrl: null,
          publishedAt: new Date(),
          sourceId: sid,
        })
      }
    }
    return { items: out.slice(0, limit), nextCursor: null }
  }
}

describe('publisher bootstrap idempotency', () => {
  let repo: MemoryPublisherRepo

  beforeEach(() => {
    repo = new MemoryPublisherRepo()
    repo.newsSources = [
      {
        id: 'src_test_1',
        name: 'Test Gazete',
        domain: 'testgazete.com',
        baseUrl: 'https://www.testgazete.com',
        countryCode: 'TR',
        city: 'İstanbul',
        district: null,
        createdAt: new Date(),
      },
    ]
  })

  it('creates 1 publisher + 1 link on first run, skips on second', async () => {
    const first = await bootstrapPublishersFromNewsSources({
      dryRun: false,
      limit: 25,
      repo: repo as unknown as PublisherRepository,
    })
    expect(first.created).toBe(1)
    expect(first.details[0]?.action).toBe('CREATE_PUBLISHER')
    expect(repo.publishers).toHaveLength(1)
    expect(repo.sources).toHaveLength(1)

    const second = await bootstrapPublishersFromNewsSources({
      dryRun: false,
      limit: 25,
      repo: repo as unknown as PublisherRepository,
    })
    expect(second.skipped).toBe(1)
    expect(second.details[0]?.action).toBe('SKIP_ALREADY_LINKED')
    expect(repo.publishers).toHaveLength(1)
    expect(repo.sources).toHaveLength(1)
  })

  it('does not merge subdomain sources into apex publisher', async () => {
    await repo.insertPublisher({
      name: 'Example',
      slug: 'example',
      displayName: 'Example',
      primaryDomain: 'example.com',
    })
    repo.newsSources.push({
      id: 'src_sub',
      name: 'News Example',
      domain: 'news.example.com',
      baseUrl: 'https://news.example.com',
      countryCode: 'TR',
      city: null,
      district: null,
      createdAt: new Date(),
    })

    const result = await bootstrapPublishersFromNewsSources({
      dryRun: true,
      sourceIds: ['src_sub'],
      repo: repo as unknown as PublisherRepository,
    })
    expect(result.ambiguous).toBe(1)
    expect(result.details[0]?.action).toBe('DOMAIN_AMBIGUOUS')
    expect(repo.publishers).toHaveLength(1)
  })

  it('filters bootstrap by explicit sourceIds', async () => {
    repo.newsSources.push({
      id: 'src_other',
      name: 'Other',
      domain: 'other.com',
      baseUrl: 'https://other.com',
      countryCode: 'TR',
      city: null,
      district: null,
      createdAt: new Date(),
    })
    const result = await bootstrapPublishersFromNewsSources({
      dryRun: true,
      sourceIds: ['src_test_1'],
      repo: repo as unknown as PublisherRepository,
    })
    expect(result.processed).toBe(1)
    expect(result.details[0]?.sourceId).toBe('src_test_1')
  })
})

describe('publisher claim flow', () => {
  let repo: MemoryPublisherRepo
  let claimService: PublisherClaimService

  beforeEach(async () => {
    repo = new MemoryPublisherRepo()
    const pub = await repo.insertPublisher({
      name: 'Claim Test',
      slug: 'claim-test',
      displayName: 'Claim Test',
      primaryDomain: 'claim.test',
      status: 'UNCLAIMED',
    })
    repo.publishers = [pub]
    claimService = new PublisherClaimService(repo as unknown as PublisherRepository)
  })

  it('claim request does not grant OWNER — only pending claim', async () => {
    const claim = await claimService.requestPublisherClaim({
      publisherId: repo.publishers[0].id,
      userId: 'user_claimer',
    })
    expect(claim.status).toBe('PENDING')
    expect(repo.publishers[0].verificationStatus).toBe('PENDING')
    const owner = await repo.findActiveOwner(repo.publishers[0].id)
    expect(owner).toBeNull()
    expect(repo.members.filter((m) => m.role === 'OWNER')).toHaveLength(0)
  })

  it('admin approve sets ACTIVE + VERIFIED + OWNER member', async () => {
    const claim = await claimService.requestPublisherClaim({
      publisherId: repo.publishers[0].id,
      userId: 'user_owner',
    })
    const result = await claimService.approvePublisherClaim({
      claimId: claim.id,
      reviewedBy: 'admin_uid',
    })
    expect(result.alreadyApproved).toBe(false)
    expect(result.publisher.status).toBe('ACTIVE')
    expect(result.publisher.verificationStatus).toBe('VERIFIED')
    expect(result.publisher.claimedAt).toBeTruthy()
    const owner = await repo.findActiveOwner(repo.publishers[0].id)
    expect(owner?.userId).toBe('user_owner')
    expect(owner?.role).toBe('OWNER')
  })

  it('double approve is idempotent', async () => {
    const claim = await claimService.requestPublisherClaim({
      publisherId: repo.publishers[0].id,
      userId: 'user_a',
    })
    const first = await claimService.approvePublisherClaim({ claimId: claim.id, reviewedBy: 'admin' })
    const second = await claimService.approvePublisherClaim({ claimId: claim.id, reviewedBy: 'admin' })
    expect(first.alreadyApproved).toBe(false)
    expect(second.alreadyApproved).toBe(true)
    expect(repo.members.filter((m) => m.role === 'OWNER' && m.status === 'ACTIVE')).toHaveLength(1)
  })

  it('rejects duplicate OWNER on second approve (race)', async () => {
    const claim1 = await claimService.requestPublisherClaim({
      publisherId: repo.publishers[0].id,
      userId: 'user_a',
    })
    await claimService.approvePublisherClaim({ claimId: claim1.id, reviewedBy: 'admin' })

    const claim2 = await repo.insertClaimRequest({
      publisherId: repo.publishers[0].id,
      userId: 'user_b',
    })
    await expect(
      claimService.approvePublisherClaim({ claimId: claim2.id, reviewedBy: 'admin' })
    ).rejects.toThrow(/OWNER_ALREADY_EXISTS/)
    expect(repo.members.filter((m) => m.role === 'OWNER' && m.status === 'ACTIVE')).toHaveLength(1)
  })

  it('reject is idempotent', async () => {
    const claim = await claimService.requestPublisherClaim({
      publisherId: repo.publishers[0].id,
      userId: 'user_x',
    })
    const first = await claimService.rejectPublisherClaim({
      claimId: claim.id,
      reviewedBy: 'admin',
      rejectionReason: 'Invalid proof',
    })
    const second = await claimService.rejectPublisherClaim({
      claimId: claim.id,
      reviewedBy: 'admin',
      rejectionReason: 'Invalid proof',
    })
    expect(first.alreadyRejected).toBe(false)
    expect(second.alreadyRejected).toBe(true)
  })

  it('ensureUserExists creates app user with user role — not CMS admin', async () => {
    await claimService.requestPublisherClaim({
      publisherId: repo.publishers[0].id,
      userId: 'firebase_user_1',
      userEmail: 'owner@example.com',
    })
    expect(repo.usersCreated).toHaveLength(1)
    expect(repo.usersCreated[0]).toEqual({
      uid: 'firebase_user_1',
      email: 'owner@example.com',
      role: 'user',
    })
  })
})

describe('profile articles resolution', () => {
  it('resolves articles via linked source ids', async () => {
    const repo = new MemoryPublisherRepo()
    const pub = await repo.insertPublisher({
      name: 'Art Pub',
      slug: 'art-pub',
      displayName: 'Art Pub',
    })
    await repo.insertPublisherSource({ publisherId: pub.id, sourceId: 'src_a', isPrimary: true })
    repo.articlesBySource.src_a = [{ newsId: 'news_1', title: 'Haber 1', slug: 'haber-1' }]

    const svc = new PublisherService(repo as unknown as PublisherRepository)
    const page = await svc.getPublisherArticles(pub.id)
    expect(page.items).toHaveLength(1)
    expect(page.items[0].slug).toBe('haber-1')
    expect(page.items[0].sourceId).toBe('src_a')
  })

  it('dedupes PG + Firestore articles by stable id', async () => {
    const repo = new MemoryPublisherRepo()
    const pub = await repo.insertPublisher({
      name: 'Dedupe Pub',
      slug: 'dedupe-pub',
      displayName: 'Dedupe Pub',
    })
    await repo.insertPublisherSource({ publisherId: pub.id, sourceId: 'src_b', isPrimary: true })
    repo.articlesBySource.src_b = [{ newsId: 'news_shared', title: 'PG Haber', slug: 'pg-haber' }]
    repo.firestoreOnlyBySource.src_b = [
      { newsId: 'news_shared', title: 'FS Haber', slug: 'fs-haber' },
    ]

    const page = await repo.resolvePublishedArticles(['src_b'], 24)
    expect(page.items).toHaveLength(1)
    expect(page.items[0].id).toBe('news_shared')
  })
})

describe('public profile serialization', () => {
  it('does not expose private fields', async () => {
    const repo = new MemoryPublisherRepo()
    const pub = await repo.insertPublisher({
      name: 'Secret Co',
      slug: 'secret-co',
      displayName: 'Secret Co',
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
    })
    const serialized = serializePublicPublisher(pub)
    expect(JSON.stringify(serialized)).not.toMatch(/business_email|firebase_uid|verification_payload/i)
  })
})

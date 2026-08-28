import { describe, expect, it, beforeEach } from 'vitest'
import {
  extractEmailDomain,
  isLegitimateDomainMatch,
  isSubdomainOf,
  matchClaimDomain,
  normalizeDomain,
} from '@/lib/publisher/domain'
import { PublisherClaimService } from './publisherClaimService'
import { PublisherRepository } from './publisherRepository'
import { newPublisherId } from '@/lib/publisher/id'
import type {
  PublisherClaimRequestRecord,
  PublisherMemberRecord,
  PublisherRecord,
  PublisherSourceRecord,
} from '@/types/publisher'
import { requirePublisherMember } from './publisherLayoutService'

class MockPublisherRepo {
  publishers: PublisherRecord[] = []
  sources: PublisherSourceRecord[] = []
  members: PublisherMemberRecord[] = []
  claims: PublisherClaimRequestRecord[] = []
  usersCreated: Array<{ uid: string; email: string | null; role: string }> = []

  async ensureUserExists(firebaseUid: string, email?: string | null): Promise<void> {
    this.usersCreated.push({ uid: firebaseUid, email: email ?? null, role: 'user' })
  }

  async findById(id: string) {
    return this.publishers.find((p) => p.id === id) ?? null
  }

  async findBySlug(slug: string) {
    return this.publishers.find((p) => p.slug === slug) ?? null
  }

  async findActiveOwner(publisherId: string) {
    return (
      this.members.find(
        (m) => m.publisherId === publisherId && m.role === 'OWNER' && m.status === 'ACTIVE'
      ) ?? null
    )
  }

  async findActiveMember(publisherId: string, userId: string) {
    return (
      this.members.find(
        (m) => m.publisherId === publisherId && m.userId === userId && m.status === 'ACTIVE'
      ) ?? null
    )
  }

  async listMembersForPublisher(publisherId: string) {
    return this.members.filter((m) => m.publisherId === publisherId && m.status === 'ACTIVE')
  }

  async insertMember(input: {
    publisherId: string
    userId: string
    role: PublisherMemberRecord['role']
    status: PublisherMemberRecord['status']
    acceptedAt: Date
  }) {
    if (
      input.role === 'OWNER' &&
      input.status === 'ACTIVE' &&
      this.members.some(
        (m) => m.publisherId === input.publisherId && m.role === 'OWNER' && m.status === 'ACTIVE'
      )
    ) {
      throw new Error('publisher_members_one_active_owner')
    }
    const member: PublisherMemberRecord = {
      id: newPublisherId('pmem'),
      publisherId: input.publisherId,
      userId: input.userId,
      role: input.role,
      status: input.status,
      invitedAt: null,
      acceptedAt: input.acceptedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.members.push(member)
    return member
  }

  async insertClaimRequest(input: {
    publisherId: string
    userId: string
    requestedDomain?: string | null
    businessEmail?: string | null
    verificationMethod?: PublisherClaimRequestRecord['verificationMethod']
    verificationPayload?: Record<string, unknown> | null
  }) {
    const claim: PublisherClaimRequestRecord = {
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
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.claims.push(claim)
    return claim
  }

  async findClaimById(id: string) {
    return this.claims.find((c) => c.id === id) ?? null
  }

  async listClaimsForPublisher(publisherId: string) {
    return this.claims.filter((c) => c.publisherId === publisherId)
  }

  async updateClaimRequest(
    id: string,
    patch: Partial<{
      status: PublisherClaimRequestRecord['status']
      reviewedBy: string | null
      reviewedAt: Date | null
      rejectionReason: string | null
    }>
  ) {
    const idx = this.claims.findIndex((c) => c.id === id)
    if (idx < 0) return null
    this.claims[idx] = { ...this.claims[idx], ...patch, updatedAt: new Date() }
    return this.claims[idx]
  }

  async updateClaimRequestIfPending(
    id: string,
    patch: Partial<{
      status: PublisherClaimRequestRecord['status']
      reviewedBy: string | null
      reviewedAt: Date | null
      rejectionReason: string | null
    }>
  ) {
    const claim = this.claims.find((c) => c.id === id)
    if (!claim || claim.status !== 'PENDING') return null
    return this.updateClaimRequest(id, patch)
  }

  async approveClaimAtomic(input: {
    claimId: string
    reviewedBy: string
    publisherId: string
    userId: string
  }) {
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

  async revokeClaim(input: {
    claimId: string
    reviewedBy: string
    revocationReason?: string
  }) {
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

    const updatedClaim = await this.updateClaimRequest(input.claimId, {
      status: 'REVOKED',
      reviewedBy: input.reviewedBy,
      reviewedAt: new Date(),
      rejectionReason: input.revocationReason ?? 'Claim revoked by administrator',
    })
    if (!updatedClaim) throw new Error('CLAIM_UPDATE_FAILED')

    const memberIdx = this.members.findIndex(
      (m) => m.publisherId === claim.publisherId && m.userId === claim.userId
    )
    if (memberIdx >= 0) {
      this.members[memberIdx] = {
        ...this.members[memberIdx],
        status: 'REMOVED',
        updatedAt: new Date(),
      }
    }

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

  async updatePublisher(id: string, patch: Partial<PublisherRecord>) {
    const idx = this.publishers.findIndex((p) => p.id === id)
    if (idx < 0) return null
    this.publishers[idx] = { ...this.publishers[idx], ...patch, updatedAt: new Date() }
    return this.publishers[idx]
  }

  async insertPublisher(input: Partial<PublisherRecord> & { name: string; slug: string; displayName: string }) {
    const pub: PublisherRecord = {
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
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.publishers.push(pub)
    return pub
  }
}

describe('Phase P13 — Real Publisher Claim Operations & Verification', () => {
  let repo: MockPublisherRepo
  let claimService: PublisherClaimService
  let guardianPub: PublisherRecord

  beforeEach(async () => {
    repo = new MockPublisherRepo()
    guardianPub = await repo.insertPublisher({
      name: 'The Guardian World RSS',
      slug: 'the-guardian-world-rss',
      displayName: 'The Guardian World',
      primaryDomain: 'theguardian.com',
      status: 'UNCLAIMED',
      verificationStatus: 'UNCLAIMED',
    })
    claimService = new PublisherClaimService(repo as unknown as PublisherRepository)
  })

  describe('1. Domain Verification & Spoof Hardening', () => {
    it('exact domain match or email on primary domain validates legitimate match', () => {
      const emailMatch = matchClaimDomain('editor@theguardian.com', 'theguardian.com')
      expect(emailMatch.matches).toBe(true)
      expect(emailMatch.matchType).toBe('EXACT')
      expect(emailMatch.isLegitimateMatch).toBe(true)
      expect(emailMatch.isSpoofAttempt).toBe(false)
      expect(isLegitimateDomainMatch('editor@theguardian.com', 'theguardian.com')).toBe(true)

      const domainMatch = matchClaimDomain('theguardian.com', 'theguardian.com')
      expect(domainMatch.matches).toBe(true)
      expect(domainMatch.matchType).toBe('EXACT')
      expect(domainMatch.isLegitimateMatch).toBe(true)
    })

    it('legitimate subdomains validate as legitimate SUBDOMAIN match', () => {
      const subMatch = matchClaimDomain('user@news.theguardian.com', 'theguardian.com')
      expect(subMatch.matches).toBe(true)
      expect(subMatch.matchType).toBe('SUBDOMAIN')
      expect(subMatch.isLegitimateMatch).toBe(true)
      expect(subMatch.isSpoofAttempt).toBe(false)

      const ukSub = matchClaimDomain('uk.theguardian.com', 'theguardian.com')
      expect(ukSub.matches).toBe(true)
      expect(ukSub.matchType).toBe('SUBDOMAIN')
      expect(ukSub.isLegitimateMatch).toBe(true)
    })

    it('explicitly rejects subdomain spoofing: theguardian.com.attacker.tld', () => {
      const res = matchClaimDomain('theguardian.com.attacker.tld', 'theguardian.com')
      expect(res.matches).toBe(false)
      expect(res.matchType).toBe('MISMATCH')
      expect(res.isLegitimateMatch).toBe(false)
      expect(res.isSpoofAttempt).toBe(true)
      expect(isLegitimateDomainMatch('theguardian.com.attacker.tld', 'theguardian.com')).toBe(false)
    })

    it('explicitly rejects hyphenated lookalike spoof: theguardian-com.example and fake-theguardian.com', () => {
      const res1 = matchClaimDomain('theguardian-com.example', 'theguardian.com')
      expect(res1.matches).toBe(false)
      expect(res1.isLegitimateMatch).toBe(false)
      expect(res1.isSpoofAttempt).toBe(true)

      const res2 = matchClaimDomain('fake-theguardian.com', 'theguardian.com')
      expect(res2.matches).toBe(false)
      expect(res2.isLegitimateMatch).toBe(false)
      expect(res2.isSpoofAttempt).toBe(true)
    })

    it('explicitly rejects email domain spoof: user@theguardian.com.evil.co', () => {
      const res = matchClaimDomain('user@theguardian.com.evil.co', 'theguardian.com')
      expect(res.matches).toBe(false)
      expect(res.matchType).toBe('MISMATCH')
      expect(res.isLegitimateMatch).toBe(false)
      expect(res.isSpoofAttempt).toBe(true)
      expect(isLegitimateDomainMatch('user@theguardian.com.evil.co', 'theguardian.com')).toBe(false)
    })

    it('handles invalid email and domain inputs safely', () => {
      const res1 = matchClaimDomain('', 'theguardian.com')
      expect(res1.matchType).toBe('INVALID')
      expect(res1.matches).toBe(false)

      const res2 = matchClaimDomain('invalid@@email..', 'theguardian.com')
      expect(res2.matchType).toBe('INVALID')
      expect(res2.matches).toBe(false)
    })
  })

  describe('2. Claim Evidence Model & Non-Automatic Approval', () => {
    it('claim request records domain match evidence into verificationPayload', async () => {
      const claim = await claimService.requestPublisherClaim({
        publisherId: guardianPub.id,
        userId: 'guardian_rep_1',
        businessEmail: 'editor@theguardian.com',
        userEmail: 'guardian_rep_1@example.com',
      })

      expect(claim.status).toBe('PENDING')
      const payload = claim.verificationPayload as { domainEvidence?: { matches: boolean; matchType: string } }
      expect(payload?.domainEvidence?.matches).toBe(true)
      expect(payload?.domainEvidence?.matchType).toBe('EXACT')

      // Evidence only: publisher remains UNCLAIMED, verificationStatus PENDING, 0 members
      const pub = await repo.findById(guardianPub.id)
      expect(pub?.status).toBe('UNCLAIMED')
      expect(pub?.verificationStatus).toBe('PENDING')
      expect(repo.members).toHaveLength(0)
    })

    it('spoofed email claim is recorded as PENDING with spoof detection in evidence', async () => {
      const claim = await claimService.requestPublisherClaim({
        publisherId: guardianPub.id,
        userId: 'attacker_uid',
        businessEmail: 'user@theguardian.com.evil.co',
      })

      expect(claim.status).toBe('PENDING')
      const payload = claim.verificationPayload as {
        domainEvidence?: { matches: boolean; isSpoofAttempt: boolean }
      }
      expect(payload?.domainEvidence?.matches).toBe(false)
      expect(payload?.domainEvidence?.isSpoofAttempt).toBe(true)
    })
  })

  describe('3. Claim Lifecycle: Admin Review, Atomic Approval & Idempotency', () => {
    it('explicit admin approval transitions claim to APPROVED and grants single OWNER', async () => {
      const claim = await claimService.requestPublisherClaim({
        publisherId: guardianPub.id,
        userId: 'legit_guardian_owner',
        businessEmail: 'editor@theguardian.com',
      })

      const approved = await claimService.approvePublisherClaim({
        claimId: claim.id,
        reviewedBy: 'admin_security_lead',
      })

      expect(approved.alreadyApproved).toBe(false)
      expect(approved.claim.status).toBe('APPROVED')
      expect(approved.publisher.status).toBe('ACTIVE')
      expect(approved.publisher.verificationStatus).toBe('VERIFIED')
      expect(approved.publisher.claimedAt).not.toBeNull()
      expect(approved.publisher.verifiedAt).not.toBeNull()

      const owner = await repo.findActiveOwner(guardianPub.id)
      expect(owner).not.toBeNull()
      expect(owner?.userId).toBe('legit_guardian_owner')
      expect(owner?.role).toBe('OWNER')
      expect(owner?.status).toBe('ACTIVE')
    })

    it('duplicate approval calls are idempotent and do not corrupt state or create duplicate members', async () => {
      const claim = await claimService.requestPublisherClaim({
        publisherId: guardianPub.id,
        userId: 'owner_user_id',
        businessEmail: 'news@theguardian.com',
      })

      const firstApprove = await claimService.approvePublisherClaim({
        claimId: claim.id,
        reviewedBy: 'admin_1',
      })
      expect(firstApprove.alreadyApproved).toBe(false)

      const secondApprove = await claimService.approvePublisherClaim({
        claimId: claim.id,
        reviewedBy: 'admin_2',
      })
      expect(secondApprove.alreadyApproved).toBe(true)
      expect(secondApprove.claim.status).toBe('APPROVED')

      // Exactly 1 owner member exists
      const members = await repo.listMembersForPublisher(guardianPub.id)
      expect(members).toHaveLength(1)
      expect(members[0].role).toBe('OWNER')
    })

    it('concurrent race approval is blocked by single-owner constraint', async () => {
      // First user claims and gets approved
      const claim1 = await claimService.requestPublisherClaim({
        publisherId: guardianPub.id,
        userId: 'owner_1',
        businessEmail: 'owner1@theguardian.com',
      })
      await claimService.approvePublisherClaim({ claimId: claim1.id, reviewedBy: 'admin' })

      // Second user tries to approve a concurrent claim
      const claim2: PublisherClaimRequestRecord = {
        id: 'pclaim_concurrent_2',
        publisherId: guardianPub.id,
        userId: 'owner_2',
        claimType: 'OWNERSHIP',
        status: 'PENDING',
        requestedDomain: 'theguardian.com',
        businessEmail: 'owner2@theguardian.com',
        verificationMethod: 'MANUAL',
        verificationPayload: null,
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      repo.claims.push(claim2)

      await expect(
        claimService.approvePublisherClaim({ claimId: claim2.id, reviewedBy: 'admin' })
      ).rejects.toThrow('OWNER_ALREADY_EXISTS')

      const updatedClaim2 = await repo.findClaimById(claim2.id)
      expect(updatedClaim2?.status).toBe('REJECTED')
    })
  })

  describe('4. Rejection Lifecycle', () => {
    it('admin rejection marks claim REJECTED with reason; publisher remains UNCLAIMED; zero memberships created', async () => {
      const claim = await claimService.requestPublisherClaim({
        publisherId: guardianPub.id,
        userId: 'attacker_user',
        businessEmail: 'spoof@theguardian.com.evil.co',
      })

      const rejected = await claimService.rejectPublisherClaim({
        claimId: claim.id,
        reviewedBy: 'admin_reviewer',
        rejectionReason: 'Spoofed email domain detected',
      })

      expect(rejected.alreadyRejected).toBe(false)
      expect(rejected.claim.status).toBe('REJECTED')
      expect(rejected.claim.rejectionReason).toBe('Spoofed email domain detected')

      // Publisher remains UNCLAIMED
      const pub = await repo.findById(guardianPub.id)
      expect(pub?.status).toBe('UNCLAIMED')
      expect(pub?.verificationStatus).toBe('UNCLAIMED')

      // Zero members created
      const members = await repo.listMembersForPublisher(guardianPub.id)
      expect(members).toHaveLength(0)
    })

    it('duplicate rejection calls are idempotent', async () => {
      const claim = await claimService.requestPublisherClaim({
        publisherId: guardianPub.id,
        userId: 'user_x',
      })

      await claimService.rejectPublisherClaim({
        claimId: claim.id,
        reviewedBy: 'admin',
        rejectionReason: 'Not verified',
      })

      const secondReject = await claimService.rejectPublisherClaim({
        claimId: claim.id,
        reviewedBy: 'admin',
        rejectionReason: 'Not verified duplicate call',
      })

      expect(secondReject.alreadyRejected).toBe(true)
      expect(secondReject.claim.status).toBe('REJECTED')
    })
  })

  describe('5. Revocation Lifecycle', () => {
    it('revoking approved claim reverts publisher to UNCLAIMED and safely deactivates OWNER membership', async () => {
      const claim = await claimService.requestPublisherClaim({
        publisherId: guardianPub.id,
        userId: 'guardian_staff',
        businessEmail: 'staff@theguardian.com',
      })
      await claimService.approvePublisherClaim({ claimId: claim.id, reviewedBy: 'admin' })

      // Verify active state
      let pub = await repo.findById(guardianPub.id)
      expect(pub?.status).toBe('ACTIVE')
      expect(pub?.verificationStatus).toBe('VERIFIED')
      let activeOwner = await repo.findActiveOwner(guardianPub.id)
      expect(activeOwner).not.toBeNull()

      // Revoke claim
      const revoked = await claimService.revokePublisherClaim({
        claimId: claim.id,
        reviewedBy: 'admin_lead',
        revocationReason: 'Publisher requested ownership transfer / security audit revocation',
      })

      expect(revoked.alreadyRevoked).toBe(false)
      expect(revoked.claim.status).toBe('REVOKED')
      expect(revoked.publisher.status).toBe('UNCLAIMED')
      expect(revoked.publisher.verificationStatus).toBe('UNCLAIMED')
      expect(revoked.publisher.claimedAt).toBeNull()
      expect(revoked.publisher.verifiedAt).toBeNull()

      // Owner membership is REMOVED (no active owner)
      activeOwner = await repo.findActiveOwner(guardianPub.id)
      expect(activeOwner).toBeNull()
      const activeMembers = await repo.listMembersForPublisher(guardianPub.id)
      expect(activeMembers).toHaveLength(0)
    })

    it('duplicate revocation is idempotent', async () => {
      const claim = await claimService.requestPublisherClaim({
        publisherId: guardianPub.id,
        userId: 'staff_1',
      })
      await claimService.approvePublisherClaim({ claimId: claim.id, reviewedBy: 'admin' })

      await claimService.revokePublisherClaim({ claimId: claim.id, reviewedBy: 'admin' })
      const secondRevoke = await claimService.revokePublisherClaim({
        claimId: claim.id,
        reviewedBy: 'admin',
      })

      expect(secondRevoke.alreadyRevoked).toBe(true)
      expect(secondRevoke.claim.status).toBe('REVOKED')
    })

    it('attempting to revoke a non-approved claim fails', async () => {
      const pendingClaim = await claimService.requestPublisherClaim({
        publisherId: guardianPub.id,
        userId: 'staff_pending',
      })

      await expect(
        claimService.revokePublisherClaim({ claimId: pendingClaim.id, reviewedBy: 'admin' })
      ).rejects.toThrow('CLAIM_NOT_APPROVED')
    })
  })

  describe('6. Studio Access Enforcement', () => {
    it('unclaimed publisher rejects non-member / external studio access', async () => {
      await expect(
        requirePublisherMember(
          guardianPub.id,
          'unauthorized_external_user',
          'studio:access',
          repo as unknown as PublisherRepository
        )
      ).rejects.toThrow('NOT_A_MEMBER')
    })

    it('approved owner has valid studio permissions', async () => {
      const claim = await claimService.requestPublisherClaim({
        publisherId: guardianPub.id,
        userId: 'verified_guardian_admin',
      })
      await claimService.approvePublisherClaim({ claimId: claim.id, reviewedBy: 'admin' })

      const member = await requirePublisherMember(
        guardianPub.id,
        'verified_guardian_admin',
        'studio:access',
        repo as unknown as PublisherRepository
      )
      expect(member.role).toBe('OWNER')
      expect(member.status).toBe('ACTIVE')
    })

    it('revoked owner loses studio access immediately', async () => {
      const claim = await claimService.requestPublisherClaim({
        publisherId: guardianPub.id,
        userId: 'guardian_former_owner',
      })
      await claimService.approvePublisherClaim({ claimId: claim.id, reviewedBy: 'admin' })

      // Revoke
      await claimService.revokePublisherClaim({ claimId: claim.id, reviewedBy: 'admin' })

      // Access is now rejected
      await expect(
        requirePublisherMember(
          guardianPub.id,
          'guardian_former_owner',
          'studio:access',
          repo as unknown as PublisherRepository
        )
      ).rejects.toThrow('NOT_A_MEMBER')
    })
  })
})

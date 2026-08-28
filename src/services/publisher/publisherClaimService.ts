import { publisherLog } from '@/lib/publisher/observability'
import { isPublisherVerified } from '@/lib/publisher/public'
import { matchClaimDomain, normalizeDomain } from '@/lib/publisher/domain'
import { PublisherRepository, publisherRepository } from './publisherRepository'
import type {
  ApproveClaimResult,
  PublisherClaimRequestRecord,
  PublisherRecord,
  RejectClaimResult,
  RevokeClaimResult,
} from '@/types/publisher'

export class PublisherClaimService {
  constructor(private readonly repo: PublisherRepository = publisherRepository) {}

  /**
   * User submits a claim request — never grants OWNER directly.
   * Computes domain matching evidence without automatic approval.
   */
  async requestPublisherClaim(input: {
    publisherId: string
    userId: string
    userEmail?: string | null
    requestedDomain?: string | null
    businessEmail?: string | null
    verificationMethod?: PublisherClaimRequestRecord['verificationMethod']
    verificationPayload?: Record<string, unknown> | null
  }): Promise<PublisherClaimRequestRecord> {
    const publisher = await this.repo.findById(input.publisherId)
    if (!publisher) throw new Error('PUBLISHER_NOT_FOUND')
    if (isPublisherVerified(publisher)) throw new Error('PUBLISHER_ALREADY_VERIFIED')
    if (publisher.status === 'SUSPENDED' || publisher.status === 'INACTIVE') {
      throw new Error('PUBLISHER_NOT_CLAIMABLE')
    }

    await this.repo.ensureUserExists(input.userId, input.userEmail ?? input.businessEmail)

    const existingOwner = await this.repo.findActiveOwner(input.publisherId)
    if (existingOwner) throw new Error('PUBLISHER_ALREADY_CLAIMED')

    const pending = (await this.repo.listClaimsForPublisher(input.publisherId)).find(
      (c) => c.status === 'PENDING'
    )
    if (pending) throw new Error('CLAIM_ALREADY_PENDING')

    // Evaluate domain match evidence (EVIDENCE ONLY, never automatic approval)
    const candidateToMatch =
      input.businessEmail || input.requestedDomain || input.userEmail || ''
    const domainEvidence = matchClaimDomain(candidateToMatch, publisher.primaryDomain)

    const mergedPayload: Record<string, unknown> = {
      ...(input.verificationPayload ?? {}),
      domainEvidence,
    }

    const claim = await this.repo.insertClaimRequest({
      publisherId: input.publisherId,
      userId: input.userId,
      requestedDomain: input.requestedDomain
        ? normalizeDomain(input.requestedDomain)
        : publisher.primaryDomain,
      businessEmail: input.businessEmail ?? null,
      verificationMethod: input.verificationMethod ?? 'MANUAL',
      verificationPayload: mergedPayload,
    })

    await this.repo.updatePublisher(input.publisherId, {
      verificationStatus: 'PENDING',
    })

    publisherLog('PUBLISHER_CLAIM_REQUESTED', {
      claimId: claim.id,
      publisherId: input.publisherId,
      userId: input.userId,
      domainMatch: domainEvidence.matches,
      matchType: domainEvidence.matchType,
      isSpoof: domainEvidence.isSpoofAttempt,
    })

    return claim
  }

  /**
   * Admin-only atomic approve: ACTIVE publisher + single OWNER member.
   * Idempotent when the same claim was already approved.
   */
  async approvePublisherClaim(input: {
    claimId: string
    reviewedBy: string
  }): Promise<ApproveClaimResult> {
    const claim = await this.repo.findClaimById(input.claimId)
    if (!claim) throw new Error('CLAIM_NOT_FOUND')

    if (claim.status === 'APPROVED') {
      const publisher = await this.repo.findById(claim.publisherId)
      if (!publisher) throw new Error('PUBLISHER_NOT_FOUND')
      return { publisher, claim, alreadyApproved: true }
    }

    if (claim.status !== 'PENDING') throw new Error('CLAIM_NOT_PENDING')

    const result = await this.repo.approveClaimAtomic({
      claimId: input.claimId,
      reviewedBy: input.reviewedBy,
      publisherId: claim.publisherId,
      userId: claim.userId,
    })

    publisherLog('PUBLISHER_CLAIM_APPROVED', {
      claimId: claim.id,
      publisherId: claim.publisherId,
      reviewedBy: input.reviewedBy,
    })
    publisherLog('PUBLISHER_OWNER_CREATED', {
      claimId: claim.id,
      publisherId: claim.publisherId,
      userId: claim.userId,
    })

    return { ...result, alreadyApproved: false }
  }

  /**
   * Admin-only reject: Claim marked REJECTED with reason.
   * Publisher returns to UNCLAIMED; zero memberships created.
   */
  async rejectPublisherClaim(input: {
    claimId: string
    reviewedBy: string
    rejectionReason: string
  }): Promise<RejectClaimResult> {
    const claim = await this.repo.findClaimById(input.claimId)
    if (!claim) throw new Error('CLAIM_NOT_FOUND')

    if (claim.status === 'REJECTED') {
      return { claim, alreadyRejected: true }
    }

    if (claim.status !== 'PENDING') throw new Error('CLAIM_NOT_PENDING')

    const now = new Date()
    const updated = await this.repo.updateClaimRequestIfPending(claim.id, {
      status: 'REJECTED',
      reviewedBy: input.reviewedBy,
      reviewedAt: now,
      rejectionReason: input.rejectionReason.trim().slice(0, 500),
    })
    if (!updated) {
      const latest = await this.findClaimById(claim.id)
      if (latest?.status === 'REJECTED') return { claim: latest, alreadyRejected: true }
      throw new Error('CLAIM_NOT_PENDING')
    }

    const pendingLeft = (await this.repo.listClaimsForPublisher(claim.publisherId)).some(
      (c) => c.id !== claim.id && c.status === 'PENDING'
    )
    if (!pendingLeft) {
      const publisher = await this.repo.findById(claim.publisherId)
      if (publisher && !isPublisherVerified(publisher)) {
        await this.repo.updatePublisher(claim.publisherId, {
          status: 'UNCLAIMED',
          verificationStatus: 'UNCLAIMED',
        })
      }
    }

    publisherLog('PUBLISHER_CLAIM_REJECTED', {
      claimId: claim.id,
      publisherId: claim.publisherId,
      reviewedBy: input.reviewedBy,
    })

    return { claim: updated, alreadyRejected: false }
  }

  /**
   * Admin-only revoke: Reverts approved claim, revokes OWNER membership safely,
   * and reverts publisher verification to UNCLAIMED.
   */
  async revokePublisherClaim(input: {
    claimId: string
    reviewedBy: string
    revocationReason?: string
  }): Promise<RevokeClaimResult> {
    const claim = await this.repo.findClaimById(input.claimId)
    if (!claim) throw new Error('CLAIM_NOT_FOUND')

    if (claim.status === 'REVOKED') {
      const publisher = await this.repo.findById(claim.publisherId)
      if (!publisher) throw new Error('PUBLISHER_NOT_FOUND')
      return { publisher, claim, alreadyRevoked: true }
    }

    if (claim.status !== 'APPROVED') {
      throw new Error('CLAIM_NOT_APPROVED')
    }

    const result = await this.repo.revokeClaim({
      claimId: input.claimId,
      reviewedBy: input.reviewedBy,
      revocationReason: input.revocationReason,
    })

    publisherLog('PUBLISHER_CLAIM_REVOKED', {
      claimId: claim.id,
      publisherId: claim.publisherId,
      reviewedBy: input.reviewedBy,
      userId: claim.userId,
    })

    return result
  }

  private async findClaimById(id: string) {
    return this.repo.findClaimById(id)
  }
}

export const publisherClaimService = new PublisherClaimService()

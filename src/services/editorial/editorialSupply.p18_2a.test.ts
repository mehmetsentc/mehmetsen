import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { PublicationAuthorityError } from './publicationAuthority'

vi.mock('@/db', () => ({
  hasDatabaseUrl: () => true,
  getDb: vi.fn(() => ({
    update: () => ({
      set: () => ({
        where: vi.fn(async () => undefined),
      }),
    }),
  })),
}))

vi.mock('@/lib/firebase/admin', () => {
  const set = vi.fn(async () => undefined)
  return {
    Collections: { NEWS: 'news' },
    getAdminFirestore: () => ({
      collection: () => ({
        doc: () => ({
          id: 'news_should_not_write',
          set,
        }),
      }),
    }),
    __firestoreSet: set,
  }
})

vi.mock('@/services/publisher/newsMirrorRepository', () => ({
  newsMirrorRepository: {
    ensurePublishedNewsMirror: vi.fn(async () => {
      throw new Error('PG mirror must not run')
    }),
  },
}))

import { EditorialSupplyService } from './editorialSupplyService'
import { authorizePublication, publicationProvenanceFields } from './publicationAuthority'

const HUMAN_UID = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'
const AUTO_UID = 'ap3scBglLIVwflfZN4qL8PKrM1A3'

const richBody =
  'Yetkililer bölgede inceleme başlattı. Olay yerinde ekipler müdahale etti. ' +
  'Kaynaklar gelişmeleri aktardı ve resmi açıklama bekleniyor. '.repeat(12)

function mockClusterBundle() {
  return {
    cluster: {
      id: 'clu_test_1',
      publishedNewsId: null,
      canonicalTitle: 'Çanakkale Boğazı gemi trafiğine geçici olarak kapatıldı',
      categoryHint: 'gundem',
      category: 'gundem',
      city: 'Çanakkale',
      district: null,
      countryCode: 'TR',
      primaryImageUrl: 'https://cdn.example.com/news/hero.jpg',
      createdAt: new Date('2026-09-01T10:00:00Z'),
    },
    candidates: [
      {
        id: 'raw_1',
        sourceId: 'src_1',
        sourceName: 'Test Kaynak',
        sourceQualityTier: 'A',
        sourceHealthScore: 90,
        sourceStatus: 'ACTIVE',
        title: 'Çanakkale Boğazı gemi trafiğine geçici olarak kapatıldı',
        description: 'Kıyı Emniyeti geçici kapatma kararı aldı.',
        body: richBody,
        canonicalUrl: 'https://example.com/haber-1',
        originalUrl: 'https://example.com/haber-1',
        mainImageUrl: 'https://cdn.example.com/news/hero.jpg',
        imageUrls: ['https://cdn.example.com/news/hero.jpg'],
        publishedAt: new Date(),
        fetchedAt: new Date(),
        wordCount: 200,
        charCount: richBody.length,
        extractionConfidence: 0.9,
        city: 'Çanakkale',
        district: null,
        countryCode: 'TR',
      },
    ],
  }
}

describe('P18.2A publishClusterEditorial publication authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('source routes through authorizePublication and has no editorial_ops fallback', () => {
    const src = readFileSync('src/services/editorial/editorialSupplyService.ts', 'utf8')
    expect(src).toMatch(/authorizePublication\(/)
    expect(src).toMatch(/publicationProvenanceFields\(authz\)/)
    expect(src).not.toMatch(/actorUserId\s*\|\|\s*['\"]editorial_ops['\"]/)
    expect(src).toMatch(/HUMAN_EDITOR requires authenticated actor UID/)
    expect(src).not.toMatch(/actorUserId:\s*['\"]ap3scBglLIVwflfZN4qL8PKrM1A3['\"]/)
  })

  it('API entry passes CMS auth.uid as actor', () => {
    const src = readFileSync('src/app/api/admin/editorial/publish-from-cluster/route.ts', 'utf8')
    expect(src).toMatch(/verifyCmsToken\(request,\s*['\"]news:publish['\"]\)/)
    expect(src).toMatch(/actorUserId:\s*auth\.uid/)
  })

  it('missing human actor is blocked before FS/PG writes', async () => {
    const service = new EditorialSupplyService()
    vi.spyOn(service, 'loadClusterCandidates').mockResolvedValue(mockClusterBundle() as never)
    const { newsMirrorRepository } = await import('@/services/publisher/newsMirrorRepository')

    await expect(
      service.publishClusterEditorial({
        clusterId: 'clu_test_1',
      })
    ).rejects.toThrow(/authenticated actor UID|PUBLICATION_AUTHORITY_REJECTED/)

    expect(newsMirrorRepository.ensurePublishedNewsMirror).not.toHaveBeenCalled()
  })

  it('empty actor string is blocked before FS/PG writes', async () => {
    const service = new EditorialSupplyService()
    vi.spyOn(service, 'loadClusterCandidates').mockResolvedValue(mockClusterBundle() as never)
    const { newsMirrorRepository } = await import('@/services/publisher/newsMirrorRepository')

    await expect(
      service.publishClusterEditorial({
        clusterId: 'clu_test_1',
        actorUserId: '   ',
      })
    ).rejects.toThrow(/authenticated actor UID|PUBLICATION_AUTHORITY_REJECTED/)

    expect(newsMirrorRepository.ensurePublishedNewsMirror).not.toHaveBeenCalled()
  })

  it('automation UID is blocked before FS/PG writes', async () => {
    const service = new EditorialSupplyService()
    vi.spyOn(service, 'loadClusterCandidates').mockResolvedValue(mockClusterBundle() as never)
    const { newsMirrorRepository } = await import('@/services/publisher/newsMirrorRepository')
    const admin = await import('@/lib/firebase/admin')
    const setSpy = vi.fn(async () => {
      throw new Error('Firestore write must not run')
    })
    vi.spyOn(admin, 'getAdminFirestore').mockReturnValue({
      collection: () => ({
        doc: () => ({ id: 'x', set: setSpy }),
      }),
    } as never)

    await expect(
      service.publishClusterEditorial({
        clusterId: 'clu_test_1',
        actorUserId: AUTO_UID,
        decision: 'APPROVED',
      })
    ).rejects.toThrow(/PUBLICATION_AUTHORITY_REJECTED|automation|BOT|HUMAN/i)

    expect(newsMirrorRepository.ensurePublishedNewsMirror).not.toHaveBeenCalled()
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('editorial_ops cannot authorize HUMAN_EDITOR', async () => {
    const service = new EditorialSupplyService()
    vi.spyOn(service, 'loadClusterCandidates').mockResolvedValue(mockClusterBundle() as never)
    const { newsMirrorRepository } = await import('@/services/publisher/newsMirrorRepository')

    await expect(
      service.publishClusterEditorial({
        clusterId: 'clu_test_1',
        actorUserId: 'editorial_ops',
        decision: 'APPROVED',
      })
    ).rejects.toThrow(/PUBLICATION_AUTHORITY_REJECTED|automation|system|BOT/i)

    expect(newsMirrorRepository.ensurePublishedNewsMirror).not.toHaveBeenCalled()
  })

  it('system identity cannot authorize HUMAN_EDITOR', async () => {
    const service = new EditorialSupplyService()
    vi.spyOn(service, 'loadClusterCandidates').mockResolvedValue(mockClusterBundle() as never)
    const { newsMirrorRepository } = await import('@/services/publisher/newsMirrorRepository')

    await expect(
      service.publishClusterEditorial({
        clusterId: 'clu_test_1',
        actorUserId: 'system',
        decision: 'APPROVED',
      })
    ).rejects.toThrow(/PUBLICATION_AUTHORITY_REJECTED|system|automation|BOT/i)

    expect(newsMirrorRepository.ensurePublishedNewsMirror).not.toHaveBeenCalled()
  })

  it('seedControlledEditorialInventory requires human actor (no automation seed)', async () => {
    const service = new EditorialSupplyService()
    await expect(service.seedControlledEditorialInventory(1)).rejects.toThrow(
      /authenticated HUMAN_EDITOR actor|PUBLICATION_AUTHORITY_REJECTED/
    )
  })

  it('valid human provenance fields are correct', () => {
    const authz = authorizePublication({
      authority: 'HUMAN_EDITOR',
      actorUid: HUMAN_UID,
      actorDisplayName: 'Editor',
      approvedAt: Date.now(),
      editorialText: richBody,
      sourceText: 'Completely different rewritten editorial summary for low overlap testing path.',
    })
    expect(authz.authority).toBe('HUMAN_EDITOR')
    expect(authz.approvedBy).toBe(HUMAN_UID)
    expect(authz.publishedBy).toBe(HUMAN_UID)
    const fields = publicationProvenanceFields(authz)
    expect(fields.publicationAuthority).toBe('HUMAN_EDITOR')
    expect(fields.approvedBy).toBe(HUMAN_UID)
    expect(fields.publishedBy).toBe(HUMAN_UID)
    expect(typeof fields.approvedAt).toBe('number')
    expect(typeof fields.publishedAt).toBe('number')
  })

  it('HIGH_OVERLAP remains blocked without rights via authorizePublication', () => {
    expect(() =>
      authorizePublication({
        authority: 'HUMAN_EDITOR',
        actorUid: HUMAN_UID,
        editorialText: richBody,
        sourceText: richBody,
      })
    ).toThrow(PublicationAuthorityError)
  })

  it('similarity gate import path remains in publishClusterEditorial', () => {
    const src = readFileSync('src/services/editorial/editorialSupplyService.ts', 'utf8')
    expect(src).toMatch(/validatePublicationRights\(/)
    expect(src).toMatch(/assertHumanEditorialApproval\(/)
  })
})

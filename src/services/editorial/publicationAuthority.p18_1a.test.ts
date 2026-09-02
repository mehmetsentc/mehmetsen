import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import {
  authorizePublication,
  authorizeAfadSystemAlertPublication,
  AFAD_SYSTEM_ALERT_PATH_TOKEN,
  PublicationAuthorityError,
} from '@/services/editorial/publicationAuthority'

describe('P18.1A residual public writer closure', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('client adminNewsService.approve has no updateDoc published fallback', () => {
    const src = readFileSync('src/services/adminNewsService.ts', 'utf8')
    const approveBlock = src.slice(src.indexOf('async approve('), src.indexOf('async reject('))
    expect(approveBlock).toContain("adminFetch(`/api/admin/news/${id}/approve`")
    expect(approveBlock).not.toMatch(/updateDoc\([\s\S]*status:\s*['\"]published['\"]/)
    expect(approveBlock).not.toMatch(/catch\s*\{[\s\S]*updateDoc/)
  })

  it('client createNews/publishNews reject status=published', () => {
    const src = readFileSync('src/services/postService.ts', 'utf8')
    expect(src).toMatch(/client createNews cannot set status=published/)
    expect(src).toMatch(/client publishNews cannot set status=published/)
    expect(src).toMatch(/const status = data\.status \?\? 'pending'/)
  })

  it('client updateAdminNews rejects published transition', () => {
    const src = readFileSync('src/services/adminNewsService.ts', 'utf8')
    expect(src).toMatch(/updateAdminNews cannot set status=published/)
  })

  it('applyReviewToFirestore source never assigns status published', () => {
    const src = readFileSync('src/lib/editorial/aiEditorialReview.ts', 'utf8')
    expect(src).toMatch(/unique_pending_human_publish/)
    expect(src).not.toMatch(/status:\s*['\"]published['\"]/)
    expect(src).toMatch(/does NOT authorize HUMAN_EDITOR or SYSTEM_ALERT/)
  })

  it('applyReviewToFirestore cannot obtain SYSTEM_ALERT or HUMAN_EDITOR via authorizePublication', () => {
    // Background AI has no actor — cannot mint HUMAN_EDITOR
    expect(() =>
      authorizePublication({
        authority: 'HUMAN_EDITOR',
        actorUid: '',
        approvedAt: Date.now(),
      })
    ).toThrow(/PUBLICATION_AUTHORITY_REJECTED/)

    // Direct SYSTEM_ALERT request is rejected
    expect(() =>
      authorizePublication({
        authority: 'SYSTEM_ALERT',
        kind: 'AFAD_EARTHQUAKE',
        sourceIdentity: 'AFAD',
        ingestionSourceId: 'afad',
      } as never)
    ).toThrow(/authorizeAfadSystemAlertPublication/)
  })

  it('generic caller cannot obtain SYSTEM_ALERT; AFAD trusted path still allowed', () => {
    expect(() =>
      authorizeAfadSystemAlertPublication({
        sourceIdentity: 'AFAD',
        ingestionSourceId: 'afad',
        trustedPathToken: 'client-forged',
      })
    ).toThrow(PublicationAuthorityError)

    const ok = authorizeAfadSystemAlertPublication({
      sourceIdentity: 'AFAD',
      ingestionSourceId: 'afad',
      aiGenerated: false,
      trustedPathToken: AFAD_SYSTEM_ALERT_PATH_TOKEN,
    })
    expect(ok.authority).toBe('SYSTEM_ALERT')
  })

  it('automation UID still rejected for HUMAN_EDITOR', () => {
    expect(() =>
      authorizePublication({
        authority: 'HUMAN_EDITOR',
        actorUid: 'ap3scBglLIVwflfZN4qL8PKrM1A3',
        approvedAt: Date.now(),
      })
    ).toThrow(/automation|AUTOMATION|BOT/i)
  })

  it('valid human approval still authorizes publication', () => {
    const authz = authorizePublication({
      authority: 'HUMAN_EDITOR',
      actorUid: 'wG8WTNlW38TILLvpDLsFmt8IMlg1',
      approvedAt: Date.now(),
    })
    expect(authz.authority).toBe('HUMAN_EDITOR')
    expect(authz.approvedBy).toBe('wG8WTNlW38TILLvpDLsFmt8IMlg1')
  })

  it('publisher canonical write requires authorizePublication', () => {
    const src = readFileSync('src/services/publisher/publisherContentPublish.ts', 'utf8')
    expect(src).toMatch(/authorizePublication\(/)
    expect(src).toMatch(/publicationProvenanceFields\(/)
    expect(src).toMatch(/authority:\s*'HUMAN_EDITOR'/)
  })

  it('publishClusterEditorial requires authorizePublication (P18.2A)', () => {
    const src = readFileSync('src/services/editorial/editorialSupplyService.ts', 'utf8')
    expect(src).toMatch(/authorizePublication\(/)
    expect(src).not.toMatch(/actorUserId\s*\|\|\s*['\"]editorial_ops['\"]/)
  })

  it('manual AI remains draft-first (P17.13 needsDraft includes editorApproved)', () => {
    const src = readFileSync('src/services/newsroom/pipeline.ts', 'utf8')
    expect(src).toMatch(/const needsDraft[\s\S]*editorApproved/)
    expect(src).toMatch(/humanPublisher != null/)
  })

  it('event provider normalizeEvent published status is NaEvent not news', () => {
    const src = readFileSync('src/services/eventProviders/shared.ts', 'utf8')
    expect(src).toMatch(/status: 'published'/)
    expect(src).toMatch(/NaEvent/)
    expect(src).not.toMatch(/Collections\.NEWS/)
    expect(src).not.toMatch(/collection\(['\"]news['\"]\)/)
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  authorizePublication,
  authorizeAfadSystemAlertPublication,
  assertTrustedAfadSystemAlert,
  AFAD_SYSTEM_ALERT_PATH_TOKEN,
  PublicationAuthorityError,
  isExactKnownAutomationUid,
  evaluateHumanEditorSimilarity,
} from './publicationAuthority'
import { KNOWN_AUTOMATION_UIDS } from './humanReviewGate'

describe('P18.1 publication authority', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('allows HUMAN_EDITOR with valid Firebase-style UID', () => {
    const authz = authorizePublication({
      authority: 'HUMAN_EDITOR',
      actorUid: 'wG8WTNlW38TILLvpDLsFmt8IMlg1',
      approvedAt: new Date('2026-09-02T12:00:00.000Z'),
    })
    expect(authz.authority).toBe('HUMAN_EDITOR')
    expect(authz.approvedBy).toBe('wG8WTNlW38TILLvpDLsFmt8IMlg1')
    expect(authz.publishedBy).toBe('wG8WTNlW38TILLvpDLsFmt8IMlg1')
    expect(authz.similarity?.evaluated).toBe(false)
  })

  it('blocks missing human actor (fail-closed)', () => {
    expect(() =>
      authorizePublication({
        authority: 'HUMAN_EDITOR',
        actorUid: '',
        approvedAt: Date.now(),
      })
    ).toThrow(/PUBLICATION_AUTHORITY_REJECTED.*non-empty actor/i)

    expect(() => authorizePublication(null)).toThrow(/MISSING_AUTHORITY|explicit publication authority/i)
    expect(() => authorizePublication(undefined)).toThrow(/MISSING_AUTHORITY|explicit publication authority/i)
  })

  it('blocks exact known automation UIDs on HUMAN_EDITOR', () => {
    expect(isExactKnownAutomationUid('ap3scBglLIVwflfZN4qL8PKrM1A3')).toBe(true)
    expect(KNOWN_AUTOMATION_UIDS.has('ap3scBglLIVwflfZN4qL8PKrM1A3')).toBe(true)

    expect(() =>
      authorizePublication({
        authority: 'HUMAN_EDITOR',
        actorUid: 'ap3scBglLIVwflfZN4qL8PKrM1A3',
        approvedAt: Date.now(),
      })
    ).toThrow(/AUTOMATION_UID|BOT_APPROVED|automation/i)
  })

  it('blocks system identity on HUMAN_EDITOR', () => {
    expect(() =>
      authorizePublication({
        authority: 'HUMAN_EDITOR',
        actorUid: 'system',
        approvedAt: Date.now(),
      })
    ).toThrow(/AUTOMATION_UID|SYSTEM_IDENTITY|BOT_APPROVED|automation/i)

    expect(() =>
      authorizePublication({
        authority: 'HUMAN_EDITOR',
        actorUid: 'crawler_bot',
        approvedAt: Date.now(),
      })
    ).toThrow(/AUTOMATION_UID|SYSTEM_IDENTITY|BOT_APPROVED|automation/i)
  })

  it('does not use fuzzy UID case folding for known automation set membership', () => {
    // Exact Firebase UID matching only for Set membership.
    expect(isExactKnownAutomationUid('AP3SCBGLLivWflfZN4qL8PKrM1A3')).toBe(false)
    expect(isExactKnownAutomationUid('ap3scBglLIVwflfZN4qL8PKrM1A3')).toBe(true)
  })

  it('rejects LEGACY authority for new publications', () => {
    expect(() =>
      authorizePublication({
        authority: 'LEGACY',
        reason: 'backfill',
      })
    ).toThrow(/LEGACY authority is not allowed/)
  })

  it('rejects direct SYSTEM_ALERT via authorizePublication', () => {
    expect(() =>
      authorizePublication({
        authority: 'SYSTEM_ALERT',
        kind: 'AFAD_EARTHQUAKE',
        sourceIdentity: 'AFAD',
        ingestionSourceId: 'afad',
      })
    ).toThrow(/must use authorizeAfadSystemAlertPublication/)
  })

  it('AFAD SYSTEM_ALERT works only through trusted path token', () => {
    const authz = authorizeAfadSystemAlertPublication({
      sourceIdentity: 'AFAD',
      ingestionSourceId: 'afad',
      aiGenerated: false,
      trustedPathToken: AFAD_SYSTEM_ALERT_PATH_TOKEN,
    })
    expect(authz.authority).toBe('SYSTEM_ALERT')
    expect(authz.approvedBy).toBe('SYSTEM_ALERT:AFAD_EARTHQUAKE')
  })

  it('arbitrary caller cannot obtain SYSTEM_ALERT', () => {
    expect(() =>
      assertTrustedAfadSystemAlert({
        kind: 'AFAD_EARTHQUAKE',
        sourceIdentity: 'AFAD',
        ingestionSourceId: 'afad',
        trustedPathToken: 'forged-token',
      })
    ).toThrow(/trusted AFAD ingestion path/)

    expect(() =>
      authorizeAfadSystemAlertPublication({
        sourceIdentity: 'AFAD',
        ingestionSourceId: 'afad',
        trustedPathToken: 'please',
      })
    ).toThrow(PublicationAuthorityError)
  })

  it('SYSTEM_ALERT rejects AI-generated payloads', () => {
    expect(() =>
      authorizeAfadSystemAlertPublication({
        sourceIdentity: 'AFAD',
        ingestionSourceId: 'afad',
        aiGenerated: true,
        trustedPathToken: AFAD_SYSTEM_ALERT_PATH_TOKEN,
      })
    ).toThrow(/deterministic non-AI/)
  })

  it('HIGH_OVERLAP blocks HUMAN_EDITOR without rights metadata', () => {
    const source = 'Deprem bölgesinde can kaybı veya hasar bilgisi henüz gelmedi. '.repeat(20)
    expect(() =>
      authorizePublication({
        authority: 'HUMAN_EDITOR',
        actorUid: 'human_editor_uid_456',
        approvedAt: Date.now(),
        editorialText: source,
        sourceText: source,
      })
    ).toThrow(/HIGH_OVERLAP/)
  })

  it('insufficient source context does not fabricate similarity PASS', () => {
    const sim = evaluateHumanEditorSimilarity({
      editorialText: 'Bağımsız editoryal metin örneği burada.',
      sourceText: null,
    })
    expect(sim?.evaluated).toBe(false)
    expect(sim?.limitation).toMatch(/INSUFFICIENT_SOURCE_CONTEXT/)
  })
})

describe('P18.1 approveDraft actor propagation (contract)', () => {
  it('approveDraft signature requires actor argument', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/services/newsDraftService.ts', 'utf8')
    )
    expect(src).toMatch(/async approveDraft\(\s*draftId: string,\s*actor: HumanPublicationActor/)
    expect(src).toMatch(/authorizePublication\(/)
    expect(src).toMatch(/publicationProvenanceFields\(/)
    expect(src).toMatch(/publishFromPipeline[\s\S]*actor\?: HumanPublicationActor/)
  })

  it('flush-pending cannot invent human approval without auth.uid', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/app/api/admin/newsroom/flush-pending/route.ts', 'utf8')
    )
    expect(src).toMatch(/cannot invent HUMAN_EDITOR actor/)
    expect(src).toMatch(/approveDraft\(doc\.id, \{ uid: auth\.uid \}/)
  })

  it('bulk approve preserves human actor per publication', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/app/api/admin/news-drafts/bulk-approve/route.ts', 'utf8')
    )
    expect(src).toMatch(/approveDraft\(doc\.id, \{ uid: admin\.uid \}/)
  })
})

describe('P18.1 AFAD classification', () => {
  it('afadWorker uses SYSTEM_ALERT trusted path, not HUMAN_EDITOR', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/services/newsroom/afadWorker.ts', 'utf8')
    )
    expect(src).toMatch(/authorizeAfadSystemAlertPublication/)
    expect(src).toMatch(/AFAD_SYSTEM_ALERT_PATH_TOKEN/)
    expect(src).not.toMatch(/authority:\s*'HUMAN_EDITOR'/)
  })
})

describe('P18.1 pipeline cannot auto-publish without authority', () => {
  it('canAutoPublish requires humanPublisher', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/services/newsroom/pipeline.ts', 'utf8')
    )
    expect(src).toMatch(/humanPublisher != null/)
    expect(src).toMatch(/publicationActorUid/)
    expect(src).toMatch(/actor: humanPublisher/)
  })
})

describe('P18.1 AI editorial review no longer auto-publishes', () => {
  it('applyReviewToFirestore does not set status published', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/lib/editorial/aiEditorialReview.ts', 'utf8')
    )
    expect(src).toMatch(/unique_pending_human_publish/)
    expect(src).toMatch(/never write status published from AI review/)
    expect(src).not.toMatch(/status:\s*'published',\s*\n\s*publishedAt/)
  })
})

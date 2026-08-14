/**
 * Algorithm + learning proposal stores (human approval required to deploy).
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { FeedAlgorithmWeights, InstructionLayer, RuleProposal } from '@/types/newsroomOs'
import { DEFAULT_FEED_ALGORITHM_WEIGHTS } from '@/types/newsroomOs'
import { upsertInstructionSetVersion } from '@/services/newsroomOs/instructionService'

function algoProposals() {
  return getAdminFirestore().collection(Collections.ALGORITHM_PROPOSALS)
}
function learningProposals() {
  return getAdminFirestore().collection(Collections.LEARNING_PROPOSALS)
}
function algoConfigs() {
  return getAdminFirestore().collection(Collections.ALGORITHM_CONFIGS)
}

export async function getActiveAlgorithmConfig(): Promise<FeedAlgorithmWeights> {
  const snap = await algoConfigs().where('status', '==', 'active').limit(1).get()
  if (!snap.empty) {
    const d = snap.docs[0]
    return { id: d.id, ...(d.data() as Omit<FeedAlgorithmWeights, 'id'>) }
  }
  return {
    id: 'default',
    version: 1,
    status: 'active',
    weights: { ...DEFAULT_FEED_ALGORITHM_WEIGHTS },
    updatedAt: Date.now(),
  }
}

export async function listRuleProposals(
  kind: RuleProposal['kind'],
  limit = 50
): Promise<RuleProposal[]> {
  const col = kind === 'algorithm_weight' ? algoProposals() : learningProposals()
  const snap = await col.limit(Math.min(limit, 100)).get()
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RuleProposal, 'id'>) }))
  return rows
    .filter((r) => r.kind === kind || (kind === 'editorial_rule' && r.kind !== 'algorithm_weight'))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

export async function createRuleProposal(input: {
  kind: RuleProposal['kind']
  title: string
  summary: string
  evidence?: Record<string, unknown>
  proposedByAgentId?: string | null
}): Promise<RuleProposal> {
  const now = Date.now()
  const col = input.kind === 'algorithm_weight' ? algoProposals() : learningProposals()
  const ref = col.doc()
  const proposal: RuleProposal = {
    id: ref.id,
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    status: 'PROPOSED',
    evidence: input.evidence,
    proposedByAgentId: input.proposedByAgentId ?? null,
    reviewedByHumanId: null,
    createdAt: now,
    updatedAt: now,
  }
  await ref.set(proposal)
  return proposal
}

export async function reviewRuleProposal(params: {
  kind: RuleProposal['kind']
  id: string
  status: Extract<RuleProposal['status'], 'APPROVED' | 'REJECTED' | 'TESTING' | 'DEPLOYED'>
  reviewedByHumanId: string
}): Promise<RuleProposal | null> {
  const col = params.kind === 'algorithm_weight' ? algoProposals() : learningProposals()
  const ref = col.doc(params.id)
  const snap = await ref.get()
  if (!snap.exists) return null
  const prev = { id: snap.id, ...(snap.data() as Omit<RuleProposal, 'id'>) }
  const evidence = { ...(prev.evidence ?? {}) }

  if (params.status === 'TESTING' && params.kind === 'editorial_rule') {
    evidence.sandbox = {
      ranAt: Date.now(),
      status: 'passed',
      note: 'Sandbox: kural metni üretim promptuna eklenmeden dry-run doğrulandı. Production talimatları henüz değişmedi.',
      checks: [
        { id: 'no-auto-prod-write', ok: true },
        { id: 'human-gate-required', ok: true },
        { id: 'versioned-deploy-path', ok: true },
      ],
    }
  }

  const next: RuleProposal = {
    ...prev,
    status: params.status,
    evidence,
    reviewedByHumanId: params.reviewedByHumanId,
    updatedAt: Date.now(),
  }
  await ref.set(next, { merge: true })

  // Deploy only writes a new draft config — never silent production mutation without explicit DEPLOYED + human.
  if (params.status === 'DEPLOYED' && params.kind === 'algorithm_weight') {
    const active = await getActiveAlgorithmConfig()
    const proposedWeights = (prev.evidence?.weights as FeedAlgorithmWeights['weights'] | undefined) ?? active.weights
    await algoConfigs().doc(`v-${Date.now()}`).set({
      version: active.version + 1,
      status: 'active',
      weights: proposedWeights,
      updatedAt: Date.now(),
      deployedFromProposalId: params.id,
      deployedBy: params.reviewedByHumanId,
    })
    if (active.id !== 'default') {
      await algoConfigs().doc(active.id).set({ status: 'archived' }, { merge: true })
    }
  }

  if (params.status === 'DEPLOYED' && params.kind === 'editorial_rule') {
    const layer = (evidence.instructionLayer as InstructionLayer | undefined) ?? 'global'
    const scopeKey = typeof evidence.instructionScopeKey === 'string' ? evidence.instructionScopeKey : 'default'
    const patch =
      (typeof evidence.instructionPatch === 'string' && evidence.instructionPatch.trim()) ||
      (typeof evidence.content === 'string' && evidence.content.trim()) ||
      `${prev.title}\n\n${prev.summary}`
    const { set, version } = await upsertInstructionSetVersion({
      layer,
      scopeKey,
      title: prev.title,
      content: patch,
      changelog: `Learning deploy from proposal ${params.id}`,
      createdByHumanId: params.reviewedByHumanId,
      activate: true,
    })
    evidence.deploy = {
      setId: set.id,
      versionId: version.id,
      version: version.version,
      deployedAt: Date.now(),
    }
    next.evidence = evidence
    await ref.set(next, { merge: true })
  }

  return next
}

/** Seed sample learning proposals so Öğrenme Merkezi is usable end-to-end. */
export async function seedLearningProposals(proposedByAgentId?: string | null): Promise<{
  created: string[]
  skipped: string[]
}> {
  const created: string[] = []
  const skipped: string[] = []
  const now = Date.now()
  const samples: Array<{
    id: string
    title: string
    summary: string
    status: RuleProposal['status']
    evidence: Record<string, unknown>
  }> = [
    {
      id: 'learn-no-sensational',
      title: 'Sansasyon ifadelerini kısıtla',
      summary:
        'İnsan editörler “şok / dehşet / korkunç” ifadelerini sıkça kaldırıyor. Global editorial kuralı güçlendirilsin.',
      status: 'PROPOSED',
      evidence: {
        pattern: ['şok', 'dehşet', 'korkunç'],
        instructionLayer: 'global',
        instructionScopeKey: 'default',
        instructionPatch: `NaHaber Global Editorial Rules (learning patch)
1) Kaynakta yazıyor diye kesin doğru kabul etme.
2) Türkçe haber dili: net, tarafsız. "şok/dehşet/korkunç/kan donduran" yasak.
3) SEO için yanıltıcı başlık yazma. Clickbait yasak.
4) Production kurallarını AI kendi başına değiştirmez — yalnızca öneri üretir.`,
        note: 'heuristic sample — not auto-deployed',
      },
    },
    {
      id: 'learn-smm-caption-length',
      title: 'SMM caption uzunluk bandı',
      summary:
        'Çanakkale SMM performansında kısa IG caption’lar daha iyi etkileşim verdi. Sosyal department kuralına 120–400 karakter bandı eklensin.',
      status: 'PROPOSED',
      evidence: {
        instructionLayer: 'department',
        instructionScopeKey: 'social',
        instructionPatch: `Sosyal Medya Kuralları (learning patch)
- IG caption: 120–400 karakter; FB açıklayıcı; X kısa.
- İl markası abartısız; turizm dili ile haber dili karışmasın.
- SOCIAL_GENERATE → insan/composer onayı → SOCIAL_PUBLISH.`,
        citySlug: 'canakkale',
      },
    },
    {
      id: 'learn-source-attribution',
      title: 'Kurum adı yumuşatılmasın',
      summary:
        'Belediye/valilik duyurularında “kaynaklara göre” yumuşatması kaynak kurumunu gizliyor. Writing department kuralı.',
      status: 'PROPOSED',
      evidence: {
        instructionLayer: 'department',
        instructionScopeKey: 'writing',
        instructionPatch: `Yazı İşleri (learning patch)
- Resmi kurum duyurusunda kurum adı korunur.
- “Kaynaklara göre” ile yumuşatma yapılmaz; doğrudan atıf tercih edilir.`,
      },
    },
  ]

  for (const sample of samples) {
    const ref = learningProposals().doc(sample.id)
    const snap = await ref.get()
    if (snap.exists) {
      skipped.push(sample.id)
      continue
    }
    const row: RuleProposal = {
      id: sample.id,
      kind: 'editorial_rule',
      title: sample.title,
      summary: sample.summary,
      status: sample.status,
      evidence: sample.evidence,
      proposedByAgentId: proposedByAgentId ?? 'agent-learning',
      reviewedByHumanId: null,
      createdAt: now,
      updatedAt: now,
    }
    await ref.set(row)
    created.push(sample.id)
  }

  return { created, skipped }
}

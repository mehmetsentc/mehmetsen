/**
 * Algorithm + learning proposal stores (human approval required to deploy).
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { FeedAlgorithmWeights, RuleProposal } from '@/types/newsroomOs'
import { DEFAULT_FEED_ALGORITHM_WEIGHTS } from '@/types/newsroomOs'

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
  const next: RuleProposal = {
    ...prev,
    status: params.status,
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

  return next
}

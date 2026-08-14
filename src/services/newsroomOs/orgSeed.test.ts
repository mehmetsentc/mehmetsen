import { describe, expect, it } from 'vitest'
import { ORG_SEED_SPECS, specToAgent } from '@/services/newsroomOs/orgSeed'
import { buildOrgTree } from '@/services/newsroomOs/agentService'

describe('newsroom org seed', () => {
  it('has a single root EIC', () => {
    const roots = ORG_SEED_SPECS.filter((s) => s.managerAgentId == null)
    expect(roots).toHaveLength(1)
    expect(roots[0]?.id).toBe('agent-eic')
  })

  it('builds a connected tree from specs', () => {
    const agents = ORG_SEED_SPECS.map((s) => specToAgent(s))
    const tree = buildOrgTree(agents)
    expect(tree[0]?.agent.id).toBe('agent-eic')
    expect(tree.some((n) => n.agent.id === 'agent-social-director')).toBe(true)
    expect(tree.some((n) => n.agent.id === 'agent-fact-check')).toBe(true)
    // every non-root has a manager present in the set
    const ids = new Set(agents.map((a) => a.id))
    for (const a of agents) {
      if (!a.managerAgentId) continue
      expect(ids.has(a.managerAgentId)).toBe(true)
    }
  })

  it('learning agent stays autonomy 0', () => {
    const learning = ORG_SEED_SPECS.find((s) => s.id === 'agent-learning')
    expect(learning?.autonomyLevel).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { ORG_SEED_SPECS } from '@/services/newsroomOs/orgSeed'

describe('agent task bus contracts', () => {
  it('fact-check agent exists in org seed for task routing', () => {
    expect(ORG_SEED_SPECS.some((s) => s.id === 'agent-fact-check')).toBe(true)
  })

  it('social director can manage SMM network seed target', () => {
    const social = ORG_SEED_SPECS.find((s) => s.id === 'agent-social-director')
    expect(social?.roleTemplateId).toBe('social-director')
    expect(social?.managerAgentId).toBe('agent-digital-director')
  })
})

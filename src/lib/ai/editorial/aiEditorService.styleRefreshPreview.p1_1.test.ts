import { describe, expect, it, vi } from 'vitest'

/**
 * AI STYLE P1.1 — Task 12
 * previewStyleRefreshFromSeed() must be strictly READ-ONLY: it must never call
 * setPromptVersion / updateAiEditor (no writes), and must correctly classify
 * changed / unchanged / manual-customization-risk from the current active prompt.
 *
 * We fake Firestore at the @/lib/firebase/admin boundary (same pattern used by
 * other services in this repo) with a tiny in-memory query engine, seed exactly
 * two known editors (one national, one city), and leave every other seeded slug
 * unresolvable so they exercise the `missingEditors` path.
 */

type FakeEditorDoc = { id: string; slug: string; [k: string]: unknown }
type FakePromptDoc = {
  id: string
  editorId: string
  promptType: string
  isActive: boolean
  content: string
  version: number
  changeReason: string | null
}

const editors: FakeEditorDoc[] = [
  { id: 'ed_selin', slug: 'selin-aras' },
]
const prompts: FakePromptDoc[] = [
  {
    id: 'p1',
    editorId: 'ed_selin',
    promptType: 'core',
    isActive: true,
    content: 'UNCHANGED CONTENT MATCHING SEED', // will be overwritten to match real seed below
    version: 3,
    changeReason: 'refreshStylePromptsFromSeed',
  },
  {
    id: 'p2',
    editorId: 'ed_selin',
    promptType: 'news',
    isActive: true,
    content: 'Admin manually rewrote this news style prompt by hand.',
    version: 5,
    changeReason: 'Admin karakter/tarz paneli',
  },
]

const writeCalls: unknown[] = []

vi.mock('@/lib/firebase/admin', () => ({
  Collections: undefined, // overridden by real module below via importOriginal in collections import path
  getAdminFirestore: () => ({
    collection: (name: string) => ({
      where: (field: string, _op: string, value: unknown) => {
        const filters: Record<string, unknown> = { [field]: value }
        const builder = {
          where: (f2: string, _op2: string, v2: unknown) => {
            filters[f2] = v2
            return builder
          },
          limit: () => builder,
          get: async () => {
            let docs: Array<FakeEditorDoc | FakePromptDoc> = []
            if (name === 'aiEditors') {
              docs = editors.filter((e) => e.slug === filters.slug)
            } else if (name === 'aiEditorPrompts') {
              docs = prompts.filter(
                (p) =>
                  p.editorId === filters.editorId &&
                  p.promptType === filters.promptType &&
                  p.isActive === filters.isActive
              )
            }
            return {
              empty: docs.length === 0,
              docs: docs.map((d) => ({ id: d.id, data: () => d })),
            }
          },
        }
        return builder
      },
      doc: (id: string) => ({
        id,
        set: vi.fn(async (data: unknown) => {
          writeCalls.push({ op: 'set', collection: name, id, data })
        }),
        update: vi.fn(async (data: unknown) => {
          writeCalls.push({ op: 'update', collection: name, id, data })
        }),
      }),
    }),
    batch: () => ({
      set: (...args: unknown[]) => writeCalls.push({ op: 'batch.set', args }),
      update: (...args: unknown[]) => writeCalls.push({ op: 'batch.update', args }),
      commit: vi.fn(async () => {
        writeCalls.push({ op: 'batch.commit' })
      }),
    }),
  }),
}))

vi.mock('@/lib/firebase/collections', () => ({
  Collections: { AI_EDITORS: 'aiEditors', AI_EDITOR_PROMPTS: 'aiEditorPrompts' },
}))

import { previewStyleRefreshFromSeed } from './aiEditorService'
import { SEED_AI_EDITORS } from './seedEditors'

describe('AI STYLE P1.1 — previewStyleRefreshFromSeed (Task 12 dry-run)', () => {
  it('is strictly read-only: never issues a Firestore write', async () => {
    // Make the mocked "core" prompt match what the real seed spec would propose,
    // so this entry reports changed=false and we can prove no write happened either way.
    const selinSpec = SEED_AI_EDITORS.find((s) => s.slug === 'selin-aras')!
    prompts[0]!.content = selinSpec.prompts.core!.trim()

    await previewStyleRefreshFromSeed()
    expect(writeCalls.length).toBe(0)
  })

  it('flags a manually-customized prompt (changeReason from the admin panel) as at-risk', async () => {
    const result = await previewStyleRefreshFromSeed()
    const newsEntry = result.entries.find(
      (e) => e.editorSlug === 'selin-aras' && e.promptType === 'news'
    )
    expect(newsEntry).toBeDefined()
    expect(newsEntry!.changed).toBe(true)
    expect(newsEntry!.manualCustomizationRisk).toBe(true)
    expect(newsEntry!.manualCustomizationReason).toBe('Admin karakter/tarz paneli')
  })

  it('does NOT flag a prompt whose active version came from a prior seed/refresh as at-risk', async () => {
    const selinSpec = SEED_AI_EDITORS.find((s) => s.slug === 'selin-aras')!
    prompts[0]!.content = selinSpec.prompts.core!.trim()
    prompts[0]!.changeReason = 'refreshStylePromptsFromSeed'

    const result = await previewStyleRefreshFromSeed()
    const coreEntry = result.entries.find(
      (e) => e.editorSlug === 'selin-aras' && e.promptType === 'core'
    )
    expect(coreEntry).toBeDefined()
    expect(coreEntry!.changed).toBe(false)
    expect(coreEntry!.manualCustomizationRisk).toBe(false)
  })

  it('reports every seed slug with no matching Firestore doc under missingEditors', async () => {
    const result = await previewStyleRefreshFromSeed()
    // Only 'selin-aras' exists in our fake DB; every other one of the 104+ seed
    // specs (23 national + 81 city) must land in missingEditors, not throw.
    expect(result.missingEditors.length).toBeGreaterThan(90)
    expect(result.missingEditors).not.toContain('selin-aras')
  })
})

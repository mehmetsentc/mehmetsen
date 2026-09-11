import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import {
  CAT1B_ACTION_ORDER,
  CAT1B_EXPECTED_OLD,
  CAT1B_INSERT_IDS,
  CAT1B_TARGETS,
  CAT1B_TARGET_IDS,
  CAT1B_WRITABLE_TABLES,
  assertPostconditions,
  classifyCat1b,
  mutationWriteTables,
  rowsEqual,
  type CategoryRow,
} from './cat1bGuardedMigration'

function productionOldState(): CategoryRow[] {
  return [
    CAT1B_EXPECTED_OLD.kultur,
    CAT1B_EXPECTED_OLD.moda,
    CAT1B_EXPECTED_OLD.dekorasyon,
    CAT1B_EXPECTED_OLD.iliskiler,
    CAT1B_EXPECTED_OLD.konser,
    CAT1B_EXPECTED_OLD.magazin,
    { id: 'yasam', name: 'Yaşam', slug: 'yasam', parent_id: null, icon_name: 'leaf', color: '#16A34A', is_standalone: false },
  ]
}

function fullyMigrated(): CategoryRow[] {
  return [
    ...Object.values(CAT1B_TARGETS),
    { id: 'yasam', name: 'Yaşam', slug: 'yasam', parent_id: null, icon_name: 'leaf', color: '#16A34A', is_standalone: false },
  ]
}

describe('CAT-1B guarded migration planner', () => {
  it('pins targets to committed DEFAULT_CATEGORIES', () => {
    for (const id of CAT1B_TARGET_IDS) {
      const def = DEFAULT_CATEGORIES.find((c) => c.id === id)
      expect(def, id).toBeTruthy()
      expect(def!.name).toBe(CAT1B_TARGETS[id as keyof typeof CAT1B_TARGETS].name)
      expect(def!.slug).toBe(CAT1B_TARGETS[id as keyof typeof CAT1B_TARGETS].slug)
      expect(def!.iconName).toBe(CAT1B_TARGETS[id as keyof typeof CAT1B_TARGETS].icon_name)
      expect(def!.color).toBe(CAT1B_TARGETS[id as keyof typeof CAT1B_TARGETS].color)
      expect(def!.parentId ?? null).toBe(CAT1B_TARGETS[id as keyof typeof CAT1B_TARGETS].parent_id)
      expect(Boolean(def!.standalone)).toBe(false)
    }
  })

  it('classifies verified production old state as EXPECTED_OLD / MISSING / ALREADY_TARGET', () => {
    const plan = classifyCat1b(productionOldState())
    expect(plan.ok).toBe(true)
    expect(plan.blocked).toBe(false)
    expect(plan.classifications.kultur).toBe('EXPECTED_OLD')
    expect(plan.classifications.moda).toBe('EXPECTED_OLD')
    expect(plan.classifications.dekorasyon).toBe('EXPECTED_OLD')
    expect(plan.classifications.iliskiler).toBe('EXPECTED_OLD')
    expect(plan.classifications.konser).toBe('EXPECTED_OLD')
    expect(plan.classifications.magazin).toBe('ALREADY_TARGET')
    expect(plan.classifications.muzik).toBe('MISSING_EXPECTED_NEW')
    expect(plan.classifications['sanatci-haberleri']).toBe('MISSING_EXPECTED_NEW')
    expect(plan.classifications['dizi-tv']).toBe('MISSING_EXPECTED_NEW')
    expect(plan.classifications.influencer).toBe('MISSING_EXPECTED_NEW')
    expect(plan.steps.find((s) => s.id === 'magazin')?.action).toBe('NO_OP')
    expect(plan.steps.filter((s) => s.action === 'INSERT_GUARDED').map((s) => s.id)).toEqual([
      ...CAT1B_INSERT_IDS,
    ])
    expect(plan.steps.filter((s) => s.action === 'UPDATE_GUARDED').map((s) => s.id)).toEqual([
      'kultur',
      'moda',
      'dekorasyon',
      'iliskiler',
      'konser',
    ])
  })

  it('orders muzik insert before children and konser parent update', () => {
    const plan = classifyCat1b(productionOldState())
    const ids = plan.mutations.map((m) => (m.kind === 'insert' ? m.row.id : m.id))
    expect(ids.indexOf('muzik')).toBeLessThan(ids.indexOf('sanatci-haberleri'))
    expect(ids.indexOf('muzik')).toBeLessThan(ids.indexOf('konser'))
    expect(CAT1B_ACTION_ORDER.indexOf('muzik')).toBeLessThan(
      CAT1B_ACTION_ORDER.indexOf('sanatci-haberleri')
    )
    expect(CAT1B_ACTION_ORDER.indexOf('muzik')).toBeLessThan(CAT1B_ACTION_ORDER.indexOf('konser'))
    expect(CAT1B_ACTION_ORDER.indexOf('dizi-tv')).toBeLessThan(CAT1B_ACTION_ORDER.indexOf('konser'))
    expect(CAT1B_ACTION_ORDER.indexOf('influencer')).toBeLessThan(
      CAT1B_ACTION_ORDER.indexOf('konser')
    )
  })

  it('is a no-op when already fully migrated (idempotent run 2)', () => {
    const plan = classifyCat1b(fullyMigrated())
    expect(plan.ok).toBe(true)
    expect(plan.mutations).toEqual([])
    expect(plan.steps.every((s) => s.action === 'NO_OP')).toBe(true)
    expect(assertPostconditions(fullyMigrated())).toEqual([])
  })

  it('handles partial target: already-inserted muzik + remaining old names', () => {
    const rows = [...productionOldState(), CAT1B_TARGETS.muzik]
    const plan = classifyCat1b(rows)
    expect(plan.ok).toBe(true)
    expect(plan.classifications.muzik).toBe('ALREADY_TARGET')
    expect(plan.classifications.konser).toBe('EXPECTED_OLD')
    expect(plan.mutations.some((m) => m.kind === 'insert' && m.row.id === 'muzik')).toBe(false)
    expect(plan.mutations.some((m) => m.kind === 'insert' && m.row.id === 'influencer')).toBe(true)
    expect(plan.mutations.some((m) => m.kind === 'update' && m.id === 'konser')).toBe(true)
  })

  it('aborts on slug collision (different id owning target slug)', () => {
    const rows = [
      ...productionOldState(),
      {
        id: 'other-music',
        name: 'Other',
        slug: 'muzik',
        parent_id: null,
        icon_name: 'music-2',
        color: '#D946EF',
        is_standalone: false,
      },
    ]
    const plan = classifyCat1b(rows)
    expect(plan.ok).toBe(false)
    expect(plan.blocked).toBe(true)
    expect(plan.classifications.muzik).toBe('UNEXPECTED')
    expect(plan.mutations).toEqual([])
    expect(plan.steps.every((s) => s.action === 'ABORT')).toBe(true)
  })

  it('aborts on unexpected parent for konser', () => {
    const rows = productionOldState().map((r) =>
      r.id === 'konser' ? { ...r, parent_id: 'yasam' } : r
    )
    const plan = classifyCat1b(rows)
    expect(plan.ok).toBe(false)
    expect(plan.classifications.konser).toBe('UNEXPECTED')
    expect(plan.mutations).toEqual([])
  })

  it('aborts on unexpected renamed value that is not the CAT-1B target', () => {
    const rows = productionOldState().map((r) =>
      r.id === 'kultur' ? { ...r, name: 'Kültür Sanat' } : r
    )
    const plan = classifyCat1b(rows)
    expect(plan.ok).toBe(false)
    expect(plan.classifications.kultur).toBe('UNEXPECTED')
    expect(plan.mutations).toEqual([])
  })

  it('aborts if magazin anchor is missing or drifted', () => {
    const missing = productionOldState().filter((r) => r.id !== 'magazin')
    expect(classifyCat1b(missing).ok).toBe(false)
    const drifted = productionOldState().map((r) =>
      r.id === 'magazin' ? { ...r, name: 'Magazine' } : r
    )
    expect(classifyCat1b(drifted).classifications.magazin).toBe('UNEXPECTED')
  })

  it('aborts if an existing-update target is missing', () => {
    const rows = productionOldState().filter((r) => r.id !== 'konser')
    const plan = classifyCat1b(rows)
    expect(plan.ok).toBe(false)
    expect(plan.classifications.konser).toBe('UNEXPECTED')
  })

  it('aborts if insert id exists with unexpected metadata', () => {
    const rows = [
      ...productionOldState(),
      { ...CAT1B_TARGETS.muzik, name: 'Music' },
    ]
    const plan = classifyCat1b(rows)
    expect(plan.ok).toBe(false)
    expect(plan.classifications.muzik).toBe('UNEXPECTED')
  })

  it('proves write scope is categories only', () => {
    const plan = classifyCat1b(productionOldState())
    expect(mutationWriteTables(plan.mutations)).toEqual(['categories'])
    expect(CAT1B_WRITABLE_TABLES).toEqual(['categories'])
    expect(plan.mutations.every((m) => m.table === 'categories')).toBe(true)
  })

  it('postconditions pass only when every target is exact', () => {
    expect(assertPostconditions(productionOldState()).length).toBeGreaterThan(0)
    expect(assertPostconditions(fullyMigrated())).toEqual([])
  })

  it('rowsEqual is exact and does not treat unexpected rename as old or target', () => {
    expect(rowsEqual(CAT1B_EXPECTED_OLD.kultur, CAT1B_TARGETS.kultur)).toBe(false)
    expect(rowsEqual(CAT1B_TARGETS.magazin, CAT1B_EXPECTED_OLD.magazin)).toBe(true)
  })
})

describe('CAT-1B apply-script write-scope static audit', () => {
  it('apply script mutates only categories and requires explicit --apply', () => {
    const applyPath = resolve(process.cwd(), 'scripts/apply-cat-1b-categories-guarded.mts')
    const src = readFileSync(applyPath, 'utf8')
    expect(src).toContain("process.argv.includes('--apply')")
    expect(src).toMatch(/sql\.transaction/)

    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

    const writeRe =
      /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi
    const tables = new Set<string>()
    let m: RegExpExecArray | null
    while ((m = writeRe.exec(stripped))) {
      tables.add(m[2].toLowerCase())
    }
    expect([...tables]).toEqual(['categories'])
    expect(stripped).not.toMatch(/\b(TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE)\b/i)
    expect(stripped).not.toMatch(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+news\b/i)
    expect(stripped).not.toMatch(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+news_categories\b/i)
    expect(stripped).not.toMatch(/\braw_articles\b/)
  })
})

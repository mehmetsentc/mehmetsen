/**
 * CAT-1B guarded categories-only migration planner.
 *
 * Pure classification + planned-action logic. No DB I/O.
 * Values are pinned to the committed CAT-1B registry/seed
 * (fd27068 / DEFAULT_CATEGORIES + SEED_CATEGORIES).
 */

export const CAT1B_WRITABLE_TABLES = ['categories'] as const

export type CategoryRow = {
  id: string
  name: string
  slug: string
  parent_id: string | null
  icon_name: string | null
  color: string | null
  is_standalone: boolean
}

export type Classification =
  | 'EXPECTED_OLD'
  | 'ALREADY_TARGET'
  | 'MISSING_EXPECTED_NEW'
  | 'UNEXPECTED'

export type PlannedAction = 'INSERT_GUARDED' | 'UPDATE_GUARDED' | 'NO_OP' | 'ABORT'

export type PlannedStep = {
  id: string
  classification: Classification
  action: PlannedAction
  detail: string
}

export type CategoryMutation =
  | { kind: 'insert'; table: 'categories'; row: CategoryRow }
  | { kind: 'update'; table: 'categories'; id: string; expectedOld: CategoryRow; target: CategoryRow }

const row = (
  id: string,
  name: string,
  slug: string,
  parent_id: string | null,
  icon_name: string,
  color: string,
  is_standalone = false
): CategoryRow => ({
  id,
  name,
  slug,
  parent_id,
  icon_name,
  color,
  is_standalone,
})

/** Pinned CAT-1B targets (must match DEFAULT_CATEGORIES / SEED_CATEGORIES). */
export const CAT1B_TARGETS = {
  kultur: row('kultur', 'Kültür & Sanat', 'kultur', null, 'palette', '#8B5CF6'),
  moda: row('moda', 'Moda & Güzellik', 'moda', 'yasam', 'shirt', '#DB2777'),
  dekorasyon: row('dekorasyon', 'Ev & Yaşam', 'dekorasyon', 'yasam', 'sofa', '#C2410C'),
  iliskiler: row('iliskiler', 'Aile & İlişkiler', 'iliskiler', 'yasam', 'heart-handshake', '#E11D48'),
  magazin: row('magazin', 'Magazin', 'magazin', null, 'star', '#F472B6'),
  muzik: row('muzik', 'Müzik', 'muzik', null, 'music-2', '#D946EF'),
  konser: row('konser', 'Konser', 'konser', 'muzik', 'music', '#8B5CF6'),
  'sanatci-haberleri': row(
    'sanatci-haberleri',
    'Sanatçı Haberleri',
    'sanatci-haberleri',
    'muzik',
    'mic-2',
    '#D946EF'
  ),
  'dizi-tv': row('dizi-tv', 'Dizi & TV', 'dizi-tv', 'kultur', 'tv', '#8B5CF6'),
  influencer: row('influencer', 'Influencer', 'influencer', 'magazin', 'star', '#F472B6'),
} as const

/** Verified production pre-CAT state (SEC-CAT-1B-DB-LIVE-AUDIT). */
export const CAT1B_EXPECTED_OLD = {
  kultur: row('kultur', 'Kültür', 'kultur', null, 'palette', '#8B5CF6'),
  moda: row('moda', 'Moda', 'moda', 'yasam', 'shirt', '#DB2777'),
  dekorasyon: row('dekorasyon', 'Dekorasyon', 'dekorasyon', 'yasam', 'sofa', '#C2410C'),
  iliskiler: row('iliskiler', 'İlişkiler', 'iliskiler', 'yasam', 'heart-handshake', '#E11D48'),
  konser: row('konser', 'Konser', 'konser', 'kultur', 'music', '#8B5CF6'),
  magazin: CAT1B_TARGETS.magazin,
} as const

export const CAT1B_TARGET_IDS = Object.keys(CAT1B_TARGETS)

export const CAT1B_INSERT_IDS = [
  'muzik',
  'sanatci-haberleri',
  'dizi-tv',
  'influencer',
] as const

export const CAT1B_UPDATE_IDS = [
  'kultur',
  'moda',
  'dekorasyon',
  'iliskiler',
  'konser',
] as const

/** Parent-before-child apply order. */
export const CAT1B_ACTION_ORDER = [
  'muzik',
  'sanatci-haberleri',
  'dizi-tv',
  'influencer',
  'kultur',
  'moda',
  'dekorasyon',
  'iliskiler',
  'konser',
  'magazin',
] as const

export function rowsEqual(a: CategoryRow, b: CategoryRow): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.slug === b.slug &&
    a.parent_id === b.parent_id &&
    a.icon_name === b.icon_name &&
    a.color === b.color &&
    a.is_standalone === b.is_standalone
  )
}

function indexRows(rows: CategoryRow[]) {
  const byId = new Map<string, CategoryRow>()
  const bySlug = new Map<string, CategoryRow>()
  for (const r of rows) {
    byId.set(r.id, r)
    bySlug.set(r.slug, r)
  }
  return { byId, bySlug }
}

function classifyInsert(
  id: (typeof CAT1B_INSERT_IDS)[number],
  byId: Map<string, CategoryRow>,
  bySlug: Map<string, CategoryRow>
): Classification {
  const target = CAT1B_TARGETS[id]
  const foundId = byId.get(id)
  const foundSlug = bySlug.get(target.slug)
  if (!foundId && !foundSlug) return 'MISSING_EXPECTED_NEW'
  if (foundId && foundSlug && foundSlug.id !== id) return 'UNEXPECTED'
  if (foundSlug && foundSlug.id !== id) return 'UNEXPECTED'
  if (foundId && rowsEqual(foundId, target)) return 'ALREADY_TARGET'
  return 'UNEXPECTED'
}

function classifyExisting(
  id: keyof typeof CAT1B_EXPECTED_OLD,
  byId: Map<string, CategoryRow>
): Classification {
  const found = byId.get(id)
  if (!found) return 'UNEXPECTED'
  const target = CAT1B_TARGETS[id]
  const old = CAT1B_EXPECTED_OLD[id]
  if (rowsEqual(found, target)) return 'ALREADY_TARGET'
  if (rowsEqual(found, old)) return 'EXPECTED_OLD'
  return 'UNEXPECTED'
}

function actionFor(id: string, classification: Classification): PlannedAction {
  if (classification === 'UNEXPECTED') return 'ABORT'
  if (classification === 'ALREADY_TARGET') return 'NO_OP'
  if (classification === 'MISSING_EXPECTED_NEW') return 'INSERT_GUARDED'
  if (classification === 'EXPECTED_OLD') return 'UPDATE_GUARDED'
  return 'ABORT'
}

export type Cat1bPreflight = {
  ok: boolean
  blocked: boolean
  classifications: Record<string, Classification>
  steps: PlannedStep[]
  mutations: CategoryMutation[]
  blockers: string[]
}

export function classifyCat1b(rows: CategoryRow[]): Cat1bPreflight {
  const { byId, bySlug } = indexRows(rows)
  const classifications: Record<string, Classification> = {}
  const blockers: string[] = []

  for (const id of CAT1B_INSERT_IDS) {
    classifications[id] = classifyInsert(id, byId, bySlug)
    if (classifications[id] === 'UNEXPECTED') {
      const foundId = byId.get(id)
      const foundSlug = bySlug.get(CAT1B_TARGETS[id].slug)
      blockers.push(
        `${id}: unexpected insert collision id=${foundId ? 'present' : 'absent'} slug=${
          foundSlug ? foundSlug.id : 'absent'
        }`
      )
    }
  }

  for (const id of CAT1B_UPDATE_IDS) {
    classifications[id] = classifyExisting(id, byId)
    if (classifications[id] === 'UNEXPECTED') {
      blockers.push(`${id}: unexpected existing row (not pre-CAT old and not CAT-1B target)`)
    }
  }

  classifications.magazin = classifyExisting('magazin', byId)
  if (classifications.magazin === 'UNEXPECTED') {
    blockers.push('magazin: required influencer parent anchor is unexpected')
  }

  if (classifications.kultur === 'UNEXPECTED') {
    blockers.push('kultur: required dizi-tv parent anchor is unexpected')
  }

  if (classifications.muzik === 'UNEXPECTED') {
    blockers.push('muzik: required parent for konser/sanatci-haberleri is unexpected')
  }

  const blocked = blockers.length > 0 || Object.values(classifications).includes('UNEXPECTED')

  const steps: PlannedStep[] = CAT1B_ACTION_ORDER.map((id) => {
    const classification = classifications[id]
    const action = blocked ? 'ABORT' : actionFor(id, classification)
    const detail = blocked
      ? 'blocked: unexpected target present'
      : action === 'INSERT_GUARDED'
        ? `insert exact CAT-1B row`
        : action === 'UPDATE_GUARDED'
          ? id === 'konser'
            ? 'compare-and-set parent_id kultur → muzik'
            : `compare-and-set name → ${CAT1B_TARGETS[id].name}`
          : 'already exact CAT-1B target'
    return { id, classification, action, detail }
  })

  const mutations: CategoryMutation[] = []
  if (!blocked) {
    for (const id of CAT1B_ACTION_ORDER) {
      const classification = classifications[id]
      if (classification === 'MISSING_EXPECTED_NEW') {
        mutations.push({ kind: 'insert', table: 'categories', row: CAT1B_TARGETS[id] })
      } else if (classification === 'EXPECTED_OLD') {
        mutations.push({
          kind: 'update',
          table: 'categories',
          id,
          expectedOld: CAT1B_EXPECTED_OLD[id as keyof typeof CAT1B_EXPECTED_OLD],
          target: CAT1B_TARGETS[id],
        })
      }
    }
  }

  return {
    ok: !blocked,
    blocked,
    classifications,
    steps,
    mutations,
    blockers,
  }
}

export function assertPostconditions(rows: CategoryRow[]): string[] {
  const { byId } = indexRows(rows)
  const errors: string[] = []
  for (const id of CAT1B_TARGET_IDS) {
    const found = byId.get(id)
    const target = CAT1B_TARGETS[id as keyof typeof CAT1B_TARGETS]
    if (!found || !rowsEqual(found, target)) {
      errors.push(`${id}: postcondition failed`)
    }
  }
  return errors
}

export function mutationWriteTables(mutations: CategoryMutation[]): string[] {
  return [...new Set(mutations.map((m) => m.table))]
}

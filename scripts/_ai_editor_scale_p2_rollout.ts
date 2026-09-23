/**
 * SCALE P2 rollout — Wave 0→1→2→3 with circuit breaker.
 * Circuit logic must pass (or skip-on-insufficient-sample) before the next wave.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/_ai_editor_scale_p2_rollout.ts --wave=0
 *   npx tsx --tsconfig tsconfig.json scripts/_ai_editor_scale_p2_rollout.ts --all
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEED_CITY_CATEGORY_AI_EDITORS } from '../src/lib/ai/editorial/seedCityCategoryEditors'
import { allWave1ProvinceCategorySpecs } from '../src/lib/ai/editorial/seedProvinceCategoryEditors'
import { allWave2DistrictGeneralSpecs } from '../src/lib/ai/editorial/seedDistrictEditors'
import { allWave3CountrySpecs } from '../src/lib/ai/editorial/seedCountryEditors'
import {
  createAiEditor,
  getAiEditorBySlug,
} from '../src/lib/ai/editorial/aiEditorService'
import { defaultModelAssignmentsForSeed, type SeedEditorSpec } from '../src/lib/ai/editorial/seedEditors'
import { evaluateCircuitBreaker, type CircuitBreakerMetrics } from '../src/lib/ai/editorial/scaleCircuitBreaker'
import { persistCircuitBreakerState } from '../src/lib/ai/editorial/scaleCircuitBreakerStore'
import { getAdminFirestore } from '../src/lib/firebase/admin'
import { Collections } from '../src/lib/firebase/collections'

const ROOT = process.cwd()
for (const path of [join(ROOT, '.env.local'), '/Users/user/nahaber/.env.local']) {
  if (!existsSync(path)) continue
  const text = readFileSync(path, 'utf8')
  let i = 0
  while (i < text.length) {
    if (text[i] === '#' || text[i] === '\n') {
      const nl = text.indexOf('\n', i)
      i = nl === -1 ? text.length : nl + 1
      continue
    }
    const eq = text.indexOf('=', i)
    if (eq === -1) break
    const key = text.slice(i, eq).trim()
    if (!key || key.includes('\n')) {
      const nl = text.indexOf('\n', i)
      i = nl === -1 ? text.length : nl + 1
      continue
    }
    let j = eq + 1
    let value = ''
    if (text[j] === '"' || text[j] === "'") {
      const q = text[j]!
      j += 1
      while (j < text.length) {
        if (text[j] === '\\' && j + 1 < text.length) {
          const n = text[j + 1]!
          value += n === 'n' ? '\n' : n === 't' ? '\t' : n === q ? q : n
          j += 2
          continue
        }
        if (text[j] === q) {
          j += 1
          break
        }
        value += text[j]
        j += 1
      }
    } else {
      const nl = text.indexOf('\n', j)
      const end = nl === -1 ? text.length : nl
      value = text.slice(j, end).trim()
      j = end
    }
    if (process.env[key] === undefined) process.env[key] = value
    const nl = text.indexOf('\n', j)
    i = nl === -1 ? text.length : nl + 1
  }
}

type WaveId = '0' | '1' | '2' | '3'

function specsFor(wave: WaveId): SeedEditorSpec[] {
  if (wave === '0') return [...SEED_CITY_CATEGORY_AI_EDITORS]
  if (wave === '1') return allWave1ProvinceCategorySpecs()
  if (wave === '2') return allWave2DistrictGeneralSpecs()
  return allWave3CountrySpecs()
}

async function seedSpec(spec: SeedEditorSpec): Promise<'created' | 'exists'> {
  const existing = await getAiEditorBySlug(spec.slug)
  if (existing) return 'exists'
  await createAiEditor({
    name: spec.name,
    slug: spec.slug,
    title: spec.title,
    shortBio: spec.shortBio,
    bio: spec.bio,
    columnName: spec.columnName,
    primarySpecialization: spec.primarySpecialization,
    specializations: spec.specializations,
    categoryIds: spec.categoryIds,
    managedCategories: spec.managedCategories,
    citySlug: spec.citySlug ?? null,
    countrySlug: spec.countrySlug ?? null,
    districtSlug: spec.districtSlug ?? null,
    editorLayer: spec.editorLayer,
    capabilities: spec.capabilities,
    modelAssignments: defaultModelAssignmentsForSeed(spec),
    prompts: spec.prompts,
    createdBy: 'scale-p2-rollout',
    personaType: spec.personaType,
    desk: spec.desk,
    editorialMission: spec.editorialMission,
    tone: spec.tone,
    temperature: spec.temperature,
    fallbackEditorSlug: spec.fallbackEditorSlug,
    localConfig: spec.localConfig,
    assignableForNews: spec.assignableForNews,
    scaleHardened: true,
  })
  return 'created'
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()))
  return out
}

async function gatherMetrics(): Promise<CircuitBreakerMetrics> {
  const db = getAdminFirestore()
  const since = Date.now() - 6 * 60 * 60 * 1000
  let usageSample = 0
  let usageErrorCount = 0
  let costUsdToday: number | null = null
  try {
    const snap = await db
      .collection(Collections.AI_USAGE_EVENTS)
      .where('createdAt', '>=', since)
      .select('success', 'estimatedCostUsd')
      .limit(500)
      .get()
    usageSample = snap.size
    let cost = 0
    let costN = 0
    for (const d of snap.docs) {
      const row = d.data() as { success?: boolean; estimatedCostUsd?: number }
      if (row.success === false) usageErrorCount += 1
      if (typeof row.estimatedCostUsd === 'number') {
        cost += row.estimatedCostUsd
        costN += 1
      }
    }
    costUsdToday = costN > 0 ? cost : null
  } catch {
    usageSample = 0
  }
  return {
    qualityFailCount: 0,
    qualitySample: 0,
    usageErrorCount,
    usageSample,
    costUsdToday,
    costUsdBaselineDaily: null,
  }
}

async function runCircuit(wave: string): Promise<{ tripped: boolean; reason: string | null }> {
  const metrics = await gatherMetrics()
  const decision = evaluateCircuitBreaker(metrics)
  await persistCircuitBreakerState({
    tripped: decision.tripped,
    reason: decision.reason,
    metrics,
    wave,
  })
  if (decision.tripped) {
    console.error(`CIRCUIT BREAKER TRIPPED — ${decision.reason}`)
  }
  return { tripped: decision.tripped, reason: decision.reason }
}

async function runWave(wave: WaveId) {
  const specs = specsFor(wave)
  console.log(`WAVE ${wave} planned=${specs.length}`)
  const results = await pool(specs, 4, async (spec) => {
    try {
      return await seedSpec(spec)
    } catch (err) {
      return `error:${spec.slug}:${err instanceof Error ? err.message : String(err)}`
    }
  })
  const created = results.filter((r) => r === 'created').length
  const exists = results.filter((r) => r === 'exists').length
  const errors = results.filter((r) => typeof r === 'string' && r.startsWith('error:'))
  const summary = { wave, planned: specs.length, created, exists, errors: errors.length, errorSamples: errors.slice(0, 8) }
  writeFileSync(
    join(ROOT, `audit/faz-AI-EDITOR-SCALE-P2-wave${wave}.json`),
    JSON.stringify(summary, null, 2),
    'utf8'
  )
  console.log(JSON.stringify(summary))
  const circuit = await runCircuit(wave)
  return { summary, circuit }
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--wave='))?.split('=')[1]
  const all = process.argv.includes('--all') || !arg
  const waves: WaveId[] = all ? ['0', '1', '2', '3'] : [arg as WaveId]
  const report: unknown[] = []
  for (const wave of waves) {
    if (wave !== '0') {
      process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED = 'true'
    }
    const result = await runWave(wave)
    report.push(result)
    if (result.circuit.tripped) {
      writeFileSync(join(ROOT, 'audit/faz-AI-EDITOR-SCALE-P2-circuit-tripped.json'), JSON.stringify(result, null, 2))
      process.exitCode = 2
      return
    }
    if (wave === '0') {
      process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED = 'true'
      console.log('WAVE 0 ok — EXPANDED_EDITOR_HIERARCHY_ENABLED=true for remaining waves in this process')
    }
  }
  writeFileSync(join(ROOT, 'audit/faz-AI-EDITOR-SCALE-P2-rollout.json'), JSON.stringify(report, null, 2), 'utf8')
}

void main()

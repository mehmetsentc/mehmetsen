/**
 * Backfill journalist names + Dicebear avatar/cover onto live aiEditors.
 * Does not change slugs. Does not rename the 8 P6 customized nationals.
 * Does not write style prompts.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/_ai_editor_identity_backfill.ts
 *   npx tsx --tsconfig tsconfig.json scripts/_ai_editor_identity_backfill.ts --apply
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadP4Env } from './_p4_load_env'
import { listAiEditors, updateAiEditor } from '../src/lib/ai/editorial/aiEditorService'
import { allSeedEditorSpecs } from '../src/lib/ai/editorial/aiEditorService'
import { allWave1ProvinceCategorySpecs } from '../src/lib/ai/editorial/seedProvinceCategoryEditors'
import { allWave2DistrictGeneralSpecs } from '../src/lib/ai/editorial/seedDistrictEditors'
import { allWave3CountrySpecs } from '../src/lib/ai/editorial/seedCountryEditors'
import {
  identityPatchForEditor,
  scaleJournalistPersona,
  type EditorIdentityPatch,
} from '../src/lib/ai/editorial/scaleEditorPersona'
import { inferEditorLayer } from '../src/lib/ai/editorial/editorHierarchy'
import type { SeedEditorSpec } from '../src/lib/ai/editorial/seedEditors'
import type { AiEditorDocument } from '../src/types/aiEditor'

loadP4Env()

const APPLY = process.argv.includes('--apply')
const CONCURRENCY = 8
const CHANGED_BY = 'identity-backfill-p1-1'

function specIndex(): Map<string, SeedEditorSpec> {
  const map = new Map<string, SeedEditorSpec>()
  for (const spec of [
    ...allSeedEditorSpecs(),
    ...allWave1ProvinceCategorySpecs(),
    ...allWave2DistrictGeneralSpecs(),
    ...allWave3CountrySpecs(),
  ]) {
    map.set(spec.slug, spec)
  }
  return map
}

function fallbackPersona(editor: AiEditorDocument): EditorIdentityPatch {
  const layer = inferEditorLayer(editor)
  const personaLayer =
    layer === 'country' ? 'country' : layer === 'district' ? 'district' : 'province'
  const persona = scaleJournalistPersona({
    slug: editor.slug,
    deskLabel: editor.desk || editor.primarySpecialization || editor.title || editor.name,
    placeName: editor.countrySlug || editor.citySlug || editor.districtSlug || 'NaHaber',
    layer: personaLayer,
    countryKey: editor.countrySlug,
  })
  return {
    name: persona.name,
    title: persona.title,
    shortBio: persona.shortBio,
    bio: persona.bio,
    avatarUrl: persona.avatarUrl,
    coverUrl: persona.coverUrl,
  }
}

async function mapPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.max(1, n) }, async () => {
      while (true) {
        const idx = i++
        if (idx >= items.length) return
        await fn(items[idx]!)
      }
    })
  )
}

async function main() {
  const specs = specIndex()
  const editors = await listAiEditors({ limit: 4000 })
  const planned: {
    slug: string
    from: string
    to: string
    fields: string[]
  }[] = []

  type Job = { editor: AiEditorDocument; patch: EditorIdentityPatch }
  const jobs: Job[] = []

  for (const editor of editors) {
    const spec = specs.get(editor.slug) ?? null
    let patch = identityPatchForEditor(editor, spec)
    if (!patch && !spec) {
      const looksFactory =
        editor.slug.startsWith('ulke-') ||
        editor.slug.startsWith('il-') ||
        editor.slug.startsWith('ilce-') ||
        / AI$/i.test(editor.name)
      if (looksFactory) patch = fallbackPersona(editor)
    }
    if (!patch) continue
    const changed = Object.entries(patch).filter(([k, v]) => {
      const cur = (editor as Record<string, unknown>)[k]
      return v !== undefined && v !== cur
    })
    if (!changed.length) continue
    jobs.push({ editor, patch })
    planned.push({
      slug: editor.slug,
      from: editor.name,
      to: patch.name ?? editor.name,
      fields: changed.map(([k]) => k),
    })
  }

  const renameCount = planned.filter((p) => p.from !== p.to).length
  const summary = {
    apply: APPLY,
    scanned: editors.length,
    specs: specs.size,
    patchCount: jobs.length,
    renameCount,
    samples: planned.slice(0, 25),
  }

  if (APPLY) {
    let ok = 0
    let fail = 0
    const errors: { slug: string; error: string }[] = []
    await mapPool(jobs, CONCURRENCY, async ({ editor, patch }) => {
      try {
        await updateAiEditor(editor.id, patch, CHANGED_BY)
        ok += 1
      } catch (error) {
        fail += 1
        errors.push({
          slug: editor.slug,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })
    const out = { ...summary, written: ok, failed: fail, errors: errors.slice(0, 20) }
    const dest = join(process.cwd(), 'audit/faz-AI-EDITOR-identity-backfill.json')
    writeFileSync(dest, JSON.stringify(out, null, 2))
    console.log(JSON.stringify(out, null, 2))
    if (fail) process.exitCode = 1
    return
  }

  const dest = join(process.cwd(), 'audit/faz-AI-EDITOR-identity-backfill-dryrun.json')
  writeFileSync(dest, JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

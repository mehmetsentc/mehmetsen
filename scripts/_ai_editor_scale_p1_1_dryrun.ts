/**
 * SCALE P1.1 dry-run — static prompt text only.
 * Does not seed Firestore, does not call DeepSeek, does not open flags.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/_ai_editor_scale_p1_1_dryrun.ts
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildCountryEditorSpec,
  SCALE_P1_1_COUNTRY_DRYRUN,
} from '../src/lib/ai/editorial/seedCountryEditors'
import {
  buildDistrictEditorSpec,
  SCALE_P1_1_DISTRICT_DRYRUN,
} from '../src/lib/ai/editorial/seedDistrictEditors'

const specs = [
  ...SCALE_P1_1_COUNTRY_DRYRUN.map(buildCountryEditorSpec),
  ...SCALE_P1_1_DISTRICT_DRYRUN.map(buildDistrictEditorSpec),
]

const lines: string[] = [
  '# AI-EDITOR-SCALE P1.1 dry-run prompt pack',
  '',
  'Firestore yazımı yok. DeepSeek çağrısı yok.',
  '',
]
for (const spec of specs) {
  const chars = Object.values(spec.prompts).filter(Boolean).join('\n').length
  lines.push(`## ${spec.slug}`, '', `- prompt chars: ${chars}`, `- est tokens: ${Math.ceil(chars / 4)}`, '')
  lines.push('### core', '', '```', spec.prompts.core ?? '', '```', '')
  lines.push('### news', '', '```', spec.prompts.news ?? '', '```', '')
}
const out = join(__dirname, '_ai_editor_scale_p1_1_dryrun_output.md')
writeFileSync(out, lines.join('\n'), 'utf8')
console.log(`wrote ${out} specs=${specs.length}`)

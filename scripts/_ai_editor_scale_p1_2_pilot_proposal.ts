/**
 * SCALE P1.2 — local write-proposal payloads. No Firestore, no AI call.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/_ai_editor_scale_p1_2_pilot_proposal.ts
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCountryEditorSpec } from '../src/lib/ai/editorial/seedCountryEditors'
import { buildDistrictEditorSpec } from '../src/lib/ai/editorial/seedDistrictEditors'
import { defaultModelAssignmentsForSeed } from '../src/lib/ai/editorial/seedEditors'
import { promptDocId, syntheticAiAuthorUid } from '../src/types/aiEditor'

const NOW_PLACEHOLDER = '<WRITE_TS>'

function proposal(kind: 'A' | 'B') {
  const spec =
    kind === 'A'
      ? buildCountryEditorSpec({ countryCode: 'ES', countryNameTr: 'İspanya' })
      : buildDistrictEditorSpec({ provinceSlug: 'canakkale', districtSlug: 'biga' })
  const slug = spec.slug
  const id = syntheticAiAuthorUid(slug)
  const editor = {
    id,
    authorUid: id,
    name: spec.name,
    slug,
    avatarUrl: null,
    coverUrl: null,
    title: spec.title,
    shortBio: spec.shortBio,
    bio: spec.bio,
    columnName: spec.columnName,
    primarySpecialization: spec.primarySpecialization,
    specializations: spec.specializations,
    categoryIds: spec.categoryIds,
    managedCategories: spec.managedCategories ?? spec.categoryIds,
    citySlug: spec.citySlug ?? null,
    countrySlug: spec.countrySlug ?? null,
    districtSlug: spec.districtSlug ?? null,
    editorLayer: spec.editorLayer,
    languages: ['tr'],
    status: 'active',
    isAI: true,
    verified: true,
    capabilities: spec.capabilities,
    publishPolicy: 'AUTO_PUBLISH',
    maxDailyNews: 40,
    maxDailyColumns: 1,
    maxDailyVideos: 5,
    modelAssignments: defaultModelAssignmentsForSeed(spec),
    preferredSourceIds: [],
    allowedSourceIds: [],
    personaType: spec.personaType,
    desk: spec.desk,
    editorialMission: spec.editorialMission,
    tone: spec.tone,
    temperature: spec.temperature,
    fallbackEditorSlug: spec.fallbackEditorSlug ?? null,
    localConfig: spec.localConfig ?? null,
    assignableForNews: spec.assignableForNews ?? true,
    version: 1,
    createdAt: NOW_PLACEHOLDER,
    updatedAt: NOW_PLACEHOLDER,
    joinDate: NOW_PLACEHOLDER,
    lastActiveAt: null,
    createdBy: 'scale-p1-2-proposal',
  }
  const promptTypes = ['core', 'news', 'review'] as const
  const prompts = promptTypes
    .filter((t) => spec.prompts[t])
    .map((promptType) => ({
      path: `aiEditorPrompts/${promptDocId(id, promptType, 1)}`,
      document: {
        id: promptDocId(id, promptType, 1),
        editorId: id,
        promptType,
        version: 1,
        content: spec.prompts[promptType],
        previousVersion: null,
        changedBy: 'scale-p1-2-proposal',
        changedAt: NOW_PLACEHOLDER,
        changeReason: 'initial',
        isActive: true,
      },
    }))
  return {
    candidate: kind,
    flagRequiredToRoute: 'EXPANDED_EDITOR_HIERARCHY_ENABLED=true',
    paths: {
      editor: `aiEditors/${id}`,
      user: `users/${id}`,
      prompts: prompts.map((p) => p.path),
    },
    editor,
    user: {
      uid: id,
      username: slug,
      displayName: spec.name,
      email: `${slug}@ai.nahaber.internal`,
      photoURL: null,
      bio: spec.bio,
      role: 'author',
      department: spec.title,
      isVerified: true,
      isAI: true,
      aiEditorId: id,
      isBlocked: false,
    },
    prompts,
    promptChars: Object.values(spec.prompts)
      .filter(Boolean)
      .join('\n').length,
  }
}

const payload = {
  write: false,
  candidates: { A: proposal('A'), B: proposal('B') },
}

const out = join(process.cwd(), 'audit/faz-AI-EDITOR-SCALE-P1.2-pilot-proposal.json')
writeFileSync(out, JSON.stringify(payload, null, 2), 'utf8')
console.log(`wrote ${out}`)

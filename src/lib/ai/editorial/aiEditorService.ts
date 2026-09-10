import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  DEFAULT_AI_CAPABILITIES,
  promptDocId,
  syntheticAiAuthorUid,
  type AiEditorDocument,
  type AiEditorLocalConfig,
  type AiEditorPromptDocument,
  type AiEditorStatus,
  type AiPersonaType,
  type AiPromptType,
  type AiPublishPolicy,
} from '@/types/aiEditor'
import { defaultModelAssignmentsForSeed, SEED_AI_EDITORS, type SeedEditorSpec } from './seedEditors'
import { SEED_CITY_AI_EDITORS } from './seedCityEditors'

/** National personas + 81 city local editors. */
export function allSeedEditorSpecs(): SeedEditorSpec[] {
  return [...SEED_AI_EDITORS, ...SEED_CITY_AI_EDITORS]
}

export function normalizeEditorSlug(raw: string): string {
  return raw
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export async function getAiEditorById(id: string): Promise<AiEditorDocument | null> {
  const snap = await getAdminFirestore().collection(Collections.AI_EDITORS).doc(id).get()
  if (!snap.exists) return null
  return { id: snap.id, ...(snap.data() as Omit<AiEditorDocument, 'id'>) }
}

export async function getAiEditorBySlug(slug: string): Promise<AiEditorDocument | null> {
  const normalized = normalizeEditorSlug(slug)
  const snap = await getAdminFirestore()
    .collection(Collections.AI_EDITORS)
    .where('slug', '==', normalized)
    .limit(1)
    .get()
  if (snap.empty) return null
  const doc = snap.docs[0]!
  return { id: doc.id, ...(doc.data() as Omit<AiEditorDocument, 'id'>) }
}

export async function listAiEditors(opts?: {
  status?: AiEditorStatus
  limit?: number
}): Promise<AiEditorDocument[]> {
  const db = getAdminFirestore()
  const snap = await db.collection(Collections.AI_EDITORS).limit(400).get()
  let editors = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AiEditorDocument, 'id'>) }))
  if (opts?.status) editors = editors.filter((e) => e.status === opts.status)
  editors.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  return editors.slice(0, opts?.limit ?? 300)
}

export async function getActivePrompt(
  editorId: string,
  promptType: AiPromptType
): Promise<AiEditorPromptDocument | null> {
  const snap = await getAdminFirestore()
    .collection(Collections.AI_EDITOR_PROMPTS)
    .where('editorId', '==', editorId)
    .where('promptType', '==', promptType)
    .where('isActive', '==', true)
    .limit(1)
    .get()
  if (snap.empty) return null
  const doc = snap.docs[0]!
  return { id: doc.id, ...(doc.data() as Omit<AiEditorPromptDocument, 'id'>) }
}

export async function setPromptVersion(params: {
  editorId: string
  promptType: AiPromptType
  content: string
  changedBy: string | null
  changeReason?: string | null
}): Promise<AiEditorPromptDocument> {
  const db = getAdminFirestore()
  const existing = await db
    .collection(Collections.AI_EDITOR_PROMPTS)
    .where('editorId', '==', params.editorId)
    .where('promptType', '==', params.promptType)
    .where('isActive', '==', true)
    .limit(1)
    .get()

  const previousVersion = existing.empty
    ? null
    : ((existing.docs[0]!.data() as AiEditorPromptDocument).version ?? null)
  const nextVersion = (previousVersion ?? 0) + 1
  const now = Date.now()
  const id = promptDocId(params.editorId, params.promptType, nextVersion)

  const batch = db.batch()
  for (const d of existing.docs) {
    batch.update(d.ref, { isActive: false })
  }
  const doc: AiEditorPromptDocument = {
    id,
    editorId: params.editorId,
    promptType: params.promptType,
    version: nextVersion,
    content: params.content.trim(),
    previousVersion,
    changedBy: params.changedBy,
    changedAt: now,
    changeReason: params.changeReason ?? null,
    isActive: true,
  }
  batch.set(db.collection(Collections.AI_EDITOR_PROMPTS).doc(id), doc)
  batch.update(db.collection(Collections.AI_EDITORS).doc(params.editorId), {
    updatedAt: now,
    version: nextVersion,
  })
  await batch.commit()
  return doc
}

export interface CreateAiEditorInput {
  name: string
  slug?: string
  title: string
  shortBio?: string
  bio?: string
  avatarUrl?: string | null
  coverUrl?: string | null
  columnName?: string | null
  primarySpecialization?: string
  specializations?: string[]
  categoryIds?: string[]
  managedCategories?: string[]
  citySlug?: string | null
  languages?: string[]
  publishPolicy?: AiPublishPolicy
  capabilities?: Partial<AiEditorDocument['capabilities']>
  modelAssignments?: AiEditorDocument['modelAssignments']
  preferredSourceIds?: string[]
  allowedSourceIds?: string[]
  prompts?: Partial<Record<AiPromptType, string>>
  createdBy?: string | null
  personaType?: AiPersonaType
  desk?: string
  editorialMission?: string
  tone?: string
  temperature?: number
  fallbackEditorSlug?: string | null
  localConfig?: AiEditorLocalConfig | null
  assignableForNews?: boolean
}

export async function createAiEditor(input: CreateAiEditorInput): Promise<AiEditorDocument> {
  const slug = normalizeEditorSlug(input.slug || input.name)
  if (!slug || slug.length < 2) throw new Error('Geçersiz slug')

  const existing = await getAiEditorBySlug(slug)
  if (existing && existing.status !== 'archived') {
    throw new Error(`Editör zaten var: ${slug}`)
  }

  const authorUid = syntheticAiAuthorUid(slug)
  const now = Date.now()
  const editorId = existing?.id ?? authorUid
  const db = getAdminFirestore()

  const editor: AiEditorDocument = {
    id: editorId,
    authorUid,
    name: input.name.trim(),
    slug,
    avatarUrl: input.avatarUrl ?? null,
    coverUrl: input.coverUrl ?? null,
    title: input.title.trim(),
    shortBio: (input.shortBio ?? '').trim(),
    bio: (input.bio ?? '').trim(),
    columnName: input.columnName ?? null,
    primarySpecialization: (input.primarySpecialization ?? '').trim(),
    specializations: input.specializations ?? [],
    categoryIds: input.categoryIds ?? [],
    managedCategories: input.managedCategories?.length
      ? input.managedCategories
      : input.categoryIds ?? [],
    citySlug: input.citySlug ?? null,
    languages: input.languages?.length ? input.languages : ['tr'],
    status: 'active',
    isAI: true,
    verified: true,
    capabilities: { ...DEFAULT_AI_CAPABILITIES, ...input.capabilities },
    publishPolicy: input.publishPolicy ?? 'AUTO_PUBLISH',
    maxDailyNews: 40,
    maxDailyColumns: 1,
    maxDailyVideos: 5,
    modelAssignments: input.modelAssignments ?? {},
    preferredSourceIds: input.preferredSourceIds ?? [],
    allowedSourceIds: input.allowedSourceIds ?? [],
    personaType: input.personaType,
    desk: input.desk,
    editorialMission: input.editorialMission,
    tone: input.tone,
    temperature: input.temperature,
    fallbackEditorSlug: input.fallbackEditorSlug ?? null,
    localConfig: input.localConfig ?? null,
    assignableForNews: input.assignableForNews ?? true,
    version: 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    joinDate: existing?.joinDate ?? now,
    lastActiveAt: null,
    createdBy: input.createdBy ?? null,
  }

  const batch = db.batch()
  batch.set(db.collection(Collections.AI_EDITORS).doc(editorId), editor, { merge: true })
  batch.set(
    db.collection(Collections.USERS).doc(authorUid),
    {
      uid: authorUid,
      username: slug,
      displayName: editor.name,
      email: `${slug}@ai.nahaber.internal`,
      photoURL: editor.avatarUrl,
      bio: editor.bio || editor.shortBio,
      role: 'author',
      department: editor.title,
      isVerified: true,
      isAI: true,
      aiEditorId: editorId,
      isBlocked: false,
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      createdAt: new Date(editor.joinDate).toISOString(),
      updatedAt: new Date(now).toISOString(),
    },
    { merge: true }
  )
  await batch.commit()

  if (input.prompts) {
    for (const [promptType, content] of Object.entries(input.prompts)) {
      if (!content?.trim()) continue
      await setPromptVersion({
        editorId,
        promptType: promptType as AiPromptType,
        content,
        changedBy: input.createdBy ?? 'system',
        changeReason: 'initial',
      })
    }
  }

  return editor
}

export async function updateAiEditor(
  id: string,
  patch: Partial<AiEditorDocument>,
  changedBy?: string | null
): Promise<AiEditorDocument> {
  const existing = await getAiEditorById(id)
  if (!existing) throw new Error('Editör bulunamadı')

  const now = Date.now()
  const {
    id: _id,
    createdAt: _c,
    joinDate: _j,
    isAI: _ai,
    ...safe
  } = patch

  const next: AiEditorDocument = {
    ...existing,
    ...safe,
    id: existing.id,
    isAI: true,
    createdAt: existing.createdAt,
    joinDate: existing.joinDate,
    updatedAt: now,
  }

  const db = getAdminFirestore()
  const batch = db.batch()
  batch.set(db.collection(Collections.AI_EDITORS).doc(id), next, { merge: true })
  batch.set(
    db.collection(Collections.USERS).doc(existing.authorUid),
    {
      displayName: next.name,
      username: next.slug,
      photoURL: next.avatarUrl,
      bio: next.bio || next.shortBio,
      department: next.title,
      isAI: true,
      aiEditorId: id,
      isVerified: next.verified,
      updatedAt: new Date(now).toISOString(),
      ...(next.status === 'archived' || next.status === 'disabled'
        ? { isBlocked: next.status === 'archived' }
        : { isBlocked: false }),
    },
    { merge: true }
  )
  await batch.commit()
  void changedBy
  return next
}

export async function archiveAiEditor(id: string): Promise<AiEditorDocument> {
  return updateAiEditor(id, { status: 'archived' })
}

async function seedOne(spec: SeedEditorSpec, createdBy: string | null): Promise<'created' | 'updated' | 'skipped'> {
  const managedCategories = spec.managedCategories?.length
    ? spec.managedCategories
    : spec.categoryIds
  const existing = await getAiEditorBySlug(spec.slug)
  if (existing && existing.status === 'active') {
    await updateAiEditor(
      existing.id,
      {
        title: spec.title,
        shortBio: spec.shortBio,
        bio: spec.bio,
        columnName: spec.columnName,
        primarySpecialization: spec.primarySpecialization,
        specializations: spec.specializations,
        categoryIds: spec.categoryIds,
        managedCategories,
        citySlug: spec.citySlug ?? null,
        capabilities: { ...DEFAULT_AI_CAPABILITIES, ...spec.capabilities },
        personaType: spec.personaType,
        desk: spec.desk,
        editorialMission: spec.editorialMission,
        tone: spec.tone,
        temperature: spec.temperature,
        fallbackEditorSlug: spec.fallbackEditorSlug ?? null,
        localConfig: spec.localConfig ?? null,
        assignableForNews: spec.assignableForNews ?? true,
        publishPolicy:
          existing.publishPolicy === 'DRAFT_ONLY' ? 'DRAFT_ONLY' : 'AUTO_PUBLISH',
      },
      createdBy
    )
    return 'updated'
  }

  if (existing && existing.status !== 'active') {
    await updateAiEditor(
      existing.id,
      {
        status: 'active',
        title: spec.title,
        shortBio: spec.shortBio,
        bio: spec.bio,
        columnName: spec.columnName,
        primarySpecialization: spec.primarySpecialization,
        specializations: spec.specializations,
        categoryIds: spec.categoryIds,
        managedCategories,
        citySlug: spec.citySlug ?? null,
        capabilities: { ...DEFAULT_AI_CAPABILITIES, ...spec.capabilities },
        personaType: spec.personaType,
        desk: spec.desk,
        editorialMission: spec.editorialMission,
        tone: spec.tone,
        temperature: spec.temperature,
        fallbackEditorSlug: spec.fallbackEditorSlug ?? null,
        localConfig: spec.localConfig ?? null,
        assignableForNews: spec.assignableForNews ?? true,
        publishPolicy: 'AUTO_PUBLISH',
      },
      createdBy
    )
    return 'updated'
  }

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
    managedCategories,
    citySlug: spec.citySlug ?? null,
    capabilities: spec.capabilities,
    modelAssignments: defaultModelAssignmentsForSeed(spec),
    prompts: spec.prompts,
    publishPolicy: 'AUTO_PUBLISH',
    createdBy,
    personaType: spec.personaType,
    desk: spec.desk,
    editorialMission: spec.editorialMission,
    tone: spec.tone,
    temperature: spec.temperature,
    fallbackEditorSlug: spec.fallbackEditorSlug,
    localConfig: spec.localConfig,
    assignableForNews: spec.assignableForNews,
  })
  return 'created'
}

export async function seedDefaultAiEditors(createdBy: string | null = 'system'): Promise<{
  created: string[]
  updated: string[]
  skipped: string[]
}> {
  const created: string[] = []
  const updated: string[] = []
  const skipped: string[] = []
  for (const spec of allSeedEditorSpecs()) {
    const result = await seedOne(spec, createdBy)
    if (result === 'created') created.push(spec.slug)
    else if (result === 'updated') updated.push(spec.slug)
    else skipped.push(spec.slug)
  }
  return { created, updated, skipped }
}

/** Aktif editörlerde DRAFT_ONLY hariç yayın politikasını AUTO_PUBLISH yap. */
export async function enableAutoPublishForActiveEditors(
  changedBy: string | null = 'system'
): Promise<{ updated: string[]; skipped: string[] }> {
  const editors = await listAiEditors({ status: 'active', limit: 300 })
  const updated: string[] = []
  const skipped: string[] = []
  for (const editor of editors) {
    if (editor.publishPolicy === 'AUTO_PUBLISH' || editor.publishPolicy === 'DRAFT_ONLY') {
      skipped.push(editor.slug)
      continue
    }
    await updateAiEditor(editor.id, { publishPolicy: 'AUTO_PUBLISH' }, changedBy)
    updated.push(editor.slug)
  }
  return { updated, skipped }
}

/**
 * Mevcut editörlerin prompt'larını seed'den yenile (versioned).
 * Karakter + haber tarzı bir kez güncellenir; sonraki haberlerde geçerli olur.
 */
/**
 * AI STYLE P1.1 — Task 12: safe DRY-RUN preview for refreshStylePromptsFromSeed().
 *
 * READ-ONLY. Never calls setPromptVersion / updateAiEditor — no Firestore writes,
 * no version bump, no production data touched. For each seed editor + populated
 * promptType, compares the CURRENT active DB prompt against the seed-proposed
 * content and flags whether an admin appears to have manually customized it
 * (via changeReason recorded by the "Karakter & Tarz" panel or any reason other
 * than the seeding/refresh machinery itself) — i.e. content that
 * refreshStylePromptsFromSeed() would silently overwrite if run for real.
 */
export interface StyleRefreshPreviewEntry {
  editorSlug: string
  editorId: string | null
  editorFound: boolean
  promptType: AiPromptType
  currentActiveVersion: number | null
  changed: boolean
  manualCustomizationRisk: boolean
  manualCustomizationReason: string | null
  currentContentPreview: string | null
  proposedContentPreview: string
}

export interface StyleRefreshPreviewResult {
  generatedAt: number
  missingEditors: string[]
  entries: StyleRefreshPreviewEntry[]
  summary: {
    totalEditorsInSeed: number
    totalPromptsChecked: number
    changedCount: number
    unchangedCount: number
    manualCustomizationRiskCount: number
  }
}

/** changeReason values written by the seeding/refresh machinery itself (never a manual admin edit). */
const NON_MANUAL_CHANGE_REASONS = new Set<string | null | undefined>([
  'initial',
  'refreshStylePromptsFromSeed',
])

function previewSnippet(content: string, max = 220): string {
  const trimmed = content.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

export async function previewStyleRefreshFromSeed(): Promise<StyleRefreshPreviewResult> {
  const missingEditors: string[] = []
  const entries: StyleRefreshPreviewEntry[] = []
  const promptTypes: AiPromptType[] = [
    'core',
    'news',
    'breaking',
    'column',
    'analysis',
    'seo',
    'review',
    'video',
    'source',
  ]

  for (const spec of allSeedEditorSpecs()) {
    const existing = await getAiEditorBySlug(spec.slug)
    if (!existing) {
      missingEditors.push(spec.slug)
      continue
    }
    for (const promptType of promptTypes) {
      const proposed = spec.prompts[promptType]
      if (!proposed?.trim()) continue
      const active = await getActivePrompt(existing.id, promptType)
      const currentContent = active?.content?.trim() ?? null
      const changed = currentContent !== proposed.trim()
      const manualCustomizationRisk =
        !!active && changed && !NON_MANUAL_CHANGE_REASONS.has(active.changeReason)
      entries.push({
        editorSlug: spec.slug,
        editorId: existing.id,
        editorFound: true,
        promptType,
        currentActiveVersion: active?.version ?? null,
        changed,
        manualCustomizationRisk,
        manualCustomizationReason: manualCustomizationRisk ? active!.changeReason ?? null : null,
        currentContentPreview: currentContent ? previewSnippet(currentContent) : null,
        proposedContentPreview: previewSnippet(proposed),
      })
    }
  }

  const changedCount = entries.filter((e) => e.changed).length
  const manualCustomizationRiskCount = entries.filter((e) => e.manualCustomizationRisk).length

  return {
    generatedAt: Date.now(),
    missingEditors,
    entries,
    summary: {
      totalEditorsInSeed: allSeedEditorSpecs().length,
      totalPromptsChecked: entries.length,
      changedCount,
      unchangedCount: entries.length - changedCount,
      manualCustomizationRiskCount,
    },
  }
}

export async function refreshStylePromptsFromSeed(changedBy: string | null): Promise<{
  updated: string[]
  missing: string[]
}> {
  const updated: string[] = []
  const missing: string[] = []
  const promptTypes: AiPromptType[] = [
    'core',
    'news',
    'breaking',
    'column',
    'analysis',
    'seo',
    'review',
    'video',
    'source',
  ]
  for (const spec of allSeedEditorSpecs()) {
    const existing = await getAiEditorBySlug(spec.slug)
    if (!existing) {
      missing.push(spec.slug)
      continue
    }
    const managedCategories = spec.managedCategories?.length
      ? spec.managedCategories
      : spec.categoryIds
    await updateAiEditor(
      existing.id,
      {
        title: spec.title,
        shortBio: spec.shortBio,
        bio: spec.bio,
        columnName: spec.columnName,
        primarySpecialization: spec.primarySpecialization,
        specializations: spec.specializations,
        categoryIds: spec.categoryIds,
        managedCategories,
        citySlug: spec.citySlug ?? null,
        personaType: spec.personaType,
        desk: spec.desk,
        editorialMission: spec.editorialMission,
        tone: spec.tone,
        temperature: spec.temperature,
        fallbackEditorSlug: spec.fallbackEditorSlug ?? null,
        localConfig: spec.localConfig ?? null,
        assignableForNews: spec.assignableForNews ?? true,
        capabilities: { ...DEFAULT_AI_CAPABILITIES, ...spec.capabilities },
      },
      changedBy
    )
    for (const promptType of promptTypes) {
      const content = spec.prompts[promptType]
      if (!content?.trim()) continue
      await setPromptVersion({
        editorId: existing.id,
        promptType,
        content,
        changedBy,
        changeReason: 'refreshStylePromptsFromSeed',
      })
    }
    updated.push(spec.slug)
  }
  return { updated, missing }
}

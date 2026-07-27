import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  DEFAULT_AI_CAPABILITIES,
  promptDocId,
  syntheticAiAuthorUid,
  type AiEditorDocument,
  type AiEditorPromptDocument,
  type AiEditorStatus,
  type AiPromptType,
  type AiPublishPolicy,
} from '@/types/aiEditor'
import { defaultModelAssignmentsForSeed, SEED_AI_EDITORS, type SeedEditorSpec } from './seedEditors'

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
  const snap = await db.collection(Collections.AI_EDITORS).limit(200).get()
  let editors = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AiEditorDocument, 'id'>) }))
  if (opts?.status) editors = editors.filter((e) => e.status === opts.status)
  editors.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  return editors.slice(0, opts?.limit ?? 100)
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
  languages?: string[]
  publishPolicy?: AiPublishPolicy
  capabilities?: Partial<AiEditorDocument['capabilities']>
  modelAssignments?: AiEditorDocument['modelAssignments']
  preferredSourceIds?: string[]
  allowedSourceIds?: string[]
  prompts?: Partial<Record<AiPromptType, string>>
  createdBy?: string | null
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
    languages: input.languages?.length ? input.languages : ['tr'],
    status: 'active',
    isAI: true,
    verified: true,
    capabilities: { ...DEFAULT_AI_CAPABILITIES, ...input.capabilities },
    publishPolicy: input.publishPolicy ?? 'REQUIRES_APPROVAL',
    maxDailyNews: 40,
    maxDailyColumns: 1,
    maxDailyVideos: 5,
    modelAssignments: input.modelAssignments ?? {},
    preferredSourceIds: input.preferredSourceIds ?? [],
    allowedSourceIds: input.allowedSourceIds ?? [],
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

async function seedOne(spec: SeedEditorSpec, createdBy: string | null): Promise<'created' | 'skipped'> {
  const existing = await getAiEditorBySlug(spec.slug)
  if (existing && existing.status === 'active') return 'skipped'

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
    capabilities: spec.capabilities,
    modelAssignments: defaultModelAssignmentsForSeed(spec),
    prompts: spec.prompts,
    publishPolicy: 'REQUIRES_APPROVAL',
    createdBy,
  })
  return 'created'
}

export async function seedDefaultAiEditors(createdBy: string | null = 'system'): Promise<{
  created: string[]
  skipped: string[]
}> {
  const created: string[] = []
  const skipped: string[] = []
  for (const spec of SEED_AI_EDITORS) {
    const result = await seedOne(spec, createdBy)
    if (result === 'created') created.push(spec.slug)
    else skipped.push(spec.slug)
  }
  return { created, skipped }
}

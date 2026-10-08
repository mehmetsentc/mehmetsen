import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { unstable_cache } from 'next/cache'
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
import { SCALE_HARDENED_CREATE_DEFAULTS, SCALE_INITIAL_MAX_DAILY_NEWS, nextScaleDailyCount, nextScaleGateState } from './scaleHardening'
import { turkeyYmdNow } from '@/lib/turkeyCalendar'
import { defaultModelAssignmentsForSeed, SEED_AI_EDITORS, type SeedEditorSpec } from './seedEditors'
import { SEED_CITY_AI_EDITORS } from './seedCityEditors'
import { SEED_CITY_CATEGORY_AI_EDITORS } from './seedCityCategoryEditors'

/** National personas + 81 city local editors + Çanakkale/Antalya category desks. */
export function allSeedEditorSpecs(): SeedEditorSpec[] {
  return [...SEED_AI_EDITORS, ...SEED_CITY_AI_EDITORS, ...SEED_CITY_CATEGORY_AI_EDITORS]
}

export function findSeedEditorSpecBySlug(slug?: string | null): SeedEditorSpec | null {
  const key = slug?.trim().toLowerCase()
  if (!key) return null
  return allSeedEditorSpecs().find((spec) => spec.slug === key) ?? null
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

/**
 * FinOps: the full roster (~1.5k docs) was re-read on every CMS view and pipeline
 * route — ~340k Firestore reads/day (Query Insights, 30 Sep–1 Oct). A 5-minute
 * in-process copy alone still cost ~345k/day (2 Oct), because every refresh
 * re-reads all ~1.5k docs. Now each instance keeps its copy and, every 5 minutes,
 * spends ONE read on the most recently updated editor; it re-reads the full roster
 * only when that changes (every write here sets updatedAt) or after 6 hours, which
 * also picks up deletes and script edits that skip updatedAt. Writes in this module
 * drop the local copy immediately.
 */
const AI_EDITORS_PROBE_MS = 5 * 60 * 1000
const AI_EDITORS_MAX_AGE_MS = 6 * 60 * 60 * 1000
const AI_EDITORS_FETCH_CAP = 4000
let aiEditorsCache: {
  fetchedAt: number
  probedAt: number
  fingerprint: string | null
  editors: AiEditorDocument[]
} | null = null

export function invalidateAiEditorsCache(): void {
  aiEditorsCache = null
}

/** One-read change marker: id + updatedAt of the most recently updated editor. */
async function aiEditorsFingerprint(): Promise<string | null> {
  try {
    const snap = await getAdminFirestore()
      .collection(Collections.AI_EDITORS)
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get()
    const doc = snap.docs[0]
    if (!doc) return 'empty'
    return `${doc.id}:${JSON.stringify(doc.get('updatedAt') ?? null)}`
  } catch {
    return null
  }
}

let aiEditorsInflight: Promise<AiEditorDocument[]> | null = null

async function loadAiEditorsRoster(): Promise<AiEditorDocument[]> {
  const now = Date.now()
  const c = aiEditorsCache
  if (c && now - c.fetchedAt < AI_EDITORS_MAX_AGE_MS && now - c.probedAt < AI_EDITORS_PROBE_MS) {
    return c.editors
  }
  // FinOps 8 Oct: concurrent requests on a cold instance each re-read the full roster.
  if (!aiEditorsInflight) {
    aiEditorsInflight = refreshAiEditorsRoster(now).finally(() => {
      aiEditorsInflight = null
    })
  }
  return aiEditorsInflight
}

async function refreshAiEditorsRoster(now: number): Promise<AiEditorDocument[]> {
  const c = aiEditorsCache
  const fp = await aiEditorsFingerprint()
  if (c && now - c.fetchedAt < AI_EDITORS_MAX_AGE_MS && fp !== null && c.fingerprint !== null && fp === c.fingerprint) {
    c.probedAt = now
    return c.editors
  }
  const editors = await fetchAllAiEditors(fp)
  aiEditorsCache = { fetchedAt: now, probedAt: now, fingerprint: fp, editors }
  return editors
}

export async function listAiEditors(opts?: {
  status?: AiEditorStatus
  limit?: number
}): Promise<AiEditorDocument[]> {
  const cap = Math.max(1, opts?.limit ?? AI_EDITORS_FETCH_CAP)
  let out = await loadAiEditorsRoster()
  if (opts?.status) out = out.filter((e) => e.status === opts.status)
  out = [...out].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  return out.slice(0, cap)
}

/**
 * FinOps 6 Oct: serverless instances restart often, and each cold start re-read the
 * full roster (~2k docs incl. bio, model assignments, local config, source lists) —
 * ~115k reads and several GiB of Firestore egress a day. Routing, agents and the CMS
 * list only need these fields; callers that build prompts hydrate the chosen editor
 * with getAiEditorById (one read).
 */
const AI_EDITOR_ROSTER_FIELDS = [
  'authorUid', 'name', 'slug', 'avatarUrl', 'title', 'shortBio', 'columnName',
  'primarySpecialization', 'specializations', 'categoryIds', 'managedCategories',
  'citySlug', 'countrySlug', 'districtSlug', 'editorLayer', 'languages', 'status',
  'isAI', 'verified', 'capabilities', 'publishPolicy', 'maxDailyNews', 'maxDailyColumns',
  'maxDailyVideos', 'personaType', 'desk', 'editorialMission', 'temperature',
  'fallbackEditorSlug', 'assignableForNews', 'scaleHardened', 'autoPublishUnlockThreshold',
  'consecutiveQualityGatePasses', 'scaleDailyNewsCount', 'scaleDailyNewsYmd', 'version',
  'createdAt', 'updatedAt', 'joinDate', 'lastActiveAt', 'createdBy', 'managerAgentId',
] as const

/** Firestore Timestamps do not survive the JSON data cache; editor dates are stored as ms. */
function toCacheSafe(value: unknown): unknown {
  if (value && typeof value === 'object') {
    const maybe = value as { toMillis?: () => number }
    if (typeof maybe.toMillis === 'function') return maybe.toMillis()
    if (Array.isArray(value)) return value.map(toCacheSafe)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toCacheSafe(v)
    return out
  }
  return value
}

const AI_EDITORS_PAGE_SIZE = 400

async function fetchAiEditorsPage(afterId: string | null, pageSize: number): Promise<AiEditorDocument[]> {
  let q = getAdminFirestore()
    .collection(Collections.AI_EDITORS)
    .select(...AI_EDITOR_ROSTER_FIELDS)
    .orderBy('__name__')
    .limit(pageSize)
  if (afterId) q = q.startAfter(afterId)
  const snap = await q.get()
  return snap.docs.map(
    (d: QueryDocumentSnapshot) =>
      toCacheSafe({ id: d.id, ...(d.data() as Omit<AiEditorDocument, 'id'>) }) as AiEditorDocument
  )
}

/**
 * FinOps 8 Oct: every cold serverless instance re-read the whole roster (~2k docs,
 * ~113k reads/day). Pages are now shared across instances through the Next data
 * cache, keyed by the roster fingerprint (any write here bumps updatedAt → new key;
 * 6h revalidate still picks up deletes/script edits). One page of 400 projected
 * docs stays well under the 2MB item limit. Outside Next (scripts) or on a cache
 * error it falls back to a direct read.
 */
const getAiEditorsPageCached = unstable_cache(
  async (_fingerprint: string, afterId: string | null, pageSize: number) => fetchAiEditorsPage(afterId, pageSize),
  ['ai-editors-roster-page-v1'],
  { revalidate: AI_EDITORS_MAX_AGE_MS / 1000, tags: ['ai-editors-roster'] }
)

async function readAiEditorsPage(
  fingerprint: string | null,
  afterId: string | null,
  pageSize: number
): Promise<AiEditorDocument[]> {
  if (fingerprint) {
    try {
      return await getAiEditorsPageCached(fingerprint, afterId, pageSize)
    } catch {
      // fall through to a direct read
    }
  }
  return fetchAiEditorsPage(afterId, pageSize)
}

async function fetchAllAiEditors(fingerprint: string | null): Promise<AiEditorDocument[]> {
  const cap = AI_EDITORS_FETCH_CAP
  const editors: AiEditorDocument[] = []
  let afterId: string | null = null
  while (editors.length < cap) {
    const pageSize = Math.min(AI_EDITORS_PAGE_SIZE, cap - editors.length)
    const page = await readAiEditorsPage(fingerprint, afterId, pageSize)
    if (page.length === 0) break
    editors.push(...page)
    afterId = page[page.length - 1]!.id
    if (page.length < pageSize) break
  }
  return editors
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
  invalidateAiEditorsCache()
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
  countrySlug?: string | null
  districtSlug?: string | null
  editorLayer?: AiEditorDocument['editorLayer']
  languages?: string[]
  publishPolicy?: AiPublishPolicy
  maxDailyNews?: number
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
  scaleHardened?: boolean
  autoPublishUnlockThreshold?: number
  consecutiveQualityGatePasses?: number
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
    countrySlug: input.countrySlug ?? null,
    districtSlug: input.districtSlug ?? null,
    editorLayer: input.editorLayer,
    languages: input.languages?.length ? input.languages : ['tr'],
    status: 'active',
    isAI: true,
    verified: true,
    capabilities: { ...DEFAULT_AI_CAPABILITIES, ...input.capabilities },
    publishPolicy: input.scaleHardened
      ? SCALE_HARDENED_CREATE_DEFAULTS.publishPolicy
      : (input.publishPolicy ?? 'AUTO_PUBLISH'),
    maxDailyNews: input.scaleHardened
      ? SCALE_INITIAL_MAX_DAILY_NEWS
      : (input.maxDailyNews ?? 40),
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
    scaleHardened: input.scaleHardened ?? false,
    autoPublishUnlockThreshold: input.scaleHardened
      ? (input.autoPublishUnlockThreshold ?? SCALE_HARDENED_CREATE_DEFAULTS.autoPublishUnlockThreshold)
      : undefined,
    consecutiveQualityGatePasses: input.scaleHardened ? 0 : undefined,
    scaleDailyNewsCount: input.scaleHardened ? 0 : undefined,
    scaleDailyNewsYmd: input.scaleHardened ? null : undefined,
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
  invalidateAiEditorsCache()

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

/**
 * FinOps 3 Oct: this ran on every pipeline publish, bumped updatedAt and dropped the
 * roster cache, so every publish forced a full ~2k-doc roster re-read (~530k reads/day).
 * Now it reads the one editor doc fresh inside a transaction (also fixes stale counts),
 * patches the cached copy in place, and only bumps updatedAt (which makes other
 * instances re-read the roster) when routing-relevant state changes: policy unlock or
 * the daily cap being reached.
 */
export async function applyScaleQualityOutcome(
  editor: AiEditorDocument,
  gatePassed: boolean
): Promise<void> {
  if (!editor.scaleHardened) return
  const db = getAdminFirestore()
  const ref = db.collection(Collections.AI_EDITORS).doc(editor.id)
  const today = turkeyYmdNow()
  const patch = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return null
    const fresh = { ...editor, ...(snap.data() as Omit<AiEditorDocument, 'id'>), id: editor.id }
    const next = nextScaleGateState(fresh, gatePassed)
    const daily = nextScaleDailyCount(fresh, today)
    const routingChanged =
      next.publishPolicy !== fresh.publishPolicy ||
      next.maxDailyNews !== fresh.maxDailyNews ||
      daily.scaleDailyNewsCount >= next.maxDailyNews
    const update: Partial<AiEditorDocument> & { scaleUpdatedAt: number } = {
      consecutiveQualityGatePasses: next.consecutiveQualityGatePasses,
      publishPolicy: next.publishPolicy,
      maxDailyNews: next.maxDailyNews,
      scaleDailyNewsCount: daily.scaleDailyNewsCount,
      scaleDailyNewsYmd: daily.scaleDailyNewsYmd,
      scaleUpdatedAt: Date.now(),
      ...(routingChanged ? { updatedAt: Date.now() } : {}),
    }
    tx.update(ref, update)
    return update
  })
  if (!patch) return
  const cached = aiEditorsCache?.editors.find((e) => e.id === editor.id)
  if (cached) Object.assign(cached, patch)
  Object.assign(editor, patch)
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
  invalidateAiEditorsCache()
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
        countrySlug: spec.countrySlug ?? null,
        districtSlug: spec.districtSlug ?? null,
        editorLayer: spec.editorLayer,
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
        countrySlug: spec.countrySlug ?? null,
        districtSlug: spec.districtSlug ?? null,
        editorLayer: spec.editorLayer,
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
    countrySlug: spec.countrySlug ?? null,
    districtSlug: spec.districtSlug ?? null,
    editorLayer: spec.editorLayer,
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

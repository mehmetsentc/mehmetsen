/**
 * SCALE P1.2 — Firestore READ ONLY (TASK 1).
 * .get() only. No set / update / create / delete / batch.commit.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/_ai_editor_scale_p1_2_firestore_get.ts
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { SEED_CITY_CATEGORY_AI_EDITORS } from '../src/lib/ai/editorial/seedCityCategoryEditors'
import { syntheticAiAuthorUid } from '../src/types/aiEditor'

const ROOT = process.cwd()
const ENV_CANDIDATES = [
  join(ROOT, '.env.local'),
  join(ROOT, '.env'),
  '/Users/user/nahaber/.env.local',
]

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return
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
      const q = text[j]
      j += 1
      while (j < text.length) {
        if (text[j] === '\\' && j + 1 < text.length) {
          const n = text[j + 1]
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

for (const path of ENV_CANDIDATES) loadEnvFile(path)

function serviceAccount(): { projectId: string; clientEmail: string; privateKey: string } {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (jsonRaw) {
    const parsed = JSON.parse(jsonRaw) as {
      project_id?: string
      client_email?: string
      private_key?: string
    }
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      return {
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key.replace(/\\n/g, '\n'),
      }
    }
  }
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('FIREBASE_ADMIN_* missing — no write attempted')
  }
  return { projectId, clientEmail, privateKey }
}

function iso(ms: unknown): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null
  return new Date(ms).toISOString()
}

type PromptHit = {
  id: string
  promptType: string
  version: number | null
  changeReason: string | null
  changedAt: string | null
  isActive: boolean
  contentChars: number
}

async function readPrompts(db: Firestore, editorId: string): Promise<PromptHit[]> {
  const snap = await db
    .collection('aiEditorPrompts')
    .where('editorId', '==', editorId)
    .where('isActive', '==', true)
    .get()
  return snap.docs.map((doc) => {
    const d = doc.data() as Record<string, unknown>
    return {
      id: doc.id,
      promptType: String(d.promptType ?? ''),
      version: typeof d.version === 'number' ? d.version : null,
      changeReason: d.changeReason == null ? null : String(d.changeReason),
      changedAt: iso(d.changedAt),
      isActive: d.isActive === true,
      contentChars: typeof d.content === 'string' ? d.content.length : 0,
    }
  })
}

async function readEditor(
  db: Firestore,
  slug: string
): Promise<{
  slug: string
  exists: boolean
  docPath: string | null
  id: string | null
  status: string | null
  name: string | null
  citySlug: string | null
  changeReason: string | null
  promptChangeReasons: string[]
  updatedAt: string | null
  createdAt: string | null
  foundBy: 'doc.get' | 'slug.query' | null
  prompts: PromptHit[]
}> {
  const syntheticId = syntheticAiAuthorUid(slug)
  const docPath = `aiEditors/${syntheticId}`
  const byId = await db.collection('aiEditors').doc(syntheticId).get()
  let snap = byId
  let foundBy: 'doc.get' | 'slug.query' | null = byId.exists ? 'doc.get' : null
  if (!byId.exists) {
    const q = await db.collection('aiEditors').where('slug', '==', slug).limit(1).get()
    if (!q.empty) {
      snap = q.docs[0]!
      foundBy = 'slug.query'
    }
  }
  if (!snap.exists) {
    return {
      slug,
      exists: false,
      docPath,
      id: null,
      status: null,
      name: null,
      citySlug: null,
      changeReason: null,
      promptChangeReasons: [],
      updatedAt: null,
      createdAt: null,
      foundBy: null,
      prompts: [],
    }
  }
  const data = snap.data() as Record<string, unknown>
  const prompts = await readPrompts(db, snap.id)
  const reasons = [...new Set(prompts.map((p) => p.changeReason).filter(Boolean))] as string[]
  return {
    slug,
    exists: true,
    docPath: `aiEditors/${snap.id}`,
    id: snap.id,
    status: data.status == null ? null : String(data.status),
    name: data.name == null ? null : String(data.name),
    citySlug: data.citySlug == null ? null : String(data.citySlug),
    changeReason: reasons[0] ?? null,
    promptChangeReasons: reasons,
    updatedAt: iso(data.updatedAt),
    createdAt: iso(data.createdAt),
    foundBy,
    prompts,
  }
}

async function main(): Promise<void> {
  const sa = serviceAccount()
  if (!getApps().length) {
    initializeApp({
      credential: cert(sa),
      projectId: sa.projectId,
    })
  }
  const db = getFirestore()
  const citySlugs = SEED_CITY_CATEGORY_AI_EDITORS.map((s) => s.slug)
  const controls = ['defne-aksoy', 'yerel-canakkale']
  const rows = []
  for (const slug of citySlugs) {
    rows.push(await readEditor(db, slug))
  }
  const controlRows = []
  for (const slug of controls) {
    controlRows.push(await readEditor(db, slug))
  }

  const present = rows.filter((r) => r.exists).length
  const payload = {
    readOnly: true,
    projectId: sa.projectId,
    collection: 'aiEditors',
    promptCollection: 'aiEditorPrompts',
    queriedAt: new Date().toISOString(),
    cityCategory: { expected: citySlugs.length, present, missing: citySlugs.length - present },
    rows,
    controls: controlRows,
  }

  const jsonPath = join(ROOT, 'audit/faz-AI-EDITOR-SCALE-P1.2-firestore-get.json')
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8')

  const md: string[] = [
    '# SCALE P1.2 — Firestore GET (yazma yok)',
    '',
    `- projectId: ${sa.projectId}`,
    `- queriedAt: ${payload.queriedAt}`,
    `- city-category present: ${present}/${citySlugs.length}`,
    '',
    '| slug | var? | id | status | changeReason | updatedAt |',
    '|---|---|---|---|---|---|',
  ]
  for (const r of rows) {
    md.push(
      `| ${r.slug} | ${r.exists ? 'var' : 'yok'} | ${r.id ?? '—'} | ${r.status ?? '—'} | ${r.changeReason ?? '—'} | ${r.updatedAt ?? '—'} |`
    )
  }
  md.push('', '## Kontrol (bağlantı doğrulama)', '')
  for (const r of controlRows) {
    md.push(`- ${r.slug}: ${r.exists ? `var (${r.id}, ${r.changeReason ?? 'reason yok'})` : 'yok'}`)
  }
  const mdPath = join(ROOT, 'audit/faz-AI-EDITOR-SCALE-P1.2-firestore-get.md')
  writeFileSync(mdPath, md.join('\n'), 'utf8')
  console.log(JSON.stringify({ ok: true, present, missing: citySlugs.length - present, jsonPath, mdPath }))
}

void main()

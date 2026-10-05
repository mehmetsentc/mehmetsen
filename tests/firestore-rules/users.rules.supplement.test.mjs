// SEC-CMS-RULES-RUNTIME-VALIDATION-1 — gap coverage for the required attack matrix
// (runs alongside users.rules.test.mjs; emulator only, demo project).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, beforeEach, describe, it } from 'node:test'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, deleteField, doc, setDoc, updateDoc } from 'firebase/firestore'

const here = path.dirname(fileURLToPath(import.meta.url))
const rulesFile = process.env.RULES_FILE || path.resolve(here, '../../firestore.rules')
let env
const USERS = {
  super: { role: 'super_admin', username: 'root', cmsScope: { provinceSlugs: ['canakkale'] } },
  editor: { role: 'editor', username: 'ed' },
  editor2: { role: 'editor', username: 'ed2', permissions: ['news:read'] },
  user: { role: 'user', username: 'u' },
  scopedCat: { role: 'editor', username: 'spor', cmsScope: { provinceSlugs: ['canakkale'], categoryIds: ['spor'] } },
}
const db = (uid) => env.authenticatedContext(uid).firestore()

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-nahaber-rules',
    firestore: { rules: readFileSync(rulesFile, 'utf8') },
  })
})
after(async () => { await env?.cleanup() })
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore()
    for (const [uid, data] of Object.entries(USERS)) await setDoc(doc(a, 'users', uid), data)
    await setDoc(doc(a, 'news', 'n-ant'), { title: 't', citySlug: 'antalya', categoryId: 'ekonomi', status: 'draft' })
  })
})

describe('PERMISSIONS escalation (gaps)', () => {
  it("editor cannot change another user's permissions", () =>
    assertFails(updateDoc(doc(db('editor'), 'users', 'editor2'), { permissions: ['system:settings'] })))
  it("editor cannot delete another user's permissions field", () =>
    assertFails(updateDoc(doc(db('editor'), 'users', 'editor2'), { permissions: deleteField() })))
  it('normal user cannot add system:settings to self', () =>
    assertFails(updateDoc(doc(db('user'), 'users', 'user'), { permissions: ['system:settings'] })))
})

describe('cmsScope escape (gaps)', () => {
  const me = () => doc(db('scopedCat'), 'users', 'scopedCat')
  it('category-scoped editor cannot widen category scope', () =>
    assertFails(updateDoc(me(), { 'cmsScope.categoryIds': ['spor', 'ekonomi'] })))
  it('category-scoped editor cannot drop category restriction', () =>
    assertFails(updateDoc(me(), { cmsScope: { provinceSlugs: ['canakkale'] } })))
  it('category-scoped editor cannot globalize via set(merge) cmsScope null', () =>
    assertFails(setDoc(me(), { cmsScope: null }, { merge: true })))
})

describe('CREATE / DELETE (normal user)', () => {
  it('normal user cannot delete own users document', () => assertFails(deleteDoc(doc(db('user'), 'users', 'user'))))
  it("normal user cannot create another user's document", () =>
    assertFails(setDoc(doc(db('user'), 'users', 'someone-else'), { username: 'x', role: 'user' })))
})

describe('SUPER ADMIN intentional behavior', () => {
  it('super_admin with a stray cmsScope is still unscoped for direct CMS writes', () =>
    assertSucceeds(updateDoc(doc(db('super'), 'news', 'n-ant'), { title: 'ok' })))
  it('super_admin can grant and revoke permissions', async () => {
    await assertSucceeds(updateDoc(doc(db('super'), 'users', 'editor'), { permissions: ['system:settings'] }))
    await assertSucceeds(updateDoc(doc(db('super'), 'users', 'editor'), { permissions: deleteField() }))
  })
  it('category-scoped editor has no direct client news write even in scope', () =>
    assertFails(updateDoc(doc(db('scopedCat'), 'news', 'n-ant'), { title: 'x' })))
})

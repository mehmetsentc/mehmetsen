// SEC-CMS-ROLE-ESCALATION-1 — Firestore rules RUNTIME tests (emulator only).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, beforeEach, describe, it } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, deleteField, doc, setDoc, updateDoc } from 'firebase/firestore'

const here = path.dirname(fileURLToPath(import.meta.url))
const rulesFile = process.env.RULES_FILE || path.resolve(here, '../../firestore.rules')

let env
const USERS = {
  super: { role: 'super_admin', username: 'root' },
  managing: { role: 'managing_editor', username: 'me' },
  editor: { role: 'editor', username: 'ed' },
  editor2: { role: 'editor', username: 'ed2' },
  author: { role: 'author', username: 'au' },
  user: { role: 'user', username: 'u' },
  scoped: { role: 'editor', username: 'cnk', cmsScope: { provinceSlugs: ['canakkale'] } },
}

const db = (uid) => env.authenticatedContext(uid).firestore()
const anon = () => env.unauthenticatedContext().firestore()

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
    await setDoc(doc(a, 'news', 'n-cnk'), { title: 't', citySlug: 'canakkale', categoryId: 'spor', status: 'draft' })
    await setDoc(doc(a, 'newsDrafts', 'd-cnk'), { title: 't', citySlug: 'canakkale', categoryId: 'spor' })
  })
})

describe('SELF', () => {
  it('editor cannot change own role to super_admin', () => assertFails(updateDoc(doc(db('editor'), 'users', 'editor'), { role: 'super_admin' })))
  it('editor cannot change own role to managing_editor', () => assertFails(updateDoc(doc(db('editor'), 'users', 'editor'), { role: 'managing_editor' })))
  it('editor cannot delete own role', () => assertFails(updateDoc(doc(db('editor'), 'users', 'editor'), { role: deleteField() })))
  it('editor cannot add cmsScope / permissions to self', async () => {
    await assertFails(updateDoc(doc(db('editor'), 'users', 'editor'), { cmsScope: { provinceSlugs: ['antalya'] } }))
    await assertFails(updateDoc(doc(db('editor'), 'users', 'editor'), { permissions: ['system:settings'] }))
  })
  it('editor cannot overwrite own document (set) with a new role', () => assertFails(setDoc(doc(db('editor'), 'users', 'editor'), { username: 'ed', role: 'super_admin' })))
  it('editor cannot set(merge) a new role', () => assertFails(setDoc(doc(db('editor'), 'users', 'editor'), { role: 'super_admin' }, { merge: true })))
  it('editor cannot delete own document', () => assertFails(deleteDoc(doc(db('editor'), 'users', 'editor'))))
  it('author cannot become editor', () => assertFails(updateDoc(doc(db('author'), 'users', 'author'), { role: 'editor' })))
  it('normal user cannot become editor', () => assertFails(updateDoc(doc(db('user'), 'users', 'user'), { role: 'editor' })))
  it('managing_editor cannot become super_admin', () => assertFails(updateDoc(doc(db('managing'), 'users', 'managing'), { role: 'super_admin' })))
})

describe('OTHER USER', () => {
  it('editor cannot change another user role', () => assertFails(updateDoc(doc(db('editor'), 'users', 'editor2'), { role: 'super_admin' })))
  it('editor cannot promote a normal user', () => assertFails(updateDoc(doc(db('editor'), 'users', 'user'), { role: 'editor' })))
  it('managing_editor cannot change another user role', () => assertFails(updateDoc(doc(db('managing'), 'users', 'user'), { role: 'editor' })))
  it("editor cannot change another user's cmsScope", () => assertFails(updateDoc(doc(db('editor'), 'users', 'scoped'), { cmsScope: deleteField() })))
  it('editor cannot delete another staff document', () => assertFails(deleteDoc(doc(db('editor'), 'users', 'editor2'))))
  it('editor cannot create (recreate) another user document', () => assertFails(setDoc(doc(db('editor'), 'users', 'brand-new'), { role: 'user' })))
  it('editor cannot overwrite another user document with a role', () => assertFails(setDoc(doc(db('editor'), 'users', 'user'), { username: 'u', role: 'editor' })))
})

describe('SCOPE ESCAPE', () => {
  const me = () => doc(db('scoped'), 'users', 'scoped')
  it('scoped editor cannot delete cmsScope', () => assertFails(updateDoc(me(), { cmsScope: deleteField() })))
  it('scoped editor cannot null cmsScope', () => assertFails(updateDoc(me(), { cmsScope: null })))
  it('scoped editor cannot set cmsScope to {}', () => assertFails(updateDoc(me(), { cmsScope: {} })))
  it('scoped editor cannot widen cmsScope', () => assertFails(updateDoc(me(), { cmsScope: { provinceSlugs: ['canakkale', 'antalya'] } })))
  it('scoped editor cannot overwrite doc without cmsScope', () => assertFails(setDoc(me(), { username: 'cnk', role: 'editor' })))
  it('scoped editor has no direct client write on news / newsDrafts', async () => {
    await assertFails(updateDoc(doc(db('scoped'), 'news', 'n-cnk'), { title: 'x' }))
    await assertFails(updateDoc(doc(db('scoped'), 'newsDrafts', 'd-cnk'), { title: 'x' }))
    await assertFails(setDoc(doc(db('scoped'), 'news', 'n-new'), { title: 'x', status: 'published' }))
  })
})

describe('CREATE (self-signup)', () => {
  it('plain self-signup works', () => assertSucceeds(setDoc(doc(db('fresh'), 'users', 'fresh'), { username: 'fresh', role: 'user' })))
  it('self-signup cannot carry role/permissions/cmsScope/isAdmin/admin', async () => {
    await assertFails(setDoc(doc(db('f1'), 'users', 'f1'), { role: 'editor' }))
    await assertFails(setDoc(doc(db('f2'), 'users', 'f2'), { role: 'user', permissions: ['system:settings'] }))
    await assertFails(setDoc(doc(db('f3'), 'users', 'f3'), { role: 'user', cmsScope: { provinceSlugs: ['canakkale'] } }))
    await assertFails(setDoc(doc(db('f4'), 'users', 'f4'), { isAdmin: true }))
    await assertFails(setDoc(doc(db('f5'), 'users', 'f5'), { admin: true }))
  })
  it('anonymous cannot create', () => assertFails(setDoc(doc(anon(), 'users', 'x'), { role: 'user' })))
})

describe('LEGITIMATE (must keep working)', () => {
  it('owner updates safe profile fields', () => assertSucceeds(updateDoc(doc(db('user'), 'users', 'user'), { displayName: 'Ali', bio: 'merhaba' })))
  it('scoped editor updates own safe profile field', () => assertSucceeds(updateDoc(doc(db('scoped'), 'users', 'scoped'), { displayName: 'Çanakkale Editör' })))
  it('unscoped editor can still block/unblock a user (moderation, not authority)', () => assertSucceeds(updateDoc(doc(db('editor'), 'users', 'user'), { isBlocked: true })))
  it('super_admin can assign a role', () => assertSucceeds(updateDoc(doc(db('super'), 'users', 'user'), { role: 'editor' })))
  it('super_admin can assign and remove a cmsScope', async () => {
    await assertSucceeds(updateDoc(doc(db('super'), 'users', 'editor2'), { cmsScope: { provinceSlugs: ['canakkale'] } }))
    await assertSucceeds(updateDoc(doc(db('super'), 'users', 'scoped'), { cmsScope: deleteField() }))
  })
  it('unscoped editor keeps direct CMS news writes (legacy behavior)', () => assertSucceeds(updateDoc(doc(db('editor'), 'news', 'n-cnk'), { title: 'ok' })))
  it('public read of users still allowed', () => assertSucceeds(import('firebase/firestore').then(({ getDoc }) => getDoc(doc(anon(), 'users', 'user')))))
})

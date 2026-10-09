// Social multi-account collections — Firestore rules RUNTIME tests (emulator only).
// socialAccounts / socialAccountSecrets / socialOAuthStates must be unreachable
// from every client identity (anonymous, user, staff, super_admin). Admin SDK only.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, beforeEach, describe, it } from 'node:test'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'

const here = path.dirname(fileURLToPath(import.meta.url))
const rulesFile = process.env.RULES_FILE || path.resolve(here, '../../firestore.rules')

let env
const USERS = {
  super: { role: 'super_admin', username: 'root' },
  managing: { role: 'managing_editor', username: 'me' },
  editor: { role: 'editor', username: 'ed' },
  user: { role: 'user', username: 'u' },
  scoped: { role: 'editor', username: 'cnk', cmsScope: { provinceSlugs: ['canakkale'] } },
}
const COLLECTIONS = ['socialAccounts', 'socialAccountSecrets', 'socialOAuthStates', 'socialConnectSessions', 'socialPublishRecords']
const IDS = { socialAccounts: 'facebook_123', socialAccountSecrets: 'facebook_123', socialOAuthStates: 'abc', socialConnectSessions: 'sess', socialPublishRecords: 'n1__facebook_123__post' }

const ctxs = () => [
  ['anon', env.unauthenticatedContext().firestore()],
  ...Object.keys(USERS).map((uid) => [uid, env.authenticatedContext(uid).firestore()]),
]

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
    await setDoc(doc(a, 'socialAccounts', 'facebook_123'), { platform: 'facebook', externalId: '123', status: 'active' })
    await setDoc(doc(a, 'socialAccountSecrets', 'facebook_123'), { kind: 'encrypted', accessTokenEncrypted: 'x:y:z' })
    await setDoc(doc(a, 'socialOAuthStates', 'abc'), { uid: 'super', platform: 'facebook', bindingHash: 'h' })
    await setDoc(doc(a, 'socialConnectSessions', 'sess'), { uid: 'super', userTokenEncrypted: 'x:y:z', pages: [] })
    await setDoc(doc(a, 'socialPublishRecords', 'n1__facebook_123__post'), { status: 'succeeded', accountId: 'facebook_123' })
  })
})

for (const col of COLLECTIONS) {
  describe(`${col} — client access closed`, () => {
    it('no identity can read a document', async () => {
      for (const [, db] of ctxs()) await assertFails(getDoc(doc(db, col, IDS[col])))
    })
    it('no identity can list the collection', async () => {
      for (const [, db] of ctxs()) await assertFails(getDocs(collection(db, col)))
    })
    it('no identity can create', async () => {
      for (const [who, db] of ctxs()) await assertFails(setDoc(doc(db, col, `new-${who}`), { a: 1 }))
    })
    it('no identity can update or delete', async () => {
      for (const [, db] of ctxs()) {
        await assertFails(updateDoc(doc(db, col, IDS[col]), { status: 'disabled' }))
        await assertFails(deleteDoc(doc(db, col, IDS[col])))
      }
    })
  })
}

describe('control — rules are actually evaluated', () => {
  it('a public collection remains readable (news)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'news', 'n1'), { title: 't', status: 'published' })
    })
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'news', 'n1')))
  })
})

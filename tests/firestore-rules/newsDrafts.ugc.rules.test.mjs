// SEC-UGC-INTEGRITY-REPAIR-1 — newsDrafts has no direct-browser UGC path.
// Emulator only (demo project); never touches production.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, beforeEach, describe, it } from 'node:test'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'

const here = path.dirname(fileURLToPath(import.meta.url))
const rulesFile = process.env.RULES_FILE || path.resolve(here, '../../firestore.rules')
let env
const USERS = {
  reader: { role: 'user', username: 'okur' },
  reader2: { role: 'user', username: 'okur2' },
  editor: { role: 'editor', username: 'ed' },
  managing: { role: 'managing_editor', username: 'me' },
  super: { role: 'super_admin', username: 'root' },
  author: { role: 'author', username: 'au' },
  video: { role: 'video_editor', username: 'vid' },
  scoped: { role: 'editor', username: 'cnk', cmsScope: { provinceSlugs: ['canakkale'] } },
  scopedAuthor: { role: 'author', username: 'cnka', cmsScope: { provinceSlugs: ['canakkale'] } },
}
const db = (uid) => env.authenticatedContext(uid).firestore()
const anon = () => env.unauthenticatedContext().firestore()

// The exact payload the old rule admitted from any signed-in browser.
const ugcPayload = (uid, extra = {}) => ({
  title: 'Okur haberi',
  description: 'x'.repeat(40),
  authorId: uid,
  source: 'ugc',
  type: 'ugc',
  draftStatus: 'pending_review',
  ...extra,
})
// Attacker-chosen privileged metadata the old rule did not constrain.
const privileged = {
  featured: true,
  isEditorPick: true,
  isBreaking: true,
  breakingScore: 100,
  isPinned: true,
  isTrending: true,
  authorUsername: 'kidemli-muhabir',
  authorDisplayName: 'NaHaber Editörü',
  aiEditorId: 'ai-editor-1',
  rssGuid: 'raw_victim123',
  sourceLabel: 'AA',
  sourceUrl: 'https://example.invalid/a',
  rightsStatus: 'licensed',
}

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
    // A server-written (Admin SDK) UGC submission owned by `reader`.
    await setDoc(doc(a, 'newsDrafts', 'ugc-own'), ugcPayload('reader'))
    await setDoc(doc(a, 'newsDrafts', 'ai-1'), { title: 'ai', draftStatus: 'pending_review', source: 'AA', citySlug: 'canakkale' })
  })
})

describe('normal signed-in user — no direct newsDrafts access', () => {
  it('cannot direct-create a UGC draft (setDoc)', () =>
    assertFails(setDoc(doc(db('reader'), 'newsDrafts', 'x1'), ugcPayload('reader'))))
  it('cannot direct-create a UGC draft (addDoc)', () =>
    assertFails(addDoc(collection(db('reader'), 'newsDrafts'), ugcPayload('reader'))))
  it('cannot direct-create a UGC draft carrying privileged placement/byline/provenance', () =>
    assertFails(setDoc(doc(db('reader'), 'newsDrafts', 'x2'), ugcPayload('reader', privileged))))
  it('cannot direct-read own newsDraft', () =>
    assertFails(getDoc(doc(db('reader'), 'newsDrafts', 'ugc-own'))))
  it('cannot list own newsDrafts by authorId', () =>
    assertFails(getDocs(query(collection(db('reader'), 'newsDrafts'), where('authorId', '==', 'reader')))))
  it('cannot direct-update own pending UGC draft', () =>
    assertFails(updateDoc(doc(db('reader'), 'newsDrafts', 'ugc-own'), { title: 'değişti' })))
  it('cannot inject privileged fields into own pending UGC draft', () =>
    assertFails(updateDoc(doc(db('reader'), 'newsDrafts', 'ugc-own'), { featured: true, isBreaking: true, rssGuid: 'raw_victim123' })))
  it('cannot delete own UGC draft', () =>
    assertFails(deleteDoc(doc(db('reader'), 'newsDrafts', 'ugc-own'))))
  it("cannot read/update someone else's draft", async () => {
    await assertFails(getDoc(doc(db('reader2'), 'newsDrafts', 'ugc-own')))
    await assertFails(updateDoc(doc(db('reader2'), 'newsDrafts', 'ugc-own'), { title: 'x' }))
  })
  it('unauthenticated cannot read or create', async () => {
    await assertFails(getDoc(doc(anon(), 'newsDrafts', 'ugc-own')))
    await assertFails(setDoc(doc(anon(), 'newsDrafts', 'x3'), ugcPayload('nobody')))
  })
})

describe('scoped staff — browser access stays denied', () => {
  it('scoped editor cannot read, create, update or delete newsDrafts', async () => {
    await assertFails(getDoc(doc(db('scoped'), 'newsDrafts', 'ai-1')))
    await assertFails(setDoc(doc(db('scoped'), 'newsDrafts', 'x4'), { title: 't', citySlug: 'canakkale' }))
    await assertFails(updateDoc(doc(db('scoped'), 'newsDrafts', 'ai-1'), { title: 'x' }))
    await assertFails(deleteDoc(doc(db('scoped'), 'newsDrafts', 'ai-1')))
  })
  it('scoped editor cannot use the old UGC shape either', () =>
    assertFails(setDoc(doc(db('scoped'), 'newsDrafts', 'x5'), ugcPayload('scoped'))))
  it('scoped author cannot read newsDrafts', () =>
    assertFails(getDoc(doc(db('scopedAuthor'), 'newsDrafts', 'ai-1'))))
})

describe('unscoped CMS staff — Jul-28 model preserved', () => {
  for (const uid of ['editor', 'managing', 'super']) {
    it(`${uid} (publisher) can read, create, update, delete`, async () => {
      await assertSucceeds(getDoc(doc(db(uid), 'newsDrafts', 'ai-1')))
      await assertSucceeds(setDoc(doc(db(uid), 'newsDrafts', `p-${uid}`), { title: 't' }))
      await assertSucceeds(updateDoc(doc(db(uid), 'newsDrafts', 'ugc-own'), { title: 'editör düzeltti' }))
      await assertSucceeds(deleteDoc(doc(db(uid), 'newsDrafts', `p-${uid}`)))
    })
  }
  for (const uid of ['author', 'video']) {
    it(`${uid} (staff, non-publisher) can read but not write`, async () => {
      await assertSucceeds(getDoc(doc(db(uid), 'newsDrafts', 'ai-1')))
      await assertFails(setDoc(doc(db(uid), 'newsDrafts', `p-${uid}`), { title: 't' }))
      await assertFails(updateDoc(doc(db(uid), 'newsDrafts', 'ai-1'), { title: 'x' }))
      await assertFails(deleteDoc(doc(db(uid), 'newsDrafts', 'ai-1')))
    })
  }
})

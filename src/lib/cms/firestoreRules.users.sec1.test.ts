/**
 * SEC-CMS-ROLE-ESCALATION-1 — STATIC checks on firestore.rules (text level).
 * These do NOT execute the rules engine. Runtime verification lives in
 * tests/firestore-rules (requires the Firestore emulator).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AUTHORIZATION_SENSITIVE_USER_FIELDS } from '@/lib/cms/authorizationSensitiveUserFields'

const rules = readFileSync(path.resolve(__dirname, '../../../firestore.rules'), 'utf8')

function block(start: string, end: string): string {
  const i = rules.indexOf(start)
  expect(i, `missing ${start}`).toBeGreaterThanOrEqual(0)
  const j = rules.indexOf(end, i + start.length)
  expect(j, `missing ${end}`).toBeGreaterThan(i)
  return rules.slice(i, j)
}
const fnBody = (name: string) => block(`function ${name}(`, '\n    }')
const usersBlock = block('match /users/{userId} {', 'match /categories/{categoryId}')
const listIn = (src: string) => [...src.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1])

describe('SEC-CMS-ROLE-ESCALATION-1 — firestore.rules static', () => {
  it('rules list === AUTHORIZATION_SENSITIVE_USER_FIELDS (single list, no drift)', () => {
    expect(listIn(fnBody('authorizationSensitiveUserFields'))).toEqual([...AUTHORIZATION_SENSITIVE_USER_FIELDS])
  })

  it('field check uses diff().affectedKeys() (covers add, change and removal)', () => {
    const f = fnBody('touchesAuthorizationSensitiveUserFields')
    expect(f).toContain('request.resource.data.diff(resource.data).affectedKeys()')
    expect(f).toContain('.hasAny(authorizationSensitiveUserFields())')
  })

  it('only super_admin (Firestore role) may change authority fields from a client', () => {
    const f = fnBody('isUserAuthorityAdministrator')
    expect(f).toMatch(/userRole\(\)\s*==\s*'super_admin'/)
    expect(f).not.toMatch(/managing_editor|'editor'|'admin'/)
  })

  it('users update: no unconditional isAdmin() branch remains', () => {
    const update = usersBlock.slice(usersBlock.indexOf('allow update:'), usersBlock.indexOf('allow delete:'))
    expect(update).toContain('(isAdmin() || isOwner(userId))')
    expect(update).toContain('(!touchesAuthorizationSensitiveUserFields() || isUserAuthorityAdministrator())')
    // the vulnerable pre-fix shape: `allow update: if isAdmin()\n        || (...`
    expect(update).not.toMatch(/allow update:\s*if\s*isAdmin\(\)\s*\|\|/)
  })

  it('users create: self only, plain role, no other authority field', () => {
    const create = usersBlock.slice(usersBlock.indexOf('allow create:'), usersBlock.indexOf('allow update:'))
    expect(create).toContain('isOwner(userId)')
    expect(create).toContain(".hasAny(['permissions', 'cmsScope', 'isAdmin', 'admin'])")
    const createForbidden = listIn(create.slice(create.indexOf('.hasAny(')))
    expect([...createForbidden, 'role'].sort()).toEqual([...AUTHORIZATION_SENSITIVE_USER_FIELDS].sort())
  })

  it('users delete stays closed (no delete/recreate path)', () => {
    expect(usersBlock).toMatch(/allow delete:\s*if false;/)
  })

  it('Phase 1: scoped staff lose direct CMS client privileges; super_admin never scoped', () => {
    const scoped = fnBody('isScopedStaff')
    expect(scoped).toMatch(/userRole\(\)\s*!=\s*'super_admin'/)
    expect(scoped).toContain("userDoc().data.get('cmsScope', null) != null")
    expect(fnBody('isCmsPublisher')).toContain('!isScopedStaff()')
    expect(fnBody('isCmsStaff')).toContain('!isScopedStaff()')
    expect(fnBody('isAdmin')).toContain('isCmsPublisher()')
  })

  it('no catch-all match grants writes', () => {
    expect(rules).not.toMatch(/match \/\{document=\*\*\}/)
  })
})

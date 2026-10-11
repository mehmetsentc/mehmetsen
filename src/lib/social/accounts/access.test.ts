import { describe, expect, it } from 'vitest'
import {
  canManageAccount,
  canPublishToAccount,
  canViewAccount,
  ownershipFor,
  parseOwnershipRequest,
  ruleScopeProblem,
  type SocialActor,
} from './access'
import { ownershipKind, type SocialAccountOwnership } from './types'

const actor = (over: Partial<SocialActor> = {}): SocialActor => ({
  uid: 'u1',
  central: false,
  provinces: [],
  publisherManage: [],
  publisherPublish: [],
  isStaff: false,
  ...over,
})

const PERSONAL_U1: SocialAccountOwnership = { citySlug: null, publisherId: null, ownerUid: 'u1' }
const PERSONAL_U2: SocialAccountOwnership = { citySlug: null, publisherId: null, ownerUid: 'u2' }
const ANTALYA: SocialAccountOwnership = { citySlug: 'antalya', publisherId: null }
const ISTANBUL: SocialAccountOwnership = { citySlug: 'istanbul', publisherId: null }
const CENTRAL: SocialAccountOwnership = { citySlug: null, publisherId: null, central: true }
const PUB_A: SocialAccountOwnership = { citySlug: null, publisherId: 'pubA' }

describe('sosyal hesap sahipliği ve yetki', () => {
  it('normal kullanıcı yalnızca kendi hesabını görür / yönetir; başkasınınkini ve kurumsal hesapları değil', () => {
    const u1 = actor()
    expect(canManageAccount(u1, PERSONAL_U1)).toBe(true)
    expect(canViewAccount(u1, PERSONAL_U2)).toBe(false)
    expect(canPublishToAccount(u1, PERSONAL_U2)).toBe(false)
    for (const o of [ANTALYA, CENTRAL, PUB_A]) expect(canViewAccount(u1, o)).toBe(false)
  })

  it('merkez yöneticisi kurumsal hesapları yönetir, yayıncıyı yalnız görür, kişisel hesabı hiç görmez', () => {
    const c = actor({ uid: 'admin', central: true, isStaff: true })
    expect(canManageAccount(c, CENTRAL)).toBe(true)
    expect(canManageAccount(c, ANTALYA)).toBe(true)
    expect(canViewAccount(c, PUB_A)).toBe(true)
    expect(canPublishToAccount(c, PUB_A)).toBe(false)
    expect(canViewAccount(c, PERSONAL_U1)).toBe(false)
  })

  it('il yöneticisi yalnızca kendi ilinin hesabını yönetir', () => {
    const a = actor({ provinces: ['antalya'], isStaff: true })
    expect(canManageAccount(a, ANTALYA)).toBe(true)
    expect(canManageAccount(a, ISTANBUL)).toBe(false)
    expect(canManageAccount(a, CENTRAL)).toBe(false)
  })

  it('yayıncı: OWNER/ADMIN yönetir, EDITOR yalnız yayımlar; başka yayıncıya erişim yok', () => {
    const owner = actor({ publisherManage: ['pubA'], publisherPublish: ['pubA'] })
    const editor = actor({ publisherPublish: ['pubA'] })
    expect(canManageAccount(owner, PUB_A)).toBe(true)
    expect(canManageAccount(editor, PUB_A)).toBe(false)
    expect(canPublishToAccount(editor, PUB_A)).toBe(true)
    expect(canViewAccount(owner, { citySlug: null, publisherId: 'pubB' })).toBe(false)
  })

  it('yeni bağlantı sahipliği istemciden değil aktörün yetkisinden kurulur', () => {
    const u1 = actor()
    expect(ownershipFor(u1, { kind: 'user' })).toEqual(PERSONAL_U1)
    expect(ownershipFor(u1, { kind: 'central' })).toBeNull()
    expect(ownershipFor(u1, { kind: 'province', citySlug: 'antalya' })).toBeNull()
    expect(ownershipFor(u1, { kind: 'publisher', publisherId: 'pubA' })).toBeNull()
    const prov = actor({ provinces: ['antalya'] })
    expect(ownershipFor(prov, { kind: 'province', citySlug: 'antalya' })).toEqual(ANTALYA)
    expect(ownershipFor(prov, { kind: 'province', citySlug: 'istanbul' })).toBeNull()
    expect(ownershipKind(ownershipFor(actor({ central: true }), { kind: 'central' }))).toBe('central')
  })

  it('istemcinin gönderdiği ownerUid / karışık sahiplik kabul edilmez', () => {
    expect(parseOwnershipRequest({ kind: 'user', ownerUid: 'u2' })).toEqual({ kind: 'user' })
    expect(parseOwnershipRequest({ citySlug: 'antalya', publisherId: 'p' })).toBeNull()
    expect(parseOwnershipRequest({ kind: 'nope' })).toBeNull()
    expect(parseOwnershipRequest({ citySlug: 'antalya' })).toEqual({ kind: 'province', citySlug: 'antalya' })
  })

  it('kural kapsamı: il yöneticisi başka il / ulusal seçemez; merkez seçebilir; kişisel hesapta sınır', () => {
    const prov = actor({ provinces: ['antalya'] })
    expect(ruleScopeProblem(prov, ANTALYA, { geo: { kind: 'provinces', citySlugs: ['antalya'] }, dailyLimit: 5 })).toBeNull()
    expect(ruleScopeProblem(prov, ANTALYA, { geo: { kind: 'provinces', citySlugs: ['istanbul'] }, dailyLimit: 5 })).toContain('istanbul')
    expect(ruleScopeProblem(prov, ANTALYA, { geo: { kind: 'national' }, dailyLimit: 5 })).not.toBeNull()
    expect(ruleScopeProblem(actor({ central: true }), CENTRAL, { geo: { kind: 'national' }, dailyLimit: 5 })).toBeNull()
    expect(ruleScopeProblem(actor(), PERSONAL_U1, { geo: { kind: 'any' }, dailyLimit: 20 })).not.toBeNull()
    expect(ruleScopeProblem(actor(), PERSONAL_U1, { geo: { kind: 'any' }, dailyLimit: 5 })).toBeNull()
  })
})

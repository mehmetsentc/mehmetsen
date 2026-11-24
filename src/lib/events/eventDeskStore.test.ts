/** EVENT-DESK-1 — masa verisi: gelecek etkinlikler + masa kayıtları; kayıt etkinlik belgesine yazılmaz. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from '@/lib/social/accounts/testing/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => h.db }))

import { invalidateDeskCache, loadDesk, saveDesk } from './eventDeskStore'

const NOW = Date.parse('2026-11-24T21:10:00Z')

describe('eventDeskStore', () => {
  let fs: FakeFirestore
  beforeEach(async () => {
    fs = new FakeFirestore()
    h.db = fs
    invalidateDeskCache()
    const ev = fs.collection('events')
    await ev.doc('tm_1').set({ title: 'Cihan Mürtezaoğlu', category: 'concert', city: 'Çanakkale', citySlug: 'canakkale', venue: 'The Keep', startsAt: '2026-12-11T18:30:00.000Z', status: 'published', source: 'ticketmaster', provider: 'Ticketmaster', coverImageUrl: 'https://img/c.jpg' })
    await ev.doc('fs_1').set({ title: 'Kayısı Festivali', category: 'festival', city: 'Çanakkale', citySlug: 'canakkale', venue: 'Kepez', startsAt: '2027-07-01T07:00:00.000Z', status: 'published', source: 'firestore' })
    await ev.doc('old').set({ title: 'Geçmiş', category: 'concert', city: 'Ankara', citySlug: 'ankara', venue: 'X', startsAt: '2026-10-01T18:00:00.000Z', status: 'published' })
    await ev.doc('bad').set({ title: 'Kutu Oyunları Gecesi', category: 'party', city: 'Eskişehir', citySlug: 'eskisehir', venue: 'Gibi Cafe', startsAt: '2036-05-02T17:00:00.000Z', status: 'published', source: 'biletix', provider: 'Biletix' })
  })

  it('gelecek etkinlikler, görselsiz işareti ve şüpheli tarih', async () => {
    const { items, suspects } = await loadDesk(NOW)
    expect(items.map((i) => i.id)).toEqual(['tm_1', 'fs_1'])
    expect(items.find((i) => i.id === 'fs_1')!.hasImage).toBe(false)
    expect(suspects.map((s) => s.id)).toEqual(['bad'])
  })

  it('masa kaydı ayrı koleksiyona yazılır, etkinlik belgesi değişmez; önbellek yenilenir', async () => {
    await loadDesk(NOW)
    const saved = await saveDesk('fs_1', { coverUrl: 'https://img/k.jpg', info: { price: '100 TL' }, media: [{ id: 'm1abcd', kind: 'image', url: 'https://img/k.jpg', source: 'upload', rights: 'own' }] }, 'u1')
    expect(saved?.coverUrl).toBe('https://img/k.jpg')
    expect(saved?.media[0]!.addedBy).toBe('u1')
    const ev = (await fs.collection('events').doc('fs_1').get()).data() as Record<string, unknown>
    expect(ev.coverImageUrl).toBeUndefined()
    const { items } = await loadDesk(NOW)
    const it2 = items.find((i) => i.id === 'fs_1')!
    expect(it2.hasImage).toBe(true)
    expect(it2.desk.info.price).toBe('100 TL')
  })

  it('kısmi güncelleme: yalnız gönderilen alan değişir', async () => {
    await saveDesk('fs_1', { info: { price: '100 TL' } }, 'u1')
    const r = await saveDesk('fs_1', { info: { ageLimit: '+18' } }, 'u2')
    expect(r?.info).toMatchObject({ price: '100 TL', ageLimit: '+18' })
  })

  it('tarih düzeltilince şüpheliden listeye geçer; gizlenen listeden çıkar', async () => {
    await saveDesk('bad', { startsAtOverride: '2027-05-02T17:00:00.000Z' }, 'u1')
    await saveDesk('tm_1', { hidden: true }, 'u1')
    const { items, suspects } = await loadDesk(NOW)
    expect(suspects).toHaveLength(0)
    expect(items.map((i) => i.id)).toEqual(['bad', 'fs_1'])
  })

  it('olmayan etkinliğe yazmaz', async () => {
    expect(await saveDesk('yok_1', { hidden: true }, 'u1')).toBeNull()
    expect(await saveDesk('../kötü', { hidden: true }, 'u1')).toBeNull()
  })
})

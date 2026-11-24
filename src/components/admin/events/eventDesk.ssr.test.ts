import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
;(globalThis as unknown as { React: typeof React }).React = React
import { renderToString } from 'react-dom/server'
import type { NaEvent } from '@/types/event'
import { buildDesk, parseDeskRecord } from '@/lib/events/eventDesk'

vi.mock('@/lib/firebase/auth', () => ({ auth: { currentUser: null, onAuthStateChanged: () => () => {} } }))
vi.mock('@/lib/firebase/storage', () => ({ storage: {} }))
vi.mock('firebase/storage', () => ({ getDownloadURL: vi.fn(), ref: vi.fn(), uploadBytesResumable: vi.fn() }))
vi.mock('next/link', () => ({ default: (p: { href: string; children: unknown; className?: string }) => createElement('a', { href: p.href, className: p.className }, p.children as never) }))

const NOW = Date.parse('2026-11-24T21:10:00Z')
const ev: NaEvent = { id: 'fs_1', title: 'Kayısı Festivali', description: '', category: 'festival', city: 'Çanakkale', citySlug: 'canakkale', venue: 'Kepez', startsAt: '2027-07-01T07:00:00.000Z', createdAt: '', status: 'published', source: 'firestore' }

describe('Etkinlik Masası (sunucu tarafı ilk çizim)', () => {
  it('ana ekran yükleniyor durumunda çizilir', async () => {
    const { EventDesk } = await import('./EventDesk')
    const html = renderToString(createElement(EventDesk))
    for (const t of ['Şimdi senkronize et', 'Tüm iller', 'Bugünden sonra · tümü', 'Konser', 'Festival', 'Parti', 'Görseli olmayanlar', 'Etkinlikler yükleniyor']) expect(html).toContain(t)
  })

  it('stüdyo sekmeleri: haber, medya (görsel yok), bilgiler (eksik), video (önce haber)', async () => {
    const { EventStudio } = await import('./EventDesk')
    const item = buildDesk([ev], new Map([['fs_1', parseDeskRecord('fs_1', { info: { price: '100 TL' } })]]), NOW).items[0]!
    const base = { item, now: NOW, setTab: () => {}, gen: null, generating: false, onGenerate: () => {}, onSave: async () => null }
    const haber = renderToString(createElement(EventStudio, { ...base, tab: 'haber' }))
    expect(haber).toContain('AI ile etkinlik haberi oluştur')
    const medya = renderToString(createElement(EventStudio, { ...base, tab: 'medya' }))
    for (const t of ['Bu etkinliğin görseli yok', 'Bilgisayardan yükle', 'Video Kütüphanesi', 'Medyayı kaydet']) expect(medya).toContain(t)
    const bilgi = renderToString(createElement(EventStudio, { ...base, tab: 'bilgi' }))
    for (const t of ['Bilgi doluluğu', 'Kapı açılış', 'eksik', 'Sanatçı ve etkinlik notu', 'Kaydet ve haberi yeniden yaz']) expect(bilgi).toContain(t)
    const video = renderToString(createElement(EventStudio, { ...base, tab: 'video' }))
    for (const t of ['Sahne planı', 'Yer ve saat kartı', 'önce Haber sekmesinde']) expect(video).toContain(t)
  })

  it('haberi oluşturulmuş etkinlik: CMS ve video editörü bağlantıları', async () => {
    const { EventStudio } = await import('./EventDesk')
    const item = buildDesk([ev], new Map([['fs_1', parseDeskRecord('fs_1', { newsId: 'nabc123456', newsStatus: 'draft' })]]), NOW).items[0]!
    const base = { item, now: NOW, setTab: () => {}, gen: null, generating: false, onGenerate: () => {}, onSave: async () => null }
    expect(renderToString(createElement(EventStudio, { ...base, tab: 'haber' }))).toContain('/admin/news/nabc123456/edit')
    expect(renderToString(createElement(EventStudio, { ...base, tab: 'video' }))).toContain('/admin/video?news=nabc123456')
  })
})

import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
// the test runner compiles JSX with the classic runtime
;(globalThis as unknown as { React: typeof React }).React = React
import { renderToString } from 'react-dom/server'

vi.mock('@/lib/firebase/auth', () => ({ auth: { currentUser: null } }))
vi.mock('@/lib/firebase/storage', () => ({ storage: {} }))
vi.mock('firebase/storage', () => ({ getDownloadURL: vi.fn(), ref: vi.fn(), uploadBytesResumable: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams('') }))

describe('Video Merkezi (sunucu tarafı ilk çizim)', () => {
  it('giriş ekranı: dört başlangıç kartı ve eski stüdyo bağlantısı', async () => {
    const { VideoCenter } = await import('./VideoCenter')
    const html = renderToString(createElement(VideoCenter))
    for (const t of ['Video Merkezi', 'Haberden video', 'Metinden video', 'Kendi videonu yükle', 'Günün bülteni', 'Son projeler', 'Eski stüdyo']) expect(html).toContain(t)
    expect(html).toContain('/admin/media-studio/reels')
  })
  it('düzenleyici: araç şeridi, önizleme, ayrıntılar ve zaman çizelgesi', async () => {
    const { VideoEditor } = await import('./VideoEditor')
    const html = renderToString(createElement(VideoEditor, { start: { kind: 'project', id: 'st0123456789abcdef' }, onExit: () => {} }))
    for (const t of ['Medya', 'Haber', 'Anlatım', 'Ses', 'Müzik', 'Tür', 'Kapanış', 'Önizleme', 'Ayrıntılar', 'Görüntü', 'Başlık', 'Videoyu üret', 'Paylaş', 'nahaber.com']) expect(html).toContain(t)
  })
  it('eski stüdyo (yedek) ortak mantıkla hâlâ çiziliyor', async () => {
    const { StoryStudioPro } = await import('@/components/admin/social/StoryStudioPro')
    const html = renderToString(createElement(StoryStudioPro))
    for (const t of ['Video Stüdyosu', 'Haberden video', 'Konu']) expect(html).toContain(t)
  })
  it('Kendi videonu yükle / Günün bülteni yeni düzende sekmesiz açılır', async () => {
    const { ReelsStudio } = await import('@/components/admin/social/ReelsStudio')
    const up = renderToString(createElement(ReelsStudio, { lockedMode: 'upload', onBack: () => {} } as never))
    expect(up).toContain('Kendi videonu yükle')
    expect(up).toContain('1 · Video')
    expect(up).toContain('2 · Haber seç')
    const dg = renderToString(createElement(ReelsStudio, { lockedMode: 'digest', onBack: () => {} } as never))
    expect(dg).toContain('Günün bülteni')
    expect(dg).toContain('Haberleri seç (2–7)')
  })
})

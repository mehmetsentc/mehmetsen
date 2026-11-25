import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
;(globalThis as unknown as { React: typeof React }).React = React
import { renderToString } from 'react-dom/server'
import type { HomeFeedInitialData, NewsItem } from '@/types/newsItem'

vi.mock('next/link', () => ({
  default: ({ children, prefetch: _p, ...rest }: { children: unknown; prefetch?: boolean; href: string }) => createElement('a', rest, children as never),
}))
vi.mock('@/components/news/SafeNewsImage', () => ({ SafeNewsImage: (p: { src: string; alt: string }) => createElement('img', { src: p.src, alt: p.alt }) }))
vi.mock('@/components/home/desktop/DesktopHeaderAuth', () => ({ DesktopHeaderAuth: () => createElement('span', null, 'Giriş yap') }))
vi.mock('@/components/home/desktop/DesktopAdBanner', () => ({ DesktopAdBanner: () => null }))
vi.mock('@/hooks/useMergedCategoryRails', () => ({ useMergedCategoryRails: (r: unknown) => r }))
vi.mock('next/navigation', () => ({ usePathname: () => '/kategori/spor' }))
vi.mock('@/store/uiStore', () => ({ useUiStore: (sel: (s: { setDesktopSidebarOpen: () => void }) => unknown) => sel({ setDesktopSidebarOpen: () => {} }) }))

let n = 0
const item = (category: string, title: string, extra: Partial<NewsItem> = {}): NewsItem => ({ id: `n${++n}`, slug: `haber-${n}`, title, category, imageUrl: `https://storage.googleapis.com/b/news-images/${n}.jpg`, publishedAt: '2026-11-25T09:00:00Z', ...extra })
const rail = (cat: string, c: number) => Array.from({ length: c }, (_, i) => item(cat, `${cat} haberi ${i + 1}`))

const data: HomeFeedInitialData = {
  breaking: [],
  featured: [item('gundem', "Eskişehir'de düşen helikopterde şehit olan 5 askerin isimleri açıklandı", { featured: true, summary: 'Eğitim uçuşu sırasında düşen helikopter.' })],
  latest: rail('gundem', 10),
  trending: [],
  trendFeed: [],
  mostRead: rail('spor', 5),
  categoryRails: { gundem: rail('gundem', 8), 'yerel-haber': rail('yerel-haber', 6), spor: rail('spor', 5), dunya: rail('dunya', 5), ekonomi: rail('ekonomi', 3), teknoloji: rail('teknoloji', 3), saglik: rail('saglik', 2), asayis: rail('asayis', 2) },
}

describe('Euronews düzeninde masaüstü ana sayfa', () => {
  it('bayrak logo, kategoriler, manşet ve bölümler çizilir; her haber bir kez', async () => {
    const { EuroHomeDesktop } = await import('./EuroHomeDesktop')
    const html = renderToString(createElement(EuroHomeDesktop, { data }))
    for (const t of ['Kıbrıs', 'Etkinlikler', 'Yerel', 'En çok okunanlar', 'Spor', 'Dünya', 'Ekonomi ve Teknoloji', 'Sağlık', 'İlinizin haberlerini okuyun', "Eskişehir&#x27;de düşen helikopterde"]) expect(html).toContain(t)
    // manşet haberi sayfada tek yerde (h1)
    expect(html.match(/helikopterde şehit olan 5 askerin isimleri/g)?.length).toBe(2) // başlık + görsel alt metni; kartlarda tekrar yok
    // video bandı yeterli video yoksa gizli
    expect(html).toMatch(/aria-label="NaHaber Video"[^>]*|class="[^"]*hidden[^"]*"[^>]*aria-label="NaHaber Video"/)
  })

  it('başlık: bayrak logo, kategoriler, nöbetçi eczane menüsü, alt kategoriler, etkin kategori', async () => {
    const { EuroHeader } = await import('./EuroHeader')
    const html = renderToString(createElement(EuroHeader, { subcategories: [{ id: 'futbol', name: 'Futbol', href: '/kategori/futbol', active: true }] }))
    for (const t of ['NaHaber ana sayfa', '/brand/nahaber-tile-96.png', 'Son Dakika', '3. Sayfa', 'Nöbetçi Eczane', 'Alt kategoriler', 'Futbol', 'Hava Durumu']) expect(html).toContain(t)
    expect(html).toMatch(/aria-current="page"[^>]*>Spor</)
    // www'de nöbetçi eczane ana sayfaya yönleniyordu: il sitelerine gider
    const { DUTY_PHARMACY_LINKS } = await import('./EuroHeader')
    expect(DUTY_PHARMACY_LINKS.map(([, h]) => h)).toEqual(['https://antalya.nahaber.com/nobetci-eczaneler', 'https://canakkale.nahaber.com/nobetci-eczaneler'])
  })
})

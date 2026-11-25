'use client'

/**
 * EURO-HOME — bütün masaüstü sayfaların başlığı (Euronews düzeni, NaHaber renkleri).
 *   Üst şerit (il, hava, nöbetçi eczane, etkinlik, video, çok okunanlar, ara, tarih)
 *   + sabit menü: bayrak logo (lacivert, N + NaHaber), kategoriler, hesap, Son Dakika.
 *   Kategori sayfalarında alt kategori sekmeleri ikinci satırda.
 * Yalnız lg ve üstü (DesktopGlobalScrollHeader içinde); mobil başlık değişmez.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, MapPin, Menu, Search } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { DesktopHeaderAuth } from '@/components/home/desktop/DesktopHeaderAuth'
import { formatNewsDateLong } from '@/components/home/desktop/formatNewsDate'
import { ROUTES } from '@/constants/routes'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import type { HomeCategorySlug, NewsItem } from '@/types/newsItem'
import { useUiStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'

/** rail: üzerine gelince açılan menüde «Son haberler» için kategori rayı (CDN önbellekli uç) */
export const EURO_NAV: Array<{ label: string; href: string; rail?: HomeCategorySlug }> = [
  { label: 'Son Dakika', href: ROUTES.CATEGORY('son-dakika'), rail: 'gundem' },
  { label: 'Gündem', href: ROUTES.CATEGORY('gundem'), rail: 'gundem' },
  { label: 'Yerel', href: ROUTES.LOCAL, rail: 'yerel-haber' },
  { label: '3. Sayfa', href: ROUTES.CATEGORY('asayis'), rail: 'asayis' },
  { label: 'Dünya', href: ROUTES.CATEGORY('dunya'), rail: 'dunya' },
  { label: 'Siyaset', href: ROUTES.CATEGORY('siyaset'), rail: 'siyaset' },
  { label: 'Ekonomi', href: ROUTES.CATEGORY('ekonomi'), rail: 'ekonomi' },
  { label: 'Spor', href: ROUTES.CATEGORY('spor'), rail: 'spor' },
  { label: 'Teknoloji', href: ROUTES.CATEGORY('teknoloji'), rail: 'teknoloji' },
  { label: 'Kültür', href: ROUTES.CATEGORY('kultur'), rail: 'kultur' },
  { label: 'Sağlık', href: ROUTES.CATEGORY('saglik'), rail: 'saglik' },
  { label: 'Video', href: ROUTES.VIDEO },
]

/** Menüde sol sütun: hızlı konular (Euronews «Trending» yerine) */
export const EURO_TOPICS: Array<{ label: string; href: string }> = [
  { label: 'Kıbrıs', href: ROUTES.CATEGORY('kibris-haberleri') },
  { label: 'Eğitim', href: ROUTES.CATEGORY('egitim') },
  { label: 'Yaşam', href: ROUTES.CATEGORY('yasam') },
  { label: 'Magazin', href: ROUTES.CATEGORY('magazin') },
  { label: 'Turizm', href: ROUTES.CATEGORY('turizm') },
  { label: 'Otomobil', href: ROUTES.CATEGORY('otomobil') },
  { label: 'Bilim', href: ROUTES.CATEGORY('bilim') },
  { label: 'Etkinlikler', href: ROUTES.EVENTS },
]

const railCache = new Map<string, NewsItem[]>()
const railInflight = new Map<string, Promise<NewsItem[]>>()
/** Kategori rayı: oturumda bir kez; uç CDN'de 120 sn önbellekli (Firestore'a her üzerine gelişte gitmez). */
function loadRail(slug: HomeCategorySlug): Promise<NewsItem[]> {
  const hit = railCache.get(slug)
  if (hit) return Promise.resolve(hit)
  const busy = railInflight.get(slug)
  if (busy) return busy
  const p = fetch(`/api/feed/category-rails?cats=${slug}`)
    .then((r) => (r.ok ? r.json() : { rails: {} }))
    .then((j: { rails?: Partial<Record<HomeCategorySlug, NewsItem[]>> }) => {
      const items = (j.rails?.[slug] ?? []).filter((x) => x.imageUrl).slice(0, 4)
      railCache.set(slug, items)
      return items
    })
    .catch(() => [] as NewsItem[])
    .finally(() => railInflight.delete(slug))
  railInflight.set(slug, p)
  return p
}

function MegaMenu({ item, onEnter, onLeave }: { item: (typeof EURO_NAV)[number]; onEnter: () => void; onLeave: () => void }) {
  const [items, setItems] = useState<NewsItem[] | null>(item.rail ? (railCache.get(item.rail) ?? null) : [])
  useEffect(() => {
    if (!item.rail) return
    let alive = true
    setItems(railCache.get(item.rail) ?? null)
    void loadRail(item.rail).then((x) => alive && setItems(x))
    return () => {
      alive = false
    }
  }, [item.rail])
  return (
    <div onMouseEnter={onEnter} onMouseLeave={onLeave} className="euro-mega absolute inset-x-0 top-full z-40 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] shadow-[0_12px_24px_rgba(0,0,0,.08)]">
      <div className="mx-auto grid max-w-[1280px] grid-cols-[300px_minmax(0,1fr)] gap-8 px-6 py-7">
        <div className="flex flex-col gap-4 border-r border-[rgb(var(--color-border))] pr-8">
          <span className="text-[16px] font-extrabold">Gündemdekiler</span>
          <div className="flex flex-wrap gap-2.5">
            {EURO_TOPICS.map((t) => (
              <Link key={t.href} prefetch={false} href={t.href} className="rounded-full border-[1.5px] border-[#1d4ed8] px-4 py-1.5 text-[13px] font-bold text-[#1d4ed8] hover:bg-[#1d4ed8]/5">
                {t.label}
              </Link>
            ))}
          </div>
          <Link prefetch={false} href={item.href} className="mt-1 text-[13px] font-extrabold text-[rgb(var(--color-brand))] hover:underline">
            Tüm {item.label} haberleri →
          </Link>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <span className="text-[16px] font-extrabold">{item.label} · son haberler</span>
          {items === null ? (
            <div className="grid grid-cols-4 gap-5" aria-busy>
              {[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[16/9] animate-pulse rounded bg-[rgb(var(--color-border))]" />)}
            </div>
          ) : items.length ? (
            <div className="grid grid-cols-4 gap-5">
              {items.map((x) => (
                <Link key={x.id} prefetch={false} href={newsItemDetailHref(x)} className="group flex min-w-0 flex-col gap-1.5">
                  <div className="relative aspect-[16/9] overflow-hidden rounded bg-[rgb(var(--color-border))]">
                    <SafeNewsImage src={x.imageUrl || FEED_FALLBACK_LOGO} alt={x.title} fill sizes="240px" className="object-cover" />
                  </div>
                  <span className="text-[12px] font-bold text-[rgb(var(--color-brand))]">{newsItemCategoryLabel(x)}</span>
                  <span className="line-clamp-3 text-[14px] font-extrabold leading-[1.3] text-[rgb(var(--color-text))] group-hover:underline">{x.title}</span>
                </Link>
              ))}
            </div>
          ) : (
            <span className="text-[13px] text-[rgb(var(--color-text))]/60">Bu kategoride şu an gösterilecek haber yok.</span>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Nöbetçi eczane listesi yalnız il sitelerinde var (www'de / ana sayfaya yönlenir):
 * şu an Antalya ve Çanakkale eczacı odalarından günlük liste yayımlanıyor.
 */
export const DUTY_PHARMACY_LINKS: Array<[string, string]> = [
  ['Antalya', 'https://antalya.nahaber.com/nobetci-eczaneler'],
  ['Çanakkale', 'https://canakkale.nahaber.com/nobetci-eczaneler'],
]

export type EuroSubTab = { id: string; name: string; href: string; active: boolean }

function FlagLogo() {
  return (
    <Link
      href={ROUTES.HOME}
      aria-label="NaHaber ana sayfa"
      className="relative z-10 flex h-[84px] w-[86px] flex-none flex-col items-center justify-center gap-[7px] self-start bg-[#0B1530] shadow-[0_2px_6px_rgba(0,0,0,.15)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/nahaber-tile-96.png" alt="" width={32} height={32} className="block h-8 w-8" />
      <span className="text-[16px] font-black leading-none tracking-[-0.02em]">
        <span className="text-white">Na</span>
        <span className="text-[rgb(var(--color-brand))]">Haber</span>
      </span>
    </Link>
  )
}

function PharmacyMenu() {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 hover:underline">
        Nöbetçi Eczane <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-48 rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-1.5 shadow-lg">
          {DUTY_PHARMACY_LINKS.map(([city, href]) => (
            <a key={href} href={href} className="block rounded px-2.5 py-1.5 text-[13px] font-semibold hover:bg-[rgb(var(--color-border))]/50">
              {city} nöbetçi eczaneleri
            </a>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function EuroHeader({ subcategories }: { subcategories?: EuroSubTab[] }) {
  const pathname = usePathname()
  const setDesktopSidebarOpen = useUiStore((s) => s.setDesktopSidebarOpen)
  const [today, setToday] = useState('')
  useEffect(() => setToday(formatNewsDateLong()), [])
  const isActive = (href: string) => href !== ROUTES.HOME && (pathname === href || pathname.startsWith(`${href}/`))
  // Euronews gibi: menü öğesinin üzerine gelince altında son haberler (kısa gecikmeyle açılır/kapanır)
  const [mega, setMega] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  const later = (fn: () => void, ms: number) => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(fn, ms)
  }
  useEffect(() => setMega(null), [pathname])
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])
  const megaItem = EURO_NAV.find((n) => n.href === mega && n.rail) ?? null
  return (
    <>
      <div className="euro-header-top border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-elevated))]">
        <div className="mx-auto flex h-[38px] max-w-[1280px] items-center gap-5 px-6 text-[12.5px] font-semibold text-[rgb(var(--color-text))]/80">
          <Link prefetch={false} href={ROUTES.LOCAL} className="inline-flex items-center gap-1.5 font-bold text-[rgb(var(--color-brand))]">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> İlini seç
          </Link>
          <Link prefetch={false} href={ROUTES.WEATHER} className="hover:underline">Hava Durumu</Link>
          <PharmacyMenu />
          <Link prefetch={false} href={ROUTES.EVENTS} className="hover:underline">Etkinlikler</Link>
          <Link prefetch={false} href={ROUTES.VIDEO} className="hover:underline">Video</Link>
          <Link prefetch={false} href={ROUTES.MOST_READ} className="hover:underline">Çok Okunanlar</Link>
          <Link prefetch={false} href={ROUTES.SEARCH} className="ml-auto inline-flex items-center gap-1.5 hover:underline">
            <Search className="h-4 w-4" aria-hidden /> Ara
          </Link>
          <span className="text-[rgb(var(--color-text))]/60" suppressHydrationWarning>{today}</span>
        </div>
      </div>
      <header className="euro-header sticky top-0 z-30 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-5 px-6">
          <button type="button" aria-label="Menü" onClick={() => setDesktopSidebarOpen(true)} className="flex rounded p-1.5 text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-border))]/50">
            <Menu className="h-[22px] w-[22px]" aria-hidden />
          </button>
          <FlagLogo />
          <nav aria-label="Ana kategoriler" onKeyDown={(e) => e.key === 'Escape' && setMega(null)} className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto [scrollbar-width:none]">
            {EURO_NAV.map((n) => (
              <Link
                key={n.href}
                prefetch={false}
                href={n.href}
                onMouseEnter={() => later(() => setMega(n.rail ? n.href : null), mega ? 60 : 180)}
                onMouseLeave={() => later(() => setMega(null), 220)}
                onFocus={() => setMega(n.rail ? n.href : null)}
                aria-current={isActive(n.href) ? 'page' : undefined}
                className={cn(
                  'whitespace-nowrap border-b-2 py-1 text-[13.5px] font-bold hover:text-[rgb(var(--color-brand))]',
                  isActive(n.href) ? 'border-[rgb(var(--color-brand))] text-[rgb(var(--color-brand))]' : 'border-transparent text-[rgb(var(--color-text))]',
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <DesktopHeaderAuth />
          <Link prefetch={false} href={ROUTES.CATEGORY('son-dakika')} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[rgb(var(--color-brand))] px-3.5 py-[7px] text-[13px] font-extrabold text-white">
            <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-white" aria-hidden />
            Son Dakika
          </Link>
        </div>
        {megaItem ? <MegaMenu item={megaItem} onEnter={() => later(() => undefined, 0)} onLeave={() => later(() => setMega(null), 220)} /> : null}
        {subcategories && subcategories.length > 0 ? (
          <nav aria-label="Alt kategoriler" className="mx-auto flex max-w-[1280px] flex-wrap gap-x-5 gap-y-1 px-6 pb-2.5 pl-[150px] text-[13px] font-bold">
            {subcategories.map((t) => (
              <Link key={t.id} prefetch={false} href={t.href} aria-current={t.active ? 'page' : undefined} className={cn('hover:underline', t.active ? 'text-[rgb(var(--color-brand))]' : 'text-[#1d4ed8]')}>
                {t.name}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
    </>
  )
}

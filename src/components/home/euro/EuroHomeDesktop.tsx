'use client'

/**
 * EURO-HOME — masaüstü ana sayfa, Euronews düzeninde NaHaber (yalnız lg ve üstü; mobil değişmez).
 *   Üst şerit · bayrak logolu sabit menü · kategori satırı · manşet + son dakika · Yerel ·
 *   En çok okunanlar · NaHaber Video (koyu bant) · Spor · Dünya · Ekonomi ve Teknoloji ·
 *   Sağlık / 3. Sayfa · İl haberleri ve arama.
 * Veri: getHomeFeedInitialData (SSR) + useMergedCategoryRails (eksik kategori rayları, mevcut uç).
 * Video bandı önce eldeki haberlerin videolarını kullanır; yetmezse görünür olunca /api/feed/v2/videos
 * bir kez çağrılır (oturum boyunca önbellek).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, MapPin, Menu, Play, Search } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { DesktopHeaderAuth } from '@/components/home/desktop/DesktopHeaderAuth'
import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { formatNewsClockTime, formatNewsDateLong } from '@/components/home/desktop/formatNewsDate'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemCategoryLabel, newsItemDetailHref, sortNewsByDate } from '@/lib/newsItemUtils'
import { pickHomeFeedFeaturedPins } from '@/lib/featuredScope'
import { useMergedCategoryRails } from '@/hooks/useMergedCategoryRails'
import { ROUTES } from '@/constants/routes'
import { useUiStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'
import { HOME_CATEGORY_PORTAL_FETCH, HOME_FEATURED_LIMIT, type HomeCategorySlug, type HomeFeedInitialData, type NewsItem } from '@/types/newsItem'

const LAZY_RAILS: HomeCategorySlug[] = ['gundem', 'yerel-haber', 'spor', 'dunya', 'ekonomi', 'teknoloji', 'saglik', 'asayis', 'siyaset']

export const EURO_NAV: Array<{ label: string; href: string }> = [
  { label: 'Son Dakika', href: ROUTES.CATEGORY('son-dakika') },
  { label: 'Gündem', href: ROUTES.CATEGORY('gundem') },
  { label: 'Yerel', href: ROUTES.LOCAL },
  { label: '3. Sayfa', href: ROUTES.CATEGORY('asayis') },
  { label: 'Dünya', href: ROUTES.CATEGORY('dunya') },
  { label: 'Siyaset', href: ROUTES.CATEGORY('siyaset') },
  { label: 'Ekonomi', href: ROUTES.CATEGORY('ekonomi') },
  { label: 'Spor', href: ROUTES.CATEGORY('spor') },
  { label: 'Teknoloji', href: ROUTES.CATEGORY('teknoloji') },
  { label: 'Kültür', href: ROUTES.CATEGORY('kultur') },
  { label: 'Sağlık', href: ROUTES.CATEGORY('saglik') },
  { label: 'Video', href: ROUTES.VIDEO },
]

const SUB_NAV: Array<{ label: string; href: string }> = [
  { label: 'Kıbrıs', href: ROUTES.CATEGORY('kibris-haberleri') },
  { label: 'Eğitim', href: ROUTES.CATEGORY('egitim') },
  { label: 'Yaşam', href: ROUTES.CATEGORY('yasam') },
  { label: 'Magazin', href: ROUTES.CATEGORY('magazin') },
  { label: 'Turizm', href: ROUTES.CATEGORY('turizm') },
  { label: 'Otomobil', href: ROUTES.CATEGORY('otomobil') },
  { label: 'Bilim', href: ROUTES.CATEGORY('bilim') },
  { label: 'Etkinlikler', href: ROUTES.EVENTS },
]

export const EURO_CITIES: Array<[string, string]> = [
  ['Adana', 'adana'], ['Ankara', 'ankara'], ['Antalya', 'antalya'], ['Bursa', 'bursa'], ['Çanakkale', 'canakkale'], ['Diyarbakır', 'diyarbakir'],
  ['Erzurum', 'erzurum'], ['Eskişehir', 'eskisehir'], ['Gaziantep', 'gaziantep'], ['İstanbul', 'istanbul'], ['İzmir', 'izmir'], ['Kayseri', 'kayseri'],
  ['Konya', 'konya'], ['Mersin', 'mersin'], ['Samsun', 'samsun'], ['Trabzon', 'trabzon'], ['Van', 'van'], ['Batman', 'batman'],
]

const hasImage = (x: NewsItem | null | undefined): x is NewsItem => Boolean(x?.imageUrl?.trim())

/** Sırayla, tekrar etmeden haber alır (bir haber sayfada bir kez görünür). */
export function makePicker() {
  const used = new Set<string>()
  return (source: Array<NewsItem | null | undefined>, count: number, needImage = true): NewsItem[] => {
    const out: NewsItem[] = []
    for (const it of source) {
      if (out.length >= count) break
      if (!it?.id || used.has(it.id) || (needImage && !hasImage(it))) continue
      used.add(it.id)
      out.push(it)
    }
    return out
  }
}

type VideoCard = { id: string; title: string; image: string; href: string; category: string }
const VIDEO_CACHE_KEY = 'nh_euro_videos_v1'

function useVideoBand(pool: NewsItem[], visible: boolean): VideoCard[] {
  const local = useMemo(
    () =>
      pool
        .filter((x) => x.videoUrl && hasImage(x))
        .slice(0, 3)
        .map((x) => ({ id: x.id, title: x.title, image: x.imageUrl!, href: newsItemDetailHref(x), category: newsItemCategoryLabel(x) })),
    [pool],
  )
  const [remote, setRemote] = useState<VideoCard[] | null>(null)
  useEffect(() => {
    if (local.length >= 3 || !visible || remote) return
    try {
      const cached = sessionStorage.getItem(VIDEO_CACHE_KEY)
      if (cached) {
        setRemote(JSON.parse(cached) as VideoCard[])
        return
      }
    } catch {
      /* oturum önbelleği yoksa sorun değil */
    }
    let cancelled = false
    void fetch('/api/feed/v2/videos?limit=6', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { items?: Array<{ id: string; headline?: string; image?: string; slug?: string; category?: string }> } | null) => {
        if (cancelled || !j?.items) return
        const cards = j.items
          .filter((x) => x.image && x.headline)
          .slice(0, 3)
          .map((x) => ({ id: x.id, title: x.headline!, image: x.image!, href: ROUTES.NEWS_DETAIL(x.slug || x.id), category: newsItemCategoryLabel({ id: x.id, slug: x.slug ?? x.id, title: x.headline!, category: x.category }) }))
        setRemote(cards)
        try {
          sessionStorage.setItem(VIDEO_CACHE_KEY, JSON.stringify(cards))
        } catch {
          /* yok say */
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [local.length, visible, remote])
  return local.length >= 3 ? local : (remote ?? [])
}

function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (seen || !ref.current) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSeen(true), { rootMargin: '400px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [seen])
  return [ref, seen]
}

// ── parçalar ─────────────────────────────────────────────────────────────────
function Img({ item, className, priority = false, sizes = '400px' }: { item: NewsItem; className?: string; priority?: boolean; sizes?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded bg-[rgb(var(--color-border))]', className)}>
      <SafeNewsImage src={item.imageUrl || FEED_FALLBACK_LOGO} alt={item.title} fill sizes={sizes} priority={priority} className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
    </div>
  )
}

function Cat({ item, dark = false }: { item: NewsItem; dark?: boolean }) {
  const label = newsItemCategoryLabel(item)
  if (!label) return null
  return <span className={cn('text-[12px] font-bold', dark ? 'text-[#ff8a8f]' : 'text-[rgb(var(--color-brand))]')}>{label}</span>
}

function Card({ item, imgClass = 'aspect-[16/10]', size = 'text-[16px]', sizes }: { item: NewsItem; imgClass?: string; size?: string; sizes?: string }) {
  return (
    <article className="min-w-0">
      <Link prefetch={false} href={newsItemDetailHref(item)} className="group flex flex-col gap-2">
        <Img item={item} className={imgClass} sizes={sizes} />
        <Cat item={item} />
        <h3 className={cn('m-0 font-extrabold leading-[1.25] text-[rgb(var(--color-text))] group-hover:underline', size)}>{item.title}</h3>
      </Link>
    </article>
  )
}

function Row({ item, imgW = 'w-[150px]' }: { item: NewsItem; imgW?: string }) {
  return (
    <article className="min-w-0">
      <Link prefetch={false} href={newsItemDetailHref(item)} className="group flex items-start gap-3.5">
        <Img item={item} className={cn('aspect-[16/10] flex-none', imgW)} sizes="160px" />
        <span className="flex min-w-0 flex-col gap-1.5">
          <Cat item={item} />
          <span className="text-[15px] font-extrabold leading-[1.3] text-[rgb(var(--color-text))] group-hover:underline">{item.title}</span>
        </span>
      </Link>
    </article>
  )
}

function More({ href, dark = false }: { href: string; dark?: boolean }) {
  return (
    <div className="flex justify-end">
      <Link
        prefetch={false}
        href={href}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-4 py-2 text-[13px] font-bold',
          dark ? 'border-white text-white hover:bg-white/10' : 'border-[#1d4ed8] text-[#1d4ed8] hover:bg-[#1d4ed8]/5',
        )}
      >
        Daha fazlasını gör <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  )
}

function H2({ children, extra, dark = false }: { children: React.ReactNode; extra?: React.ReactNode; dark?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3.5">
      <h2 className={cn('m-0 text-[32px] font-extrabold tracking-[-0.02em]', dark ? 'text-white' : 'text-[rgb(var(--color-text))]')}>{children}</h2>
      {extra}
    </div>
  )
}

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

function EuroHeader() {
  const setDesktopSidebarOpen = useUiStore((s) => s.setDesktopSidebarOpen)
  const [today, setToday] = useState('')
  useEffect(() => setToday(formatNewsDateLong()), [])
  return (
    <>
      <div className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-elevated))]">
        <div className="mx-auto flex h-[38px] max-w-[1280px] items-center gap-5 px-6 text-[12.5px] font-semibold text-[rgb(var(--color-text))]/80">
          <Link prefetch={false} href={ROUTES.LOCAL} className="inline-flex items-center gap-1.5 font-bold text-[rgb(var(--color-brand))]">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> İlini seç
          </Link>
          <Link prefetch={false} href={ROUTES.WEATHER} className="hover:underline">Hava Durumu</Link>
          <Link prefetch={false} href="/nobetci-eczaneler" className="hover:underline">Nöbetçi Eczane</Link>
          <Link prefetch={false} href={ROUTES.EVENTS} className="hover:underline">Etkinlikler</Link>
          <Link prefetch={false} href={ROUTES.VIDEO} className="hover:underline">Video</Link>
          <Link prefetch={false} href={ROUTES.MOST_READ} className="hover:underline">Çok Okunanlar</Link>
          <Link prefetch={false} href={ROUTES.SEARCH} className="ml-auto inline-flex items-center gap-1.5 hover:underline">
            <Search className="h-4 w-4" aria-hidden /> Ara
          </Link>
          <span className="text-[rgb(var(--color-text))]/60" suppressHydrationWarning>{today}</span>
        </div>
      </div>
      <header className="sticky top-0 z-30 h-16 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-5 px-6">
          <button type="button" aria-label="Menü" onClick={() => setDesktopSidebarOpen(true)} className="flex rounded p-1.5 text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-border))]/50">
            <Menu className="h-[22px] w-[22px]" aria-hidden />
          </button>
          <FlagLogo />
          <nav aria-label="Ana kategoriler" className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto [scrollbar-width:none]">
            {EURO_NAV.map((n) => (
              <Link key={n.href} prefetch={false} href={n.href} className="whitespace-nowrap text-[13.5px] font-bold text-[rgb(var(--color-text))] hover:text-[rgb(var(--color-brand))]">
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
      </header>
    </>
  )
}

// ── sayfa ────────────────────────────────────────────────────────────────────
export function EuroHomeDesktop({ data }: { data: HomeFeedInitialData }) {
  const rails = useMergedCategoryRails(data.categoryRails, LAZY_RAILS, 800, HOME_CATEGORY_PORTAL_FETCH)
  const [videoRef, videoSeen] = useInView<HTMLDivElement>()

  const L = useMemo(() => {
    const pick = makePicker()
    const r = (k: HomeCategorySlug) => rails[k] ?? []
    const pins = pickHomeFeedFeaturedPins(data.featured, false, HOME_FEATURED_LIMIT)
    const gundem = r('gundem')
    const hero = pick([...pins, ...gundem, ...data.latest], 1)[0] ?? null
    const heroCards = pick([...pins, ...gundem, ...data.latest], 3)
    const heroRows = pick([...gundem, ...r('siyaset'), ...data.latest], 4)
    const breaking = (data.breaking.length >= 3 ? data.breaking : sortNewsByDate(data.latest)).filter((x) => x.id !== hero?.id).slice(0, 5)
    const yerelBig = pick(r('yerel-haber'), 2)
    const yerelRows = pick(r('yerel-haber'), 4)
    const mostRead = (data.mostRead.length ? data.mostRead : data.trending).slice(0, 5)
    const spor = pick(r('spor'), 4)
    const dunyaBig = pick(r('dunya'), 2)
    const dunyaRows = pick(r('dunya'), 3)
    const ekoTek = [...pick(r('ekonomi'), 2), ...pick(r('teknoloji'), 2)]
    const saglik = pick(r('saglik'), 2)
    const asayis = pick(r('asayis'), 2)
    const videoPool = [...data.featured, ...data.latest, ...Object.values(rails).flat()] as NewsItem[]
    return { hero, heroCards, heroRows, breaking, yerelBig, yerelRows, mostRead, spor, dunyaBig, dunyaRows, ekoTek, saglik, asayis, videoPool }
  }, [data, rails])

  const videos = useVideoBand(L.videoPool, videoSeen)

  return (
    <div className="euro-home bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))]" data-testid="euro-home-desktop">
      <EuroHeader />
      <div className="mx-auto flex max-w-[1280px] flex-col gap-12 px-6 pb-14 pt-4">
        <nav aria-label="Diğer kategoriler" className="flex flex-wrap justify-center gap-x-2.5 gap-y-1 text-[13px] font-bold">
          {SUB_NAV.map((s, i) => (
            <span key={s.href} className="inline-flex items-center gap-2.5">
              {i > 0 ? <span className="text-[rgb(var(--color-text))]/40" aria-hidden>·</span> : null}
              <Link prefetch={false} href={s.href} className="text-[#1d4ed8] hover:underline">{s.label}</Link>
            </span>
          ))}
        </nav>

        {L.hero ? (
          <section className="grid grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,300px)] items-start gap-6">
            <Link prefetch={false} href={newsItemDetailHref(L.hero)} className="group flex flex-col gap-3">
              <Cat item={L.hero} />
              <h1 className="m-0 text-[34px] font-black leading-[1.08] tracking-[-0.025em] text-[rgb(var(--color-text))] group-hover:underline">{L.hero.title}</h1>
              {L.hero.summary || L.hero.description ? (
                <p className="m-0 line-clamp-5 text-[14.5px] leading-[1.55] text-[rgb(var(--color-text))]/80">{L.hero.summary || L.hero.description}</p>
              ) : null}
              <span className="text-[12px] text-[rgb(var(--color-text))]/60">{formatNewsClockTime(L.hero.publishedAt ?? L.hero.createdAt)}</span>
            </Link>
            <Link prefetch={false} href={newsItemDetailHref(L.hero)} className="group block">
              <Img item={L.hero} className="aspect-[16/10]" priority sizes="(max-width: 1280px) 50vw, 620px" />
            </Link>
            <aside className="flex flex-col gap-1 rounded-md border border-[rgb(var(--color-border))] px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[rgb(var(--color-brand))]" aria-hidden />
                <h2 className="m-0 text-[16px] font-extrabold">Son dakika</h2>
              </div>
              <ul className="m-0 mb-2 mt-1.5 list-none p-0">
                {L.breaking.map((x) => (
                  <li key={x.id} className="grid grid-cols-[44px_minmax(0,1fr)] gap-2 border-t border-[rgb(var(--color-border))] py-3">
                    <span className="text-[12px] font-semibold text-[rgb(var(--color-text))]/60">{formatNewsClockTime(x.publishedAt ?? x.createdAt)}</span>
                    <Link prefetch={false} href={newsItemDetailHref(x)} className="group flex flex-col gap-0.5">
                      <Cat item={x} />
                      <span className="text-[13.5px] font-bold leading-[1.3] group-hover:underline">{x.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <More href={ROUTES.CATEGORY('son-dakika')} />
            </aside>
          </section>
        ) : null}

        {L.heroCards.length || L.heroRows.length ? (
          <section className="-mt-5 flex flex-col gap-7">
            {L.heroCards.length ? (
              <div className="grid grid-cols-3 gap-5">
                {L.heroCards.map((x) => <Card key={x.id} item={x} />)}
              </div>
            ) : null}
            {L.heroRows.length ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                {L.heroRows.map((x) => <Row key={x.id} item={x} />)}
              </div>
            ) : null}
          </section>
        ) : null}

        <DesktopAdBanner slot="leaderboard-top" size="large" />

        {L.yerelBig.length ? (
          <section className="flex flex-col gap-5 border-t-[3px] border-[rgb(var(--color-text))] pt-5">
            <H2
              extra={
                <>
                  <Link prefetch={false} href={ROUTES.LOCAL} className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--color-brand))]/10 px-3 py-1.5 text-[13px] font-extrabold text-[rgb(var(--color-brand))]">
                    <MapPin className="h-3.5 w-3.5" aria-hidden /> İlini seç
                  </Link>
                  <span className="text-[13px] text-[rgb(var(--color-text))]/60">81 ilden haberler</span>
                </>
              }
            >
              Yerel
            </H2>
            <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-6">
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-5">
                  {L.yerelBig.map((x) => <Card key={x.id} item={x} size="text-[19px]" sizes="460px" />)}
                </div>
                {L.yerelRows.length ? (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                    {L.yerelRows.map((x) => <Row key={x.id} item={x} />)}
                  </div>
                ) : null}
                <More href={ROUTES.LOCAL} />
              </div>
              <aside className="flex flex-col gap-3 rounded-md border border-[rgb(var(--color-border))] p-4">
                <h3 className="m-0 text-[16px] font-extrabold">İl haberleri</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {EURO_CITIES.map(([name, slug]) => (
                    <Link key={slug} prefetch={false} href={ROUTES.LOCAL_CITY(slug)} className="text-[14px] font-bold text-[#1d4ed8] hover:underline">{name}</Link>
                  ))}
                </div>
                <Link prefetch={false} href={ROUTES.LOCAL} className="text-[13px] font-bold text-[rgb(var(--color-brand))] hover:underline">81 ilin tamamı →</Link>
              </aside>
            </div>
          </section>
        ) : null}

        {L.mostRead.length >= 3 ? (
          <section className="flex flex-col gap-5">
            <H2>En çok okunanlar</H2>
            <ol className="m-0 grid list-none grid-cols-5 gap-6 p-0">
              {L.mostRead.map((x, i) => (
                <li key={x.id} className="min-w-0">
                  <Link prefetch={false} href={newsItemDetailHref(x)} className="group grid grid-cols-[60px_minmax(0,1fr)] items-center gap-2.5">
                    <span className="text-[88px] font-extrabold leading-[0.85] tracking-[-0.04em] text-[rgb(var(--color-brand))]">{i + 1}</span>
                    <span className="line-clamp-5 text-[15.5px] font-extrabold leading-[1.25] group-hover:underline">{x.title}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {/* gözcü her zaman görünür: gizli (display:none) bölüm hiç «görünmez», video hiç yüklenmezdi */}
        <div ref={videoRef} aria-hidden className="-my-6 h-0" />
        <section className={cn('flex flex-col gap-5 rounded-lg bg-[#101826] px-7 pb-6 pt-7 text-white', videos.length < 3 && 'hidden')} aria-label="NaHaber Video">
          <H2 dark extra={<span className="text-[13px] text-[#b7c0cc]">Reels · Shorts · haber videoları</span>}>NaHaber Video</H2>
          <div className="grid grid-cols-3 gap-5">
            {videos.map((v) => (
              <article key={v.id} className="min-w-0">
                <Link prefetch={false} href={v.href} className="group flex flex-col gap-2">
                  <div className="relative aspect-[16/10] overflow-hidden rounded bg-white/10">
                    <SafeNewsImage src={v.image} alt={v.title} fill sizes="400px" className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                    <span className="absolute bottom-2.5 right-2.5 flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgb(var(--color-brand))]">
                      <Play className="h-3.5 w-3.5 fill-white text-white" aria-hidden />
                    </span>
                  </div>
                  {v.category ? <span className="text-[12px] font-bold text-[#ff8a8f]">{v.category}</span> : null}
                  <h3 className="m-0 text-[16px] font-extrabold leading-[1.25] text-white group-hover:underline">{v.title}</h3>
                </Link>
              </article>
            ))}
          </div>
          <More href={ROUTES.VIDEO} dark />
        </section>

        {L.spor.length >= 4 ? (
          <section className="flex flex-col gap-5">
            <H2>Spor</H2>
            <div className="grid grid-cols-4 gap-5">{L.spor.map((x) => <Card key={x.id} item={x} size="text-[15px]" sizes="300px" />)}</div>
            <More href={ROUTES.CATEGORY('spor')} />
          </section>
        ) : null}

        <DesktopAdBanner slot="leaderboard-mid" />

        {L.dunyaBig.length >= 2 ? (
          <section className="flex flex-col gap-5">
            <H2>Dünya</H2>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px] items-start gap-6">
              {L.dunyaBig.map((x) => <Card key={x.id} item={x} size="text-[18px]" sizes="420px" />)}
              <div className="flex flex-col gap-4">{L.dunyaRows.map((x) => <Row key={x.id} item={x} imgW="w-[110px]" />)}</div>
            </div>
            <More href={ROUTES.CATEGORY('dunya')} />
          </section>
        ) : null}

        {L.ekoTek.length >= 4 ? (
          <section className="flex flex-col gap-5">
            <H2>Ekonomi ve Teknoloji</H2>
            <div className="grid grid-cols-4 gap-5">{L.ekoTek.map((x) => <Card key={x.id} item={x} size="text-[15px]" sizes="300px" />)}</div>
            <More href={ROUTES.CATEGORY('ekonomi')} />
          </section>
        ) : null}

        {L.saglik.length || L.asayis.length ? (
          <section className="grid grid-cols-2 gap-8">
            {L.saglik.length ? (
              <div className="flex flex-col gap-4">
                <H2>Sağlık</H2>
                {L.saglik.map((x) => <Row key={x.id} item={x} imgW="w-[180px]" />)}
              </div>
            ) : <div />}
            {L.asayis.length ? (
              <div className="flex flex-col gap-4">
                <H2>3. Sayfa</H2>
                {L.asayis.map((x) => <Row key={x.id} item={x} imgW="w-[180px]" />)}
              </div>
            ) : null}
          </section>
        ) : null}

        <DesktopAdBanner slot="leaderboard-bottom" size="large" />

        <section className="flex flex-col items-center gap-5 border-t border-[rgb(var(--color-border))] pt-9 text-center">
          <p className="m-0 text-[24px] font-medium italic text-[rgb(var(--color-text))]/85">“81 ilin haberi, tek adreste: NaHaber”</p>
          <span className="text-[14px] font-extrabold">İlinizin haberlerini okuyun</span>
          <div className="grid grid-cols-6 gap-x-7 gap-y-3">
            {EURO_CITIES.map(([name, slug]) => (
              <Link key={slug} prefetch={false} href={ROUTES.LOCAL_CITY(slug)} className="text-[14px] font-bold text-[#1d4ed8] hover:underline">{name}</Link>
            ))}
          </div>
          <form action={ROUTES.SEARCH} method="get" role="search" className="flex w-[360px] max-w-full">
            <label htmlFor="euro-search" className="sr-only">Haberlerde ara</label>
            <input id="euro-search" name="q" type="search" placeholder="Haberlerde ara" className="h-10 flex-1 rounded-l border border-r-0 border-[rgb(var(--color-border))] bg-transparent px-3 text-[14px]" />
            <button type="submit" aria-label="Ara" className="flex h-10 w-11 items-center justify-center rounded-r bg-[#1d4ed8] text-white">
              <Search className="h-4 w-4" aria-hidden />
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}

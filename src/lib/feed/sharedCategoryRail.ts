import {
  getSwipeableFeedDestinations,
  resolveSwipeCategoryKey,
  type SwipeDestination,
} from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { categoryTabFromId, type FeedV2Tab } from '@/lib/feed/feedV2Tabs'

export type NewsSurface = 'home' | 'akis'

/** Canonical all/default chip — same destination id as getSwipeableFeedDestinations()[0]. */
export const SHARED_RAIL_ALL_ID = 'feed'

/**
 * Visible label for the all/default chip.
 * "Ana Sayfa" is the surface toggle; the rail chip means "no category filter".
 */
export function sharedRailChipLabel(dest: SwipeDestination): string {
  return dest.id === SHARED_RAIL_ALL_ID ? 'Tümü' : dest.label
}

export function getSharedRailDestinations(): SwipeDestination[] {
  return getSwipeableFeedDestinations()
}

export function resolveNewsSurface(pathname: string): NewsSurface | null {
  if (pathname === ROUTES.FEED_V2 || pathname.startsWith(`${ROUTES.FEED_V2}/`)) {
    return 'akis'
  }
  if (
    pathname === ROUTES.FEED ||
    pathname === ROUTES.HOME ||
    pathname === '/' ||
    pathname.startsWith('/kategori/') ||
    pathname === ROUTES.LOCAL ||
    pathname.startsWith(`${ROUTES.LOCAL}/`) ||
    pathname === ROUTES.SKOR ||
    pathname.startsWith(`${ROUTES.SKOR}/`) ||
    pathname === ROUTES.GAMES ||
    pathname.startsWith(`${ROUTES.GAMES}/`)
  ) {
    return 'home'
  }
  return null
}

function parseSearch(search: string): URLSearchParams {
  const raw = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(raw)
}

/** Canonical shared-rail id from the current route (ids, not display labels). */
export function resolveSharedCategoryId(pathname: string, search = ''): string {
  if (pathname === ROUTES.FEED_V2 || pathname.startsWith(`${ROUTES.FEED_V2}/`)) {
    const params = parseSearch(search)
    const category = params.get('category')?.trim().toLowerCase() || null
    if (category) {
      const dest = getSharedRailDestinations().find((d) => d.id === category)
      if (dest) return dest.id
      const tab = categoryTabFromId(category)
      if (tab?.category) return tab.category
      if (tab?.mode === 'local' || category === 'yerel') return 'yerel'
    }
    const mode = params.get('mode')?.trim().toLowerCase()
    if (mode === 'local') return 'yerel'
    return SHARED_RAIL_ALL_ID
  }

  return resolveSwipeCategoryKey(pathname) ?? SHARED_RAIL_ALL_ID
}

export function readSharedCategoryId(pathname: string): string {
  const search = typeof window !== 'undefined' ? window.location.search : ''
  return resolveSharedCategoryId(pathname, search)
}

export function hrefForNewsSurface(surface: NewsSurface, categoryId: string): string {
  const dests = getSharedRailDestinations()
  const dest = dests.find((d) => d.id === categoryId) ?? dests[0]!

  if (surface === 'home') return dest.href

  // Skor / Oyunlar are not Smart Feed categories — fall back to personalized Akış.
  if (dest.id === 'skor' || dest.id === 'oyunlar') return ROUTES.FEED_V2
  if (dest.id === SHARED_RAIL_ALL_ID) return ROUTES.FEED_V2
  if (dest.id === 'yerel') return `${ROUTES.FEED_V2}?mode=local`
  return `${ROUTES.FEED_V2}?category=${encodeURIComponent(dest.id)}`
}

export function newsSurfaceToggleHref(target: NewsSurface, pathname: string, search = ''): string {
  return hrefForNewsSurface(target, resolveSharedCategoryId(pathname, search))
}

export type SharedRailAkisItem =
  | { destId: string; kind: 'tab'; tab: FeedV2Tab }
  | { destId: string; kind: 'link'; href: string }

export function sharedRailAkisItem(dest: SwipeDestination): SharedRailAkisItem {
  if (dest.id === SHARED_RAIL_ALL_ID) {
    return {
      destId: dest.id,
      kind: 'tab',
      tab: {
        id: 'personal',
        kind: 'mode',
        label: sharedRailChipLabel(dest),
        mode: 'personal',
      },
    }
  }
  if (dest.id === 'skor' || dest.id === 'oyunlar') {
    return { destId: dest.id, kind: 'link', href: dest.href }
  }
  const tab = categoryTabFromId(dest.id)
  if (tab) return { destId: dest.id, kind: 'tab', tab }
  return { destId: dest.id, kind: 'link', href: dest.href }
}

export function isAkisRailChipActive(destId: string, activeTabId: string): boolean {
  if (destId === SHARED_RAIL_ALL_ID) return activeTabId === 'personal'
  if (destId === 'yerel') return activeTabId === 'yerel' || activeTabId === 'local'
  return activeTabId === destId
}

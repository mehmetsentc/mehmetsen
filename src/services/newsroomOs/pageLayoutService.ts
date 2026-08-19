/**
 * Versioned page layouts for Page Controls / Global Dizilim.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { PageLayout, PageLayoutBlock, PageLayoutStatus } from '@/types/newsroomOs'

function layoutsCol() {
  return getAdminFirestore().collection(Collections.PAGE_LAYOUTS)
}

function versionsCol() {
  return getAdminFirestore().collection(Collections.PAGE_LAYOUT_VERSIONS)
}

const HOME_DEFAULT_BLOCKS: PageLayoutBlock[] = [
  { id: 'manchet', kind: 'manchet', title: 'Manşet', active: true, order: 0, limit: 5, source: 'algorithmic', desktopVisible: true, mobileVisible: true },
  { id: 'breaking', kind: 'breaking', title: 'Son Dakika', active: true, order: 1, limit: 8, source: 'algorithmic', desktopVisible: true, mobileVisible: true },
  { id: 'featured', kind: 'featured', title: 'Öne Çıkanlar', active: true, order: 2, limit: 6, source: 'algorithmic', desktopVisible: true, mobileVisible: true },
  { id: 'local', kind: 'local', title: 'Yerel', active: true, order: 3, limit: 8, source: 'algorithmic', desktopVisible: true, mobileVisible: true },
  { id: 'gundem', kind: 'category_rail', title: 'Türkiye', active: true, order: 4, categoryId: 'gundem', limit: 8, source: 'algorithmic', desktopVisible: true, mobileVisible: true },
  { id: 'dunya', kind: 'category_rail', title: 'Dünya', active: true, order: 5, categoryId: 'dunya', limit: 6, source: 'algorithmic', desktopVisible: true, mobileVisible: true },
  { id: 'ekonomi', kind: 'category_rail', title: 'Ekonomi', active: true, order: 6, categoryId: 'ekonomi', limit: 6, source: 'algorithmic', desktopVisible: true, mobileVisible: true },
  { id: 'spor', kind: 'category_rail', title: 'Spor', active: true, order: 7, categoryId: 'spor', limit: 6, source: 'algorithmic', desktopVisible: true, mobileVisible: true },
  { id: 'video', kind: 'video', title: 'Video', active: true, order: 8, limit: 6, source: 'algorithmic', desktopVisible: true, mobileVisible: true },
  { id: 'reels', kind: 'reels', title: 'Reels', active: true, order: 9, limit: 10, source: 'algorithmic', desktopVisible: true, mobileVisible: true },
]

export function defaultPageLayout(pageKey: string, label: string): PageLayout {
  return {
    id: pageKey,
    pageKey,
    label,
    status: 'draft',
    version: 1,
    blocks: pageKey === 'home' ? HOME_DEFAULT_BLOCKS : [],
    publishedBlocks: [],
    updatedAt: Date.now(),
    updatedBy: null,
    publishedAt: null,
  }
}

export async function getPageLayout(pageKey: string): Promise<PageLayout> {
  const snap = await layoutsCol().doc(pageKey).get()
  if (!snap.exists) return defaultPageLayout(pageKey, pageKey)
  return { ...(snap.data() as PageLayout), id: pageKey, pageKey }
}

export async function listPageLayouts(): Promise<PageLayout[]> {
  const snap = await layoutsCol().limit(50).get()
  if (snap.empty) {
    return [
      defaultPageLayout('home', 'Ana Sayfa'),
      defaultPageLayout('feed', 'Feed'),
      defaultPageLayout('local', 'Yerel'),
      defaultPageLayout('discover', 'Keşfet'),
      defaultPageLayout('breaking', 'Son Dakika'),
      defaultPageLayout('reels', 'Reels'),
      defaultPageLayout('video', 'Video'),
    ]
  }
  return snap.docs.map((d) => ({ ...(d.data() as PageLayout), id: d.id, pageKey: d.id }))
}

export async function savePageLayoutDraft(
  pageKey: string,
  patch: { label?: string; blocks?: PageLayoutBlock[]; updatedBy?: string | null }
): Promise<PageLayout> {
  const current = await getPageLayout(pageKey)
  const next: PageLayout = {
    ...current,
    label: patch.label ?? current.label,
    blocks: patch.blocks ?? current.blocks,
    publishedBlocks: current.publishedBlocks ?? [],
    status: 'draft',
    version: current.version + 1,
    updatedAt: Date.now(),
    updatedBy: patch.updatedBy ?? current.updatedBy ?? null,
  }
  await layoutsCol().doc(pageKey).set(next, { merge: true })
  await versionsCol().add({
    ...next,
    layoutId: pageKey,
    snapshotAt: Date.now(),
  })
  return next
}

export async function previewPageLayout(pageKey: string, updatedBy?: string | null): Promise<PageLayout> {
  const current = await getPageLayout(pageKey)
  const next: PageLayout = {
    ...current,
    status: 'preview',
    updatedAt: Date.now(),
    updatedBy: updatedBy ?? current.updatedBy ?? null,
  }
  await layoutsCol().doc(pageKey).set(next, { merge: true })
  await versionsCol().add({ ...next, layoutId: pageKey, snapshotAt: Date.now(), event: 'preview' })
  return next
}

export async function publishPageLayout(
  pageKey: string,
  updatedBy?: string | null
): Promise<PageLayout> {
  const current = await getPageLayout(pageKey)
  const next: PageLayout = {
    ...current,
    status: 'published' satisfies PageLayoutStatus,
    publishedBlocks: current.blocks,
    publishedAt: Date.now(),
    updatedAt: Date.now(),
    updatedBy: updatedBy ?? current.updatedBy ?? null,
  }
  await layoutsCol().doc(pageKey).set(next, { merge: true })
  await versionsCol().add({
    ...next,
    layoutId: pageKey,
    snapshotAt: Date.now(),
    event: 'publish',
  })
  return next
}

export async function rollbackPageLayout(pageKey: string, updatedBy?: string | null): Promise<PageLayout> {
  const versions = await listPageLayoutVersions(pageKey, 20)
  const previous = versions.find((v) => (v as { event?: string }).event === 'publish') || versions[1]
  const current = await getPageLayout(pageKey)
  const blocks = ((previous as { blocks?: PageLayoutBlock[] } | undefined)?.blocks ?? current.publishedBlocks ?? current.blocks) as PageLayoutBlock[]
  const next: PageLayout = {
    ...current,
    blocks,
    status: 'draft',
    version: current.version + 1,
    updatedAt: Date.now(),
    updatedBy: updatedBy ?? current.updatedBy ?? null,
  }
  await layoutsCol().doc(pageKey).set(next, { merge: true })
  await versionsCol().add({ ...next, layoutId: pageKey, snapshotAt: Date.now(), event: 'rollback' })
  return next
}

export async function listPageLayoutVersions(pageKey: string, limit = 20) {
  const snap = await versionsCol().where('layoutId', '==', pageKey).limit(Math.min(limit, 50)).get()
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  rows.sort((a, b) => Number((b as { snapshotAt?: number }).snapshotAt ?? 0) - Number((a as { snapshotAt?: number }).snapshotAt ?? 0))
  return rows
}

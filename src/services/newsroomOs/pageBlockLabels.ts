import type { PageBlockKind, PageLayoutStatus } from '@/types/newsroomOs'

export const PAGE_BLOCK_KIND_LABELS: Record<PageBlockKind, string> = {
  manchet: 'Manşet',
  breaking: 'Son Dakika',
  featured: 'Öne Çıkanlar',
  category_rail: 'Kategori bandı',
  local: 'Yerel',
  video: 'Video',
  reels: 'Reels',
  custom: 'Özel blok',
}

export const PAGE_BLOCK_SOURCE_LABELS: Record<string, string> = {
  algorithmic: 'Algoritmik',
  manual: 'Manuel seçim',
}

export const PAGE_LAYOUT_STATUS_LABELS: Record<PageLayoutStatus, string> = {
  draft: 'Taslak',
  preview: 'Önizleme',
  published: 'Yayında',
  archived: 'Arşiv',
}

export function pageBlockKindLabel(kind: string): string {
  return PAGE_BLOCK_KIND_LABELS[kind as PageBlockKind] || kind
}

export function pageBlockSourceLabel(source: string): string {
  return PAGE_BLOCK_SOURCE_LABELS[source] || source
}

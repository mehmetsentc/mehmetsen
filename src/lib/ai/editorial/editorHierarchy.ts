import type { AiEditorDocument } from '@/types/aiEditor'
import { isExpandedHierarchyCircuitOpen } from './scaleCircuitBreaker'

/** Geographic newsroom layer for routing + Admin grouping. */
export type AiEditorLayer = 'national' | 'country' | 'province' | 'district'

export function isExpandedEditorHierarchyEnabled(): boolean {
  if (isExpandedHierarchyCircuitOpen()) return false
  return process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED === 'true'
}

export function countryEditorSlug(countryCode: string, categoryKey?: string | null): string {
  const code = countryCode.trim().toLowerCase()
  const cat = categoryKey?.trim().toLowerCase()
  if (!cat || cat === 'genel') return `ulke-${code}`
  return `ulke-${code}-${cat}`
}

export function districtEditorSlug(
  provinceSlug: string,
  districtSlug: string,
  categoryKey?: string | null
): string {
  const province = provinceSlug.trim().toLowerCase()
  const district = districtSlug.trim().toLowerCase()
  const cat = categoryKey?.trim().toLowerCase()
  if (!cat) return `ilce-${province}-${district}`
  return `ilce-${province}-${district}-${cat}`
}

export function inferEditorLayer(
  editor: Pick<AiEditorDocument, 'slug' | 'citySlug' | 'editorLayer' | 'countrySlug' | 'districtSlug'>
): AiEditorLayer {
  if (editor.editorLayer) return editor.editorLayer
  if (editor.districtSlug || editor.slug.startsWith('ilce-')) return 'district'
  if (editor.countrySlug || editor.slug.startsWith('ulke-')) return 'country'
  if (editor.citySlug) return 'province'
  return 'national'
}

export function inferEditorRegion(
  editor: Pick<AiEditorDocument, 'citySlug' | 'countrySlug' | 'districtSlug' | 'slug'>
): string {
  if (editor.districtSlug && editor.citySlug) return `${editor.citySlug}/${editor.districtSlug}`
  if (editor.countrySlug) return editor.countrySlug
  if (editor.citySlug) return editor.citySlug
  return ''
}

/**
 * Country/district docs must stay inert while EXPANDED_EDITOR_HIERARCHY_ENABLED is off.
 * Otherwise a leftover ulke-* (categoryIds: dunya) or ilce-* (yerel-haber) can win
 * national/city fallback finds.
 */
export function isExpandedHierarchyLayer(layer: AiEditorLayer): boolean {
  return layer === 'country' || layer === 'district'
}

export function filterEditorsForCurrentHierarchy<T extends Parameters<typeof inferEditorLayer>[0]>(
  editors: T[]
): T[] {
  if (isExpandedEditorHierarchyEnabled()) return editors
  return editors.filter((editor) => !isExpandedHierarchyLayer(inferEditorLayer(editor)))
}

export type BulkSelectionMode = 'none' | 'page' | 'matching'

export interface BulkSelectionState {
  ids: string[]
  mode: BulkSelectionMode
  matchingTotal: number
  filterKey: string
}

export function emptySelection(filterKey = ''): BulkSelectionState {
  return { ids: [], mode: 'none', matchingTotal: 0, filterKey }
}

export function selectionFilterKey(params: Record<string, string | null | undefined>): string {
  return Object.entries(params)
    .filter(([k]) => k !== 'page')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v ?? ''}`)
    .join('&')
}

/** Header checkbox: select all visible rows on the current page. */
export function selectCurrentPage(visibleIds: string[], filterKey: string, matchingTotal: number): BulkSelectionState {
  return { ids: [...visibleIds], mode: 'page', matchingTotal, filterKey }
}

export function toggleRow(state: BulkSelectionState, id: string, visibleIds: string[]): BulkSelectionState {
  const set = new Set(state.ids)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  const ids = [...set]
  const allVisible = visibleIds.length > 0 && visibleIds.every((vid) => set.has(vid))
  return {
    ...state,
    ids,
    mode: ids.length === 0 ? 'none' : allVisible ? 'page' : 'none',
  }
}

export function selectAllMatching(filterKey: string, matchingTotal: number): BulkSelectionState {
  return { ids: [], mode: 'matching', matchingTotal, filterKey }
}

export function clearSelection(filterKey: string): BulkSelectionState {
  return emptySelection(filterKey)
}

/** Changing filters (not page) must drop any prior selection. */
export function reconcileSelection(state: BulkSelectionState, nextFilterKey: string): BulkSelectionState {
  if (state.filterKey !== nextFilterKey) return emptySelection(nextFilterKey)
  return state
}

export function selectedCount(state: BulkSelectionState, pageSize: number): number {
  if (state.mode === 'matching') return state.matchingTotal
  return state.ids.length
}

export function pageSelectionHint(state: BulkSelectionState, pageSize: number): string | null {
  if (state.mode !== 'page' || state.matchingTotal <= pageSize || state.ids.length === 0) return null
  return `Bu sayfadaki ${state.ids.length} kayıt seçildi.`
}

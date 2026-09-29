import { fixtureForUrl, selectedAssetsFor } from './mockData'
import type { AnalysisItem, AssetChoice } from './types'
import { parseImportText } from './urlInput'

export interface AnalysisRun {
  items: AnalysisItem[]
  selectedIds: string[]
  duplicateCount: number
  invalidCount: number
  empty: boolean
}

export function runMockAnalysis(text: string): AnalysisRun {
  const draft = parseImportText(text)
  const items = draft.uniqueUrls.map((url, index) => {
    const fixture = fixtureForUrl(url, index)
    const item: AnalysisItem = {
      ...fixture,
      id: `an_${index + 1}`,
      url,
      mock: true,
    }
    return item
  })
  const selectedIds = items.filter((item) => item.status === 'READY').map((item) => item.id)
  return {
    items,
    selectedIds,
    duplicateCount: draft.duplicateCount,
    invalidCount: draft.invalidCount,
    empty: items.length === 0,
  }
}

export function assetAllowed(item: AnalysisItem, key: AssetChoice): boolean {
  return item.assets.some((asset) => asset.key === key && asset.available)
}

export { selectedAssetsFor }

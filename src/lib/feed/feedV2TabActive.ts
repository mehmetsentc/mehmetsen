/**
 * Leaf helper — no imports from feedV2Tabs (avoids webpack circular TDZ:
 * "isFeedV2TabActive is not a function" in FeedV2CategoryNav).
 */
export function isFeedV2TabActive(
  tab: { id: string; mode?: string; category?: string },
  activeTabId: string
): boolean {
  if (tab.id === activeTabId) return true
  if (tab.mode === 'personal' && activeTabId === 'personal') return true
  if (tab.mode === 'local' && (activeTabId === 'local' || activeTabId === 'yerel')) return true
  if (tab.mode === 'breaking' && (activeTabId === 'breaking' || activeTabId === 'son-dakika')) {
    return true
  }
  return Boolean(tab.category && tab.category === activeTabId)
}

import { hintCategoryFromText } from '@/lib/ai/editorial/categoryHint'

/** Independent outlets before a story is treated as the day's real agenda. */
export const AGENDA_MIN_SOURCES = 4

/**
 * The story that arrived from clearly more outlets than the rest of the window.
 * A tie at 6+ sources still counts: that many confirmations is the agenda.
 */
export function isDominantAgenda(sourceCount: number, otherSourceCounts: number[]): boolean {
  if (sourceCount < AGENDA_MIN_SOURCES) return false
  const leader = Math.max(sourceCount, ...otherSourceCounts, 0)
  if (sourceCount < leader) return false
  const runnerUp = otherSourceCounts.filter((n) => n < sourceCount).reduce((max, n) => Math.max(max, n), 0)
  return sourceCount - runnerUp >= 2 || sourceCount >= 6
}

const LOCAL_EVENT = /\b(yang[ıi]n\w*|deprem\w*|sel\b|kaza\b|belediye)\b/i

/**
 * Desk category for a clustered event.
 * A national story copied by local sites stays Gündem; a fire/quake that names
 * its city stays Yerel.
 */
export function categoryHintForEvent(title: string | null, sourceCount: number): string | null {
  const text = (title || '').trim()
  if (text.length < 12 && sourceCount < AGENDA_MIN_SOURCES) return null
  const hint = text.length >= 12 ? hintCategoryFromText(text) : null
  if (hint && hint.categoryId !== 'yerel-haber') return hint.categoryId
  if (sourceCount >= AGENDA_MIN_SOURCES && !LOCAL_EVENT.test(text)) return 'gundem'
  return hint?.categoryId ?? null
}

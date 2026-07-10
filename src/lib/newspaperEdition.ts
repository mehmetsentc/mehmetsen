export type NewspaperEdition = 'sabah' | 'ogle' | 'aksam'

export const EDITION_LABELS: Record<NewspaperEdition, string> = {
  sabah: 'Sabah Baskısı',
  ogle: 'Öğle Baskısı',
  aksam: 'Akşam Baskısı',
}

/** Resolve newspaper edition based on hour of day (Turkey time). */
export function resolveNewspaperEdition(date = new Date()): NewspaperEdition {
  const hour = date.getHours()
  if (hour < 12) return 'sabah'
  if (hour < 18) return 'ogle'
  return 'aksam'
}

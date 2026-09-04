/**
 * Deterministic publisher brand accent — no extra network / schema.
 * Keeps headline high-contrast; accent used for ring / CTA tint only.
 */

const PALETTE = [
  '#E11D48',
  '#2563EB',
  '#059669',
  '#D97706',
  '#7C3AED',
  '#0891B2',
  '#DB2777',
  '#4F46E5',
  '#0D9488',
  '#EA580C',
] as const

export function publisherAccentFromId(id: string | null | undefined): string {
  if (!id?.trim()) return '#A1A1AA'
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]!
}

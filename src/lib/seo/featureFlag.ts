/** SEO_DISTRIBUTION_V1_ENABLED — prod default false. Central SEO eligibility + enhanced distribution. */
export function isSeoDistributionV1Enabled(): boolean {
  const v = process.env.SEO_DISTRIBUTION_V1_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return false
}

/** EVENT_PAGES_ENABLED — prod default false. Public /olay/[slug] cluster pages. */
export function isEventPagesEnabled(): boolean {
  const v = process.env.EVENT_PAGES_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return false
}

/** SYNTHETIC_SIMULATOR_ENABLED — HARD DISABLED in production (NODE_ENV=production → always false). */
export function isSyntheticSimulatorEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  const v = process.env.SYNTHETIC_SIMULATOR_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return false
}

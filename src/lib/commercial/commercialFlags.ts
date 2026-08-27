/** Phase P10A commercial ledger / payment feature flags — prod default false. */

function flag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

export function isCommercialLedgerEnabled(): boolean {
  return flag('COMMERCIAL_LEDGER_ENABLED')
}

export function isPaymentIntentEnabled(): boolean {
  return flag('PAYMENT_INTENT_ENABLED')
}

export function isPublisherEarningsEnabled(): boolean {
  return flag('PUBLISHER_EARNINGS_ENABLED')
}

/**
 * TEST payment provider — HARD REJECT in production (NODE_ENV or VERCEL_ENV).
 * Even if env says true, production never enables it.
 */
export function isTestPaymentProviderEnabled(): boolean {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    return false
  }
  return flag('TEST_PAYMENT_PROVIDER_ENABLED')
}

export function assertTestPaymentProviderAllowed(): void {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    throw new Error('TestPaymentProvider hard-rejected in production')
  }
  if (!isTestPaymentProviderEnabled()) {
    throw new Error('TEST_PAYMENT_PROVIDER_DISABLED')
  }
}

import { COUNTRY_COOKIE } from '@/lib/i18n'

// Cookie + localStorage key for the stored consent decision. Mirrors the
// pattern used by feedConsent.ts / userPreferences.ts.
const CONSENT_KEY = 'nahaber-consent'

// Bump this when the consent categories or legal copy change in a way that
// requires re-asking the user. A stored decision with an older version is
// treated as "no decision" so the banner reappears.
export const CONSENT_VERSION = 1

// How long a consent decision stays valid before we ask again (GDPR best
// practice is to refresh consent at least every 6-12 months).
export const CONSENT_EXPIRY_DAYS = 365

const COOKIE_MAX_AGE = 60 * 60 * 24 * CONSENT_EXPIRY_DAYS

// Browser event dispatched whenever the stored consent changes or the user
// asks to reopen the preferences UI. The banner listens for this so settings
// pages (or any other code) can drive it without prop drilling.
export const CONSENT_EVENT = 'nahaber:consent'

export type ConsentCategory = 'necessary' | 'analytics' | 'marketing' | 'sale'

export interface ConsentCategories {
  /** Strictly necessary cookies (auth, security). Always on, cannot be disabled. */
  necessary: true
  /** Analytics / measurement. Off by default (GDPR opt-in). */
  analytics: boolean
  /** Marketing / personalization. Off by default (GDPR opt-in). */
  marketing: boolean
  /**
   * Whether the "sale or sharing" of personal information is allowed (CCPA).
   * `false` means the user has opted out ("Do Not Sell or Share").
   */
  sale: boolean
}

export interface ConsentRecord {
  version: number
  /** Epoch millis of when the decision was made. */
  timestamp: number
  categories: ConsentCategories
}

// Everything enabled — "Accept all".
export const CONSENT_ACCEPT_ALL: ConsentCategories = {
  necessary: true,
  analytics: true,
  marketing: true,
  sale: true,
}

// Only strictly necessary — "Reject non-essential" (also opts out of CCPA sale).
export const CONSENT_REJECT_ALL: ConsentCategories = {
  necessary: true,
  analytics: false,
  marketing: false,
  sale: false,
}

// Pre-decision default used to seed the preferences modal: necessary on,
// everything else off (opt-in), sale allowed until the user opts out.
export const CONSENT_DEFAULT: ConsentCategories = {
  necessary: true,
  analytics: false,
  marketing: false,
  sale: true,
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
  )
  return match ? decodeURIComponent(match[1]) : null
}

function normalizeCategories(value: Partial<ConsentCategories> | undefined): ConsentCategories {
  return {
    necessary: true,
    analytics: Boolean(value?.analytics),
    marketing: Boolean(value?.marketing),
    // Default to allowed when the field is missing (older records / CCPA default).
    sale: value?.sale === undefined ? true : Boolean(value.sale),
  }
}

function isExpired(record: ConsentRecord): boolean {
  const ageMs = Date.now() - record.timestamp
  return ageMs > CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000
}

function parseRecord(raw: string | null): ConsentRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>
    if (typeof parsed !== 'object' || parsed === null) return null
    if (typeof parsed.timestamp !== 'number') return null
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 0,
      timestamp: parsed.timestamp,
      categories: normalizeCategories(parsed.categories),
    }
  } catch {
    return null
  }
}

/**
 * Read the stored consent decision. Returns `null` when there is no decision,
 * the stored version is outdated, or the decision has expired — in all of those
 * cases the banner should be shown again. SSR-safe (returns `null` on server).
 */
export function getConsent(): ConsentRecord | null {
  if (typeof window === 'undefined') return null

  let raw: string | null = null
  try {
    raw = localStorage.getItem(CONSENT_KEY)
  } catch {
    raw = null
  }
  // Fall back to the cookie (e.g. localStorage cleared but cookie intact).
  if (!raw) raw = readCookie(CONSENT_KEY)

  const record = parseRecord(raw)
  if (!record) return null
  if (record.version !== CONSENT_VERSION) return null
  if (isExpired(record)) return null
  return record
}

/** Whether the user has an active, valid consent decision. SSR-safe. */
export function hasConsentDecision(): boolean {
  return getConsent() !== null
}

/**
 * Persist a consent decision to both localStorage and a cookie (so the server
 * / middleware could read it later) with the current version + timestamp.
 * Dispatches {@link CONSENT_EVENT} so listeners (the banner, hooks) can react.
 */
export function setConsent(categories: ConsentCategories): ConsentRecord {
  const record: ConsentRecord = {
    version: CONSENT_VERSION,
    timestamp: Date.now(),
    categories: { ...categories, necessary: true },
  }

  if (typeof window !== 'undefined') {
    const serialized = JSON.stringify(record)
    try {
      localStorage.setItem(CONSENT_KEY, serialized)
    } catch {
      // ignore storage access errors (private mode, quota, etc.)
    }
    try {
      document.cookie = `${CONSENT_KEY}=${encodeURIComponent(
        serialized
      )}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
    } catch {
      // ignore cookie write errors
    }
    dispatchConsentEvent(record)
  }

  return record
}

/** Remove the stored decision so the banner is shown again. */
export function clearConsent(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(CONSENT_KEY)
  } catch {
    // ignore
  }
  try {
    document.cookie = `${CONSENT_KEY}=; path=/; max-age=0; samesite=lax`
  } catch {
    // ignore
  }
  dispatchConsentEvent(null)
}

export interface ConsentEventDetail {
  /** The new record, or `null` when consent was cleared. */
  record: ConsentRecord | null
  /** When true, listeners should open the preferences UI (reopen request). */
  open?: boolean
}

function dispatchConsentEvent(record: ConsentRecord | null, open = false): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<ConsentEventDetail>(CONSENT_EVENT, { detail: { record, open } })
  )
}

/**
 * Ask any mounted banner to reopen the preferences modal. Used by the settings
 * page so users can review/change their choice at any time.
 */
export function openConsentPreferences(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<ConsentEventDetail>(CONSENT_EVENT, {
      detail: { record: getConsent(), open: true },
    })
  )
}

/** Subscribe to consent changes / reopen requests. Returns an unsubscribe fn. */
export function onConsentChange(handler: (detail: ConsentEventDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (event: Event) => handler((event as CustomEvent<ConsentEventDetail>).detail)
  window.addEventListener(CONSENT_EVENT, listener)
  return () => window.removeEventListener(CONSENT_EVENT, listener)
}

// --- Region helpers (best-effort, based on the `country` cookie set by middleware) ---

// EU/EEA + UK country codes where GDPR (and UK GDPR) opt-in applies.
const GDPR_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  'SE', 'IS', 'LI', 'NO', 'GB',
])

export function getVisitorCountry(): string | null {
  const value = readCookie(COUNTRY_COOKIE)
  return value ? value.toUpperCase() : null
}

/** Emphasize GDPR opt-in messaging for EU/EEA/UK visitors. */
export function isGdprRegion(country = getVisitorCountry()): boolean {
  return country ? GDPR_COUNTRIES.has(country) : false
}

/** Emphasize the CCPA "Do Not Sell" link for US visitors. */
export function isCcpaRegion(country = getVisitorCountry()): boolean {
  return country === 'US'
}

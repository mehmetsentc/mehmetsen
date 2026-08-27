import { formatPriceMinor, validateMoney } from '@/lib/publisher/adInventoryDomain'
import {
  ADVERTISER_TYPES,
  CAMPAIGN_OBJECTIVES,
  CREATIVE_TYPES,
  type AdvertiserType,
  type CampaignObjective,
  type CreateAdvertiserInput,
  type CreateBookingRequestInput,
  type CreateCampaignInput,
  type CreateCreativeInput,
  type CreativeType,
} from '@/types/advertiserMarketplace'
import type { AdPricingModel } from '@/types/publisherAdInventory'

export class MarketplaceValidationError extends Error {
  constructor(
    message: string,
    readonly code: string = 'VALIDATION'
  ) {
    super(message)
    this.name = 'MarketplaceValidationError'
  }
}

/** Re-export P8 money helpers — single money system. */
export { formatPriceMinor, validateMoney }

const DEFAULT_REQUEST_TTL_DAYS = 7

export function isAdvertiserType(v: unknown): v is AdvertiserType {
  return typeof v === 'string' && (ADVERTISER_TYPES as string[]).includes(v)
}

export function isCampaignObjective(v: unknown): v is CampaignObjective {
  return typeof v === 'string' && (CAMPAIGN_OBJECTIVES as string[]).includes(v)
}

export function isCreativeType(v: unknown): v is CreativeType {
  return typeof v === 'string' && (CREATIVE_TYPES as string[]).includes(v)
}

/** http/https only — no javascript:/data:/file: */
export function validateDestinationUrl(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null
  const url = String(raw).trim()
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new MarketplaceValidationError('INVALID_DESTINATION_URL', 'INVALID_DESTINATION_URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new MarketplaceValidationError('INVALID_DESTINATION_PROTOCOL', 'INVALID_DESTINATION_PROTOCOL')
  }
  return parsed.toString()
}

export function datesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime()
}

export function parseUtcDate(raw: string, field: string): Date {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) {
    throw new MarketplaceValidationError(`INVALID_${field}`, 'INVALID_DATE')
  }
  return d
}

export function validateRequestWindow(start: Date, end: Date): void {
  if (end.getTime() <= start.getTime()) {
    throw new MarketplaceValidationError('INVALID_DATE_RANGE', 'INVALID_DATE')
  }
  const maxMs = 366 * 24 * 60 * 60 * 1000
  if (end.getTime() - start.getTime() > maxMs) {
    throw new MarketplaceValidationError('DATE_RANGE_TOO_LONG', 'INVALID_DATE')
  }
}

export function defaultRequestExpiresAt(from = new Date()): Date {
  const d = new Date(from)
  d.setUTCDate(d.getUTCDate() + DEFAULT_REQUEST_TTL_DAYS)
  return d
}

export function normalizeCreateAdvertiser(raw: CreateAdvertiserInput): CreateAdvertiserInput {
  const name = raw.name?.trim()
  if (!name || name.length < 2 || name.length > 200) {
    throw new MarketplaceValidationError('INVALID_NAME', 'INVALID_NAME')
  }
  if (!isAdvertiserType(raw.advertiserType)) {
    throw new MarketplaceValidationError('INVALID_ADVERTISER_TYPE', 'VALIDATION')
  }
  let websiteUrl: string | null = null
  if (raw.websiteUrl != null && String(raw.websiteUrl).trim()) {
    websiteUrl = validateDestinationUrl(raw.websiteUrl)
  }
  return {
    name,
    advertiserType: raw.advertiserType,
    websiteUrl,
    city: raw.city?.trim() || null,
    country: (raw.country?.trim().toUpperCase() || 'TR').slice(0, 2),
  }
}

export function normalizeCreateCampaign(raw: CreateCampaignInput): CreateCampaignInput {
  const name = raw.name?.trim()
  if (!name || name.length < 2 || name.length > 200) {
    throw new MarketplaceValidationError('INVALID_NAME', 'INVALID_NAME')
  }
  if (!isCampaignObjective(raw.objective)) {
    throw new MarketplaceValidationError('INVALID_OBJECTIVE', 'VALIDATION')
  }
  let budgetMinor: number | null = null
  let currency = 'TRY'
  if (raw.budgetMinor != null) {
    const money = validateMoney('FIXED_PERIOD', raw.budgetMinor, raw.currency)
    budgetMinor = money.priceMinor
    currency = money.currency
  }
  return {
    name,
    objective: raw.objective,
    startAt: raw.startAt ?? null,
    endAt: raw.endAt ?? null,
    budgetMinor,
    currency,
  }
}

export function normalizeCreateBookingRequest(
  raw: CreateBookingRequestInput
): {
  campaignId: string
  inventoryId: string
  requestedStartAt: Date
  requestedEndAt: Date
  requestedImpressions: number | null
  message: string | null
  creativeId: string | null
} {
  if (!raw.campaignId?.trim() || !raw.inventoryId?.trim()) {
    throw new MarketplaceValidationError('MISSING_IDS', 'VALIDATION')
  }
  const start = parseUtcDate(raw.requestedStartAt, 'START')
  const end = parseUtcDate(raw.requestedEndAt, 'END')
  validateRequestWindow(start, end)
  let requestedImpressions: number | null = null
  if (raw.requestedImpressions != null) {
    if (!Number.isInteger(raw.requestedImpressions) || raw.requestedImpressions < 1) {
      throw new MarketplaceValidationError('INVALID_IMPRESSIONS', 'VALIDATION')
    }
    requestedImpressions = raw.requestedImpressions
  }
  return {
    campaignId: raw.campaignId.trim(),
    inventoryId: raw.inventoryId.trim(),
    requestedStartAt: start,
    requestedEndAt: end,
    requestedImpressions,
    message: raw.message?.trim() || null,
    creativeId: raw.creativeId?.trim() || null,
  }
}

export function validateRequestAgainstPricing(
  pricingModel: AdPricingModel,
  requestedImpressions: number | null,
  message: string | null
): void {
  if (pricingModel === 'FIXED_IMPRESSIONS') {
    if (requestedImpressions == null || requestedImpressions < 1) {
      throw new MarketplaceValidationError('IMPRESSIONS_REQUIRED', 'VALIDATION')
    }
  }
  if (pricingModel === 'CONTACT_FOR_PRICE') {
    if (!message || message.length < 5) {
      throw new MarketplaceValidationError('MESSAGE_REQUIRED', 'VALIDATION')
    }
  }
}

export function normalizeCreateCreative(raw: CreateCreativeInput): CreateCreativeInput {
  const name = raw.name?.trim()
  if (!name || name.length < 2 || name.length > 200) {
    throw new MarketplaceValidationError('INVALID_NAME', 'INVALID_NAME')
  }
  if (!isCreativeType(raw.creativeType)) {
    throw new MarketplaceValidationError('INVALID_CREATIVE_TYPE', 'VALIDATION')
  }
  return {
    name,
    creativeType: raw.creativeType,
    headline: raw.headline?.trim() || null,
    body: raw.body?.trim() || null,
    mediaUrl: raw.mediaUrl?.trim() || null,
    destinationUrl: validateDestinationUrl(raw.destinationUrl ?? null),
    campaignId: raw.campaignId?.trim() || null,
  }
}

export const CREATIVE_ALLOWED_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export const CREATIVE_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export const CREATIVE_MAX_BYTES = 5 * 1024 * 1024

export function isAllowedCreativeMime(mime: string): boolean {
  return (CREATIVE_ALLOWED_MIMES as readonly string[]).includes(mime.toLowerCase())
}

/** Deterministic recommended sort key: local match first, then available, then newer. */
export function recommendedScore(opts: {
  publisherCity: string | null
  preferredCity: string | null
  createdAtMs: number
}): number {
  let score = 0
  if (
    opts.preferredCity &&
    opts.publisherCity &&
    opts.publisherCity.toLocaleLowerCase('tr') === opts.preferredCity.toLocaleLowerCase('tr')
  ) {
    score += 1_000_000
  }
  score += Math.floor(opts.createdAtMs / 1000)
  return score
}

export function encodeCursor(payload: { id: string; sortValue: string | number }): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string): { id: string; sortValue: string | number } | null {
  try {
    const raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      id?: string
      sortValue?: string | number
    }
    if (!raw.id) return null
    return { id: raw.id, sortValue: raw.sortValue ?? '' }
  } catch {
    return null
  }
}

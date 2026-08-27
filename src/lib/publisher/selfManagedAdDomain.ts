import { datesOverlap, validateDestinationUrl } from '@/lib/advertiser/marketplaceDomain'
import { AD_CREATIVE_ALLOWED_MIME, prerollMaxDurationSeconds } from '@/lib/publisher/selfManagedAdConfig'
import {
  AD_CREATIVE_TYPES,
  MANAGED_AD_STATUSES,
  type PublisherAdCreativeCreateInput,
  type PublisherAdCreativeType,
  type PublisherManagedAdCreateInput,
  type PublisherManagedAdStatus,
  type PublisherManagedAdUpdateInput,
} from '@/types/publisherManagedAds'

export class SelfManagedAdValidationError extends Error {
  constructor(
    message: string,
    readonly code: string = 'VALIDATION'
  ) {
    super(message)
    this.name = 'SelfManagedAdValidationError'
  }
}

export function isManagedAdStatus(v: unknown): v is PublisherManagedAdStatus {
  return typeof v === 'string' && (MANAGED_AD_STATUSES as string[]).includes(v)
}

export function isAdCreativeType(v: unknown): v is PublisherAdCreativeType {
  return typeof v === 'string' && (AD_CREATIVE_TYPES as string[]).includes(v)
}

export function parseAdWindow(startRaw: string | Date, endRaw: string | Date): { start: Date; end: Date } {
  const start = startRaw instanceof Date ? startRaw : new Date(startRaw)
  const end = endRaw instanceof Date ? endRaw : new Date(endRaw)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new SelfManagedAdValidationError('INVALID_DATE', 'INVALID_DATE')
  }
  if (end.getTime() <= start.getTime()) {
    throw new SelfManagedAdValidationError('INVALID_DATE_RANGE', 'INVALID_DATE')
  }
  return { start, end }
}

/** SCHEDULED/ACTIVE windows conflict; DRAFT/PAUSED/ENDED/ARCHIVED do not block. */
export function statusesConflictOnSchedule(status: PublisherManagedAdStatus): boolean {
  return status === 'SCHEDULED' || status === 'ACTIVE'
}

export function validateCreateAdInput(input: PublisherManagedAdCreateInput) {
  const name = String(input.name || '').trim()
  const advertiserName = String(input.advertiserName || '').trim()
  const inventoryId = String(input.inventoryId || '').trim()
  if (!name || name.length > 160) throw new SelfManagedAdValidationError('INVALID_NAME')
  if (!advertiserName || advertiserName.length > 160) {
    throw new SelfManagedAdValidationError('INVALID_ADVERTISER_NAME')
  }
  if (!inventoryId) throw new SelfManagedAdValidationError('INVENTORY_REQUIRED')
  const { start, end } = parseAdWindow(input.startAt, input.endAt)
  const destinationUrl = validateDestinationUrl(input.destinationUrl ?? null)
  const status = (input.status ?? 'DRAFT') as PublisherManagedAdStatus
  if (
    !isManagedAdStatus(status) ||
    status === 'ENDED' ||
    status === 'ARCHIVED'
  ) {
    throw new SelfManagedAdValidationError('INVALID_STATUS')
  }
  return {
    name,
    advertiserName,
    inventoryId,
    startAt: start,
    endAt: end,
    destinationUrl,
    internalNote: input.internalNote?.trim() || null,
    status,
    advertiserId: input.advertiserId?.trim() || null,
  }
}

export function validateUpdateAdInput(input: PublisherManagedAdUpdateInput) {
  const out: {
    name?: string
    advertiserName?: string
    inventoryId?: string
    startAt?: Date
    endAt?: Date
    destinationUrl?: string | null
    internalNote?: string | null
    status?: Exclude<PublisherManagedAdStatus, 'ARCHIVED'>
  } = {}
  if (input.name !== undefined) {
    const name = String(input.name).trim()
    if (!name || name.length > 160) throw new SelfManagedAdValidationError('INVALID_NAME')
    out.name = name
  }
  if (input.advertiserName !== undefined) {
    const advertiserName = String(input.advertiserName).trim()
    if (!advertiserName || advertiserName.length > 160) {
      throw new SelfManagedAdValidationError('INVALID_ADVERTISER_NAME')
    }
    out.advertiserName = advertiserName
  }
  if (input.inventoryId !== undefined) {
    const inventoryId = String(input.inventoryId).trim()
    if (!inventoryId) throw new SelfManagedAdValidationError('INVENTORY_REQUIRED')
    out.inventoryId = inventoryId
  }
  if (input.startAt !== undefined || input.endAt !== undefined) {
    if (input.startAt === undefined || input.endAt === undefined) {
      throw new SelfManagedAdValidationError('DATE_RANGE_REQUIRED')
    }
    const w = parseAdWindow(input.startAt, input.endAt)
    out.startAt = w.start
    out.endAt = w.end
  }
  if (input.destinationUrl !== undefined) {
    out.destinationUrl = validateDestinationUrl(input.destinationUrl)
  }
  if (input.internalNote !== undefined) {
    out.internalNote = input.internalNote?.trim() || null
  }
  if (input.status !== undefined) {
    const st = input.status as PublisherManagedAdStatus
    if (!isManagedAdStatus(st) || st === 'ARCHIVED') {
      throw new SelfManagedAdValidationError('INVALID_STATUS')
    }
    out.status = st as Exclude<PublisherManagedAdStatus, 'ARCHIVED'>
  }
  return out
}

export function validateCreativeInput(input: PublisherAdCreativeCreateInput) {
  if (!isAdCreativeType(input.creativeType)) {
    throw new SelfManagedAdValidationError('INVALID_CREATIVE_TYPE')
  }
  const mediaUrl = String(input.mediaUrl || '').trim()
  if (!mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://')) {
    throw new SelfManagedAdValidationError('INVALID_MEDIA_URL')
  }
  let durationSeconds = input.durationSeconds ?? null
  if (input.creativeType === 'VIDEO') {
    const max = prerollMaxDurationSeconds()
    if (durationSeconds != null && (durationSeconds <= 0 || durationSeconds > max)) {
      throw new SelfManagedAdValidationError('INVALID_VIDEO_DURATION')
    }
  }
  return {
    creativeType: input.creativeType,
    mediaUrl,
    thumbnailUrl: input.thumbnailUrl?.trim() || null,
    headline: input.headline?.trim()?.slice(0, 200) || null,
    body: input.body?.trim() || null,
    altText: input.altText?.trim()?.slice(0, 300) || null,
    durationSeconds,
  }
}

export function assertAllowedCreativeMime(mime: string): void {
  if (!AD_CREATIVE_ALLOWED_MIME.has(mime)) {
    throw new SelfManagedAdValidationError('INVALID_MIME', 'INVALID_MIME')
  }
}

export function windowsConflict(
  a: { startAt: Date; endAt: Date; status: PublisherManagedAdStatus; id?: string },
  b: { startAt: Date; endAt: Date; status: PublisherManagedAdStatus; id?: string }
): boolean {
  if (!statusesConflictOnSchedule(a.status) || !statusesConflictOnSchedule(b.status)) return false
  if (a.id && b.id && a.id === b.id) return false
  return datesOverlap(a.startAt, a.endAt, b.startAt, b.endAt)
}

/** Time-window eligibility for serving (source of truth at render). */
export function isAdEligibleNow(
  ad: { status: PublisherManagedAdStatus; startAt: Date; endAt: Date },
  now: Date = new Date()
): boolean {
  if (ad.status === 'PAUSED' || ad.status === 'DRAFT' || ad.status === 'ENDED' || ad.status === 'ARCHIVED') {
    return false
  }
  if (ad.status !== 'ACTIVE' && ad.status !== 'SCHEDULED') return false
  const t = now.getTime()
  return ad.startAt.getTime() <= t && t < ad.endAt.getTime()
}

export function resolveLifecycleStatus(
  ad: { status: PublisherManagedAdStatus; startAt: Date; endAt: Date },
  now: Date = new Date()
): PublisherManagedAdStatus {
  if (ad.status === 'ARCHIVED' || ad.status === 'PAUSED' || ad.status === 'DRAFT') return ad.status
  const t = now.getTime()
  if (t >= ad.endAt.getTime()) return 'ENDED'
  if (ad.status === 'SCHEDULED' && t >= ad.startAt.getTime() && t < ad.endAt.getTime()) return 'ACTIVE'
  if (ad.status === 'ACTIVE' && t < ad.startAt.getTime()) return 'SCHEDULED'
  return ad.status
}

export { validateDestinationUrl }

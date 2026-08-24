import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  ANTALYA_EO_SOURCE_LABEL,
  ANTALYA_EO_SOURCE_URL,
  CANAKKALE_EO_SOURCE_LABEL,
  CANAKKALE_EO_SOURCE_URL,
  dutyPharmacyArchiveDocId,
  dutyPharmacyDocId,
  isDutyPharmacyCity,
  type DutyPharmacyCitySlug,
} from '@/lib/dutyPharmacies/constants'
import {
  countPharmacies,
  dutyDateFromGroups,
  parseCanakkaleEoHtml,
} from '@/lib/dutyPharmacies/parseCanakkaleEoHtml'
import { parseAntalyaEoHtml } from '@/lib/dutyPharmacies/parseAntalyaEoHtml'
import { fetchText } from '@/services/eventProviders/shared'
import type { DutyPharmacyGroup, DutyPharmacySnapshot } from '@/types/dutyPharmacy'

const FETCH_TIMEOUT_MS = 20_000

export interface DutyPharmacySyncResult {
  ok: boolean
  citySlug: string
  pharmacyCount: number
  districtCount: number
  dutyDate: string | null
  fetchedAt: string
  keptPrevious: boolean
  durationMs: number
  error?: string
}

function istanbulCalendarDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

async function fetchSourceHtml(
  sourceUrl: string,
  citySlug: DutyPharmacyCitySlug
): Promise<string> {
  return fetchText(
    sourceUrl,
    {
      headers: {
        'User-Agent': `Mozilla/5.0 (compatible; NahaberBot/1.0; +https://${citySlug}.nahaber.com)`,
        Referer: `https://${citySlug}.nahaber.com/nobetci-eczaneler`,
      },
    },
    FETCH_TIMEOUT_MS
  )
}

function parseGroups(
  citySlug: DutyPharmacyCitySlug,
  html: string
): DutyPharmacyGroup[] {
  if (citySlug === 'canakkale') return parseCanakkaleEoHtml(html)
  return parseAntalyaEoHtml(html)
}

function sourceMeta(citySlug: DutyPharmacyCitySlug): {
  url: string
  label: string
} {
  if (citySlug === 'antalya') {
    return { url: ANTALYA_EO_SOURCE_URL, label: ANTALYA_EO_SOURCE_LABEL }
  }
  return { url: CANAKKALE_EO_SOURCE_URL, label: CANAKKALE_EO_SOURCE_LABEL }
}

async function syncCity(citySlug: DutyPharmacyCitySlug): Promise<DutyPharmacySyncResult> {
  const started = Date.now()
  const fetchedAt = new Date().toISOString()
  const db = getAdminFirestore()
  const currentRef = db
    .collection(Collections.DUTY_PHARMACIES)
    .doc(dutyPharmacyDocId(citySlug))
  const source = sourceMeta(citySlug)

  try {
    const html = await fetchSourceHtml(source.url, citySlug)
    const groups = parseGroups(citySlug, html)
    const pharmacyCount = countPharmacies(groups)

    if (pharmacyCount === 0) {
      const previous = await currentRef.get()
      return {
        ok: false,
        citySlug,
        pharmacyCount: previous.exists
          ? ((previous.data() as DutyPharmacySnapshot | undefined)?.pharmacyCount ?? 0)
          : 0,
        districtCount: previous.exists
          ? ((previous.data() as DutyPharmacySnapshot | undefined)?.groups.length ?? 0)
          : 0,
        dutyDate:
          (previous.data() as DutyPharmacySnapshot | undefined)?.dutyDate ?? null,
        fetchedAt,
        keptPrevious: previous.exists,
        durationMs: Date.now() - started,
        error: 'Kaynak sayfada nöbetçi eczane bulunamadı; önceki liste korundu.',
      }
    }

    const dutyDate = dutyDateFromGroups(groups) ?? istanbulCalendarDate()
    const snapshot: DutyPharmacySnapshot = {
      citySlug,
      sourceUrl: source.url,
      sourceLabel: source.label,
      fetchedAt,
      dutyDate,
      pharmacyCount,
      groups,
    }

    const batch = db.batch()
    batch.set(currentRef, snapshot)
    batch.set(
      db.collection(Collections.DUTY_PHARMACIES).doc(
        dutyPharmacyArchiveDocId(citySlug, dutyDate)
      ),
      snapshot
    )
    await batch.commit()

    return {
      ok: true,
      citySlug,
      pharmacyCount,
      districtCount: groups.length,
      dutyDate,
      fetchedAt,
      keptPrevious: false,
      durationMs: Date.now() - started,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    const previous = await currentRef.get().catch(() => null)
    return {
      ok: false,
      citySlug,
      pharmacyCount:
        (previous?.data() as DutyPharmacySnapshot | undefined)?.pharmacyCount ?? 0,
      districtCount:
        (previous?.data() as DutyPharmacySnapshot | undefined)?.groups.length ?? 0,
      dutyDate: (previous?.data() as DutyPharmacySnapshot | undefined)?.dutyDate ?? null,
      fetchedAt,
      keptPrevious: Boolean(previous?.exists),
      durationMs: Date.now() - started,
      error: message,
    }
  }
}

export const dutyPharmacySyncService = {
  async syncCanakkale(): Promise<DutyPharmacySyncResult> {
    return syncCity('canakkale')
  },

  async syncAntalya(): Promise<DutyPharmacySyncResult> {
    return syncCity('antalya')
  },

  async sync(citySlug: string): Promise<DutyPharmacySyncResult> {
    if (!isDutyPharmacyCity(citySlug)) {
      return {
        ok: false,
        citySlug,
        pharmacyCount: 0,
        districtCount: 0,
        dutyDate: null,
        fetchedAt: new Date().toISOString(),
        keptPrevious: false,
        durationMs: 0,
        error: `Nöbetçi eczane kaynağı tanımlı değil: ${citySlug}`,
      }
    }
    return syncCity(citySlug)
  },
}

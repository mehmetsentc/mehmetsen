import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  CANAKKALE_EO_SOURCE_LABEL,
  CANAKKALE_EO_SOURCE_URL,
  DUTY_PHARMACY_CITY_SLUG,
  DUTY_PHARMACY_CURRENT_DOC_ID,
} from '@/lib/dutyPharmacies/constants'
import {
  countPharmacies,
  dutyDateFromGroups,
  parseCanakkaleEoHtml,
} from '@/lib/dutyPharmacies/parseCanakkaleEoHtml'
import { fetchText } from '@/services/eventProviders/shared'
import type { DutyPharmacySnapshot } from '@/types/dutyPharmacy'

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

function archiveDocId(dutyDate: string): string {
  return `${DUTY_PHARMACY_CITY_SLUG}__${dutyDate}`
}

async function fetchSourceHtml(): Promise<string> {
  return fetchText(
    CANAKKALE_EO_SOURCE_URL,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; NahaberBot/1.0; +https://canakkale.nahaber.com)',
        Referer: 'https://canakkale.nahaber.com/nobetci-eczaneler',
      },
    },
    FETCH_TIMEOUT_MS
  )
}

export const dutyPharmacySyncService = {
  async syncCanakkale(): Promise<DutyPharmacySyncResult> {
    const started = Date.now()
    const fetchedAt = new Date().toISOString()
    const db = getAdminFirestore()
    const currentRef = db
      .collection(Collections.DUTY_PHARMACIES)
      .doc(DUTY_PHARMACY_CURRENT_DOC_ID)

    try {
      const html = await fetchSourceHtml()
      const groups = parseCanakkaleEoHtml(html)
      const pharmacyCount = countPharmacies(groups)

      if (pharmacyCount === 0) {
        const previous = await currentRef.get()
        return {
          ok: false,
          citySlug: DUTY_PHARMACY_CITY_SLUG,
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

      const dutyDate = dutyDateFromGroups(groups)
      const snapshot: DutyPharmacySnapshot = {
        citySlug: DUTY_PHARMACY_CITY_SLUG,
        sourceUrl: CANAKKALE_EO_SOURCE_URL,
        sourceLabel: CANAKKALE_EO_SOURCE_LABEL,
        fetchedAt,
        dutyDate,
        pharmacyCount,
        groups,
      }

      const batch = db.batch()
      batch.set(currentRef, snapshot)
      if (dutyDate) {
        batch.set(
          db.collection(Collections.DUTY_PHARMACIES).doc(archiveDocId(dutyDate)),
          snapshot
        )
      }
      await batch.commit()

      return {
        ok: true,
        citySlug: DUTY_PHARMACY_CITY_SLUG,
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
        citySlug: DUTY_PHARMACY_CITY_SLUG,
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
  },
}

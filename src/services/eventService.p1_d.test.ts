import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getCityEventById } from '@/services/eventService.server'

vi.mock('@/lib/firebase/admin', () => {
  const mockDocs: Record<string, any> = {
    'canakkale-event-1': {
      title: 'Troya Kültür Festivali',
      description: 'Çanakkale Troya festivali detayları',
      city: 'Çanakkale',
      citySlug: 'canakkale',
      venue: 'Troya Antik Kenti',
      startsAt: '2026-09-01T10:00:00.000Z',
      status: 'published',
    },
    'antalya-event-1': {
      title: 'Antalya Altın Portakal Film Festivali',
      description: 'Antalya film festivali detayları',
      city: 'Antalya',
      citySlug: 'antalya',
      venue: 'AKM Aspendos Salonu',
      startsAt: '2026-10-01T18:00:00.000Z',
      status: 'published',
    },
  }

  return {
    getAdminFirestore: () => ({
      collection: (col: string) => ({
        doc: (id: string) => ({
          get: async () => {
            if (col === 'events' && mockDocs[id]) {
              return {
                exists: true,
                id,
                data: () => mockDocs[id],
              }
            }
            return { exists: false, id, data: () => undefined }
          },
        }),
      }),
    }),
  }
})

describe('P1-D: City Event Detail Resolution & Cross-City Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. resolves valid Çanakkale event when city matches', async () => {
    const event = await getCityEventById('canakkale-event-1', 'canakkale')
    expect(event).not.toBeNull()
    expect(event?.id).toBe('canakkale-event-1')
    expect(event?.title).toBe('Troya Kültür Festivali')
    expect(event?.citySlug).toBe('canakkale')
  })

  it('2. resolves valid Antalya event when city matches', async () => {
    const event = await getCityEventById('antalya-event-1', 'antalya')
    expect(event).not.toBeNull()
    expect(event?.id).toBe('antalya-event-1')
    expect(event?.title).toBe('Antalya Altın Portakal Film Festivali')
    expect(event?.citySlug).toBe('antalya')
  })

  it('3. returns null for unknown event ID', async () => {
    const event = await getCityEventById('nonexistent-event-id', 'canakkale')
    expect(event).toBeNull()
  })

  it('4. blocks cross-city event access (Antalya event on Çanakkale host)', async () => {
    const event = await getCityEventById('antalya-event-1', 'canakkale')
    expect(event).toBeNull()
  })

  it('5. blocks cross-city event access (Çanakkale event on Antalya host)', async () => {
    const event = await getCityEventById('canakkale-event-1', 'antalya')
    expect(event).toBeNull()
  })

  it('6. resolves event when no city constraint is passed (national context lookup)', async () => {
    const event = await getCityEventById('canakkale-event-1')
    expect(event).not.toBeNull()
    expect(event?.id).toBe('canakkale-event-1')
  })
})

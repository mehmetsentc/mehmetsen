import { describe, expect, it } from 'vitest'
import {
  buildDiscoveryStream,
  HOME_DISCOVERY_CHUNK,
  HOME_INLINE_RAIL_ORDER,
} from '@/lib/home/discoveryStream'
import type { HomeDiscoveryItem } from '@/components/home/HomeDiscoveryCard'
import type { HomeCategorySlug, NewsItem } from '@/types/newsItem'

function card(id: string): HomeDiscoveryItem {
  return { id, href: `/${id}`, title: id }
}

function news(id: string, category: string): NewsItem {
  return { id, category } as NewsItem
}

function rail(n: number, category: string): NewsItem[] {
  return Array.from({ length: n }, (_, i) => news(`${category}-${i}`, category))
}

describe('buildDiscoveryStream', () => {
  it('keeps masonry order and inserts category rails between chunks', () => {
    const masonry = Array.from({ length: 20 }, (_, i) => card(`m${i}`))
    const blocks = buildDiscoveryStream({
      masonryItems: masonry,
      rails: {
        gundem: rail(5, 'gundem'),
        spor: rail(5, 'spor'),
      },
      excludeIds: new Set(),
      chunkSize: 8,
    })
    expect(blocks[0]).toMatchObject({ kind: 'masonry' })
    expect(blocks[1]).toMatchObject({ kind: 'rail', categoryId: 'gundem' })
    expect(blocks[2]).toMatchObject({ kind: 'masonry' })
    expect(blocks[3]).toMatchObject({ kind: 'rail', categoryId: 'spor' })
    expect(HOME_DISCOVERY_CHUNK).toBe(8)
    expect(HOME_INLINE_RAIL_ORDER[0]).toBe('gundem')
  })

  it('skips thin rails and featured ids', () => {
    const blocks = buildDiscoveryStream({
      masonryItems: [card('a'), card('b'), card('c'), card('d'), card('e'), card('f'), card('g'), card('h'), card('i')],
      rails: {
        gundem: [news('pin', 'gundem'), news('g1', 'gundem')],
        ekonomi: rail(5, 'ekonomi'),
      },
      excludeIds: new Set(['pin']),
      chunkSize: 8,
      railOrder: ['gundem', 'ekonomi'] as HomeCategorySlug[],
    })
    const rails = blocks.filter((b) => b.kind === 'rail')
    expect(rails).toHaveLength(1)
    if (rails[0]?.kind === 'rail') {
      expect(rails[0].categoryId).toBe('ekonomi')
      expect(rails[0].items.some((item) => item.id === 'pin')).toBe(false)
    }
  })
})

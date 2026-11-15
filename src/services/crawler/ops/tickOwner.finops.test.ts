import { describe, expect, it } from 'vitest'
import { parseCrawlerTickOwner } from './tickOwner'

describe('FinOps: crawler tick owner', () => {
  it('only an explicit railway value moves the tick off Vercel', () => {
    expect(parseCrawlerTickOwner('railway')).toBe('railway')
    expect(parseCrawlerTickOwner(' Railway ')).toBe('railway')
    expect(parseCrawlerTickOwner('vercel')).toBe('vercel')
    expect(parseCrawlerTickOwner(undefined)).toBe('vercel')
    expect(parseCrawlerTickOwner('')).toBe('vercel')
    expect(parseCrawlerTickOwner('other')).toBe('vercel')
  })
})

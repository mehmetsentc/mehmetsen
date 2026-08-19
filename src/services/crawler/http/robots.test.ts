import { describe, expect, it } from 'vitest'
import { isPathAllowed, parseRobots } from './robots'

describe('robots.txt', () => {
  it('respects longest matching allow/disallow', () => {
    const rules = parseRobots(`
User-agent: *
Disallow: /private
Allow: /private/press
`)
    expect(isPathAllowed('/private/secret', rules)).toBe(false)
    expect(isPathAllowed('/private/press/a', rules)).toBe(true)
    expect(isPathAllowed('/news/a', rules)).toBe(true)
  })
})

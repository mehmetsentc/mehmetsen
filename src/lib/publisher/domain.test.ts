import { describe, expect, it } from 'vitest'
import { apexDomain, isSubdomainOf, normalizeDomain } from '@/lib/publisher/domain'

describe('normalizeDomain', () => {
  it('strips protocol and www', () => {
    expect(normalizeDomain('https://www.example.com/path')).toBe('example.com')
  })

  it('handles bare domain', () => {
    expect(normalizeDomain('WWW.Hurriyet.Com.TR')).toBe('hurriyet.com.tr')
  })

  it('handles http without www', () => {
    expect(normalizeDomain('http://sabah.com.tr/haber')).toBe('sabah.com.tr')
  })

  it('returns empty for blank input', () => {
    expect(normalizeDomain('   ')).toBe('')
  })

  it('preserves subdomains — does not merge to apex', () => {
    expect(normalizeDomain('news.example.com')).toBe('news.example.com')
    expect(normalizeDomain('sports.example.com')).toBe('sports.example.com')
    expect(normalizeDomain('news.example.com')).not.toBe(normalizeDomain('example.com'))
  })
})

describe('apexDomain + isSubdomainOf', () => {
  it('detects subdomain relationship without equating hosts', () => {
    expect(apexDomain('news.example.com')).toBe('example.com')
    expect(isSubdomainOf('news.example.com', 'example.com')).toBe(true)
    expect(isSubdomainOf('example.com', 'example.com')).toBe(false)
    expect(isSubdomainOf('news.example.com', 'sports.example.com')).toBe(false)
  })
})

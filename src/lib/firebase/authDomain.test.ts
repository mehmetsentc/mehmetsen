import { describe, expect, it } from 'vitest'
import { resolveAuthDomain } from './authDomain'

const FB = 'nahaberapp.firebaseapp.com'

describe('resolveAuthDomain', () => {
  it('uses the production host as a first-party auth domain', () => {
    expect(resolveAuthDomain(FB, 'www.nahaber.com')).toBe('www.nahaber.com')
  })
  it('keeps the configured domain everywhere else', () => {
    expect(resolveAuthDomain(FB, 'nahaber.com')).toBe(FB)
    expect(resolveAuthDomain(FB, 'antalya.nahaber.com')).toBe(FB)
    expect(resolveAuthDomain(FB, 'localhost')).toBe(FB)
    expect(resolveAuthDomain(FB, 'nahaber-git-x.vercel.app')).toBe(FB)
    expect(resolveAuthDomain(FB, undefined)).toBe(FB)
  })
})

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { sanitizeReturnPath } from '@/lib/auth/returnTo'
import { buildAuthIntent } from '@/lib/social/authIntent'
import {
  canChangeUsername,
  isReservedUsername,
  normalizeUsernameInput,
  validateUsername,
} from '@/lib/social/username'
import {
  isAppleAuthEnabled,
  isEmailAuthEnabled,
  isSocialGraphEnabled,
  isUserProfilesEnabled,
} from '@/lib/social/featureFlag'

describe('P3 auth intent returnUrl safety', () => {
  it('rejects malicious external returnUrl', () => {
    expect(sanitizeReturnPath('https://evil.com')).toBeNull()
    expect(sanitizeReturnPath('//evil.com')).toBeNull()
    expect(buildAuthIntent('LIKE', 'article', 'abc', 'https://evil.com')).toBeNull()
  })

  it('accepts safe internal returnUrl', () => {
    const intent = buildAuthIntent('FOLLOW', 'publisher', 'pub1', '/publisher/demo')
    expect(intent?.returnUrl).toBe('/publisher/demo')
  })

  it('builds valid intent payload', () => {
    const intent = buildAuthIntent('SAVE', 'article', 'n1', '/haber/test')
    expect(intent).toEqual({
      action: 'SAVE',
      targetType: 'article',
      targetId: 'n1',
      returnUrl: '/haber/test',
    })
  })
})

describe('P3 username rules', () => {
  it('blocks reserved usernames', () => {
    expect(isReservedUsername('admin')).toBe(true)
    expect(isReservedUsername('publisher')).toBe(true)
    expect(validateUsername('nahaber').ok).toBe(false)
  })

  it('accepts valid lowercase username', () => {
    const result = validateUsername('ahmet_yilmaz')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.username).toBe('ahmet_yilmaz')
  })

  it('normalizes Turkish input to ascii slug', () => {
    expect(normalizeUsernameInput('Ahmet_Öz')).toBe('ahmet_z')
  })

  it('enforces username change cooldown', () => {
    const recent = new Date(Date.now() - 1000)
    expect(canChangeUsername(recent)).toBe(false)
    expect(canChangeUsername(null)).toBe(true)
  })
})

describe('P3 feature flags config', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
  })

  afterEach(() => {
    process.env = env
  })

  it('social and profile flags default on', () => {
    delete process.env.SOCIAL_GRAPH_ENABLED
    delete process.env.USER_PROFILES_ENABLED
    expect(isSocialGraphEnabled()).toBe(true)
    expect(isUserProfilesEnabled()).toBe(true)
  })

  it('social and profile flags respond to disable values', () => {
    process.env.SOCIAL_GRAPH_ENABLED = 'false'
    process.env.USER_PROFILES_ENABLED = 'false'
    expect(isSocialGraphEnabled()).toBe(false)
    expect(isUserProfilesEnabled()).toBe(false)
  })

  it('email auth stays enabled by default', () => {
    expect(isEmailAuthEnabled()).toBe(true)
  })
})

describe('P3 auth provider contracts', () => {
  it('Apple OAuth provider id is apple.com', async () => {
    const { OAuthProvider } = await import('firebase/auth')
    const provider = new OAuthProvider('apple.com')
    expect(provider.providerId).toBe('apple.com')
  })
})

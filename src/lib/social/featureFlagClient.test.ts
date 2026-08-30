import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  isAppleAuthEnabledClient,
  isEmailAuthEnabledClient,
  isSocialGraphEnabledClient,
  isUserProfilesEnabledClient,
} from '@/lib/social/featureFlagClient'

/**
 * Auth Provider Consistency Repair — regression coverage for the root cause:
 * isAppleAuthEnabledClient() used to default to `false` in production builds
 * (NODE_ENV-dependent fallback) while every sibling flag in this file
 * defaults to permissive/`true` regardless of environment. That inconsistency,
 * combined with LoginForm being the only place that checked the flag, is why
 * Apple silently disappeared from /login while staying visible on /register.
 */
describe('featureFlagClient — Apple auth default parity', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
  })

  afterEach(() => {
    process.env = env
  })

  it('defaults to enabled when unset, matching the other client flags', () => {
    delete process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED
    delete process.env.NEXT_PUBLIC_SOCIAL_GRAPH_ENABLED
    delete process.env.NEXT_PUBLIC_USER_PROFILES_ENABLED
    delete process.env.NEXT_PUBLIC_EMAIL_AUTH_ENABLED

    expect(isAppleAuthEnabledClient()).toBe(true)
    expect(isSocialGraphEnabledClient()).toBe(true)
    expect(isUserProfilesEnabledClient()).toBe(true)
    expect(isEmailAuthEnabledClient()).toBe(true)
  })

  it('does NOT depend on NODE_ENV — stays enabled in a production build when unset', () => {
    delete process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED
    const originalNodeEnv = process.env.NODE_ENV
    // @ts-expect-error - NODE_ENV is readonly in the type defs, writable at runtime
    process.env.NODE_ENV = 'production'
    try {
      expect(isAppleAuthEnabledClient()).toBe(true)
    } finally {
      // @ts-expect-error - restore
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('still respects an explicit kill switch (false)', () => {
    process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED = 'false'
    expect(isAppleAuthEnabledClient()).toBe(false)
  })

  it('still respects an explicit true value', () => {
    process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED = 'true'
    expect(isAppleAuthEnabledClient()).toBe(true)
  })
})

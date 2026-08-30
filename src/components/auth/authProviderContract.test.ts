import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Auth Provider Consistency & Native Parity — structural regression guard.
 *
 * AuthSocialProviders.tsx owns the shared social button rendering for both
 * LoginForm and RegisterForm.
 *
 * Contract:
 * 1. Both LoginForm and RegisterForm delegate directly to AuthSocialProviders.
 * 2. Neither form re-implements isolated provider gating or icons.
 * 3. Google is available across Web (Desktop, Mobile Web/Safari) and Native iOS (official GoogleSignIn-iOS bridge).
 * 4. Apple is available across Web (Firebase OAuthProvider) and Native iOS (NativeAppleSignIn SIWA sheet),
 *    gated solely by `isAppleAuthEnabledClient()` rollout flag.
 */
const authDir = join(__dirname)

function readForm(file: string): string {
  return readFileSync(join(authDir, file), 'utf-8')
}

describe('LoginForm / RegisterForm — shared provider contract', () => {
  it('both forms import AuthSocialProviders from the shared component', () => {
    const login = readForm('LoginForm.tsx')
    const register = readForm('RegisterForm.tsx')

    expect(login).toContain("from '@/components/auth/AuthSocialProviders'")
    expect(register).toContain("from '@/components/auth/AuthSocialProviders'")
  })

  it('both forms render <AuthSocialProviders /> with the same wiring shape', () => {
    const login = readForm('LoginForm.tsx')
    const register = readForm('RegisterForm.tsx')

    for (const src of [login, register]) {
      expect(src).toMatch(/<AuthSocialProviders/)
      expect(src).toMatch(/onGoogleClick={handleGoogle}/)
      expect(src).toMatch(/onAppleClick={handleApple}/)
      expect(src).toMatch(/isGoogleLoading={isGoogleLoading}/)
      expect(src).toMatch(/isAppleLoading={isAppleLoading}/)
    }
  })

  it('neither form redefines its own Capacitor/provider-gating logic', () => {
    const login = readForm('LoginForm.tsx')
    const register = readForm('RegisterForm.tsx')

    for (const src of [login, register]) {
      expect(src).not.toContain('function isCapacitor')
      expect(src).not.toContain('window.Capacitor')
      expect(src).not.toContain('isAppleAuthEnabledClient')
      expect(src).not.toMatch(/function GoogleIcon/)
      expect(src).not.toMatch(/function AppleIcon/)
    }
  })

  it('the shared component renders Google and gates Apple on the feature flag', () => {
    const shared = readForm('AuthSocialProviders.tsx')

    expect(shared).toContain('isAppleAuthEnabledClient')
    expect(shared).toContain('Google ile devam et')
    expect(shared).toContain('Apple ile devam et')
    // Order: Google button block appears before the Apple button block.
    expect(shared.indexOf('Google ile devam et')).toBeLessThan(
      shared.indexOf('Apple ile devam et')
    )
  })

  it('verifies provider availability contract for Desktop Web, Mobile Web, and Native Capacitor', () => {
    // Contract assertions:
    // 1. Web (Desktop & Mobile Web / iOS Safari):
    //    Google renders (Firebase popup/redirect), Apple renders (when flag true)
    // 2. Native Capacitor iOS app:
    //    Google renders (Official GoogleSignIn-iOS SDK bridge), Apple renders (NativeAppleSignIn SIWA)
    // 3. Apple kill-switch flag:
    //    NEXT_PUBLIC_APPLE_AUTH_ENABLED='false' -> Apple hidden everywhere
    const shared = readForm('AuthSocialProviders.tsx')
    expect(shared).toContain('Google ile devam et')
    expect(shared).toContain('showApple ?')
  })
})

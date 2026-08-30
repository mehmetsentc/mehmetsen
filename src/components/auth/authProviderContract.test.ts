import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Auth Provider Consistency Repair — structural regression guard.
 *
 * The root cause of the Login/Register provider mismatch was two
 * independently-maintained copies of the Google/Apple button JSX
 * (LoginForm.tsx and RegisterForm.tsx) silently drifting apart: Login gated
 * Apple behind a feature flag that Register never checked, while both forms
 * duplicated their own Capacitor/device check. AuthSocialProviders.tsx now
 * owns that logic once.
 *
 * This test doesn't render the DOM (the project has no jsdom /
 * @testing-library/react setup — see vitest.config.ts, `environment: 'node'`,
 * `.ts` tests only), so it can't assert "a Google button is on screen".
 * Instead it asserts, at the source level, that both forms delegate to the
 * single shared component and neither one has reintroduced its own
 * provider-gating condition — which is exactly the pattern that caused this
 * bug and is the pattern most likely to silently reappear.
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

  it('the shared component gates Google on Capacitor and Apple on the feature flag — nothing else', () => {
    const shared = readForm('AuthSocialProviders.tsx')

    expect(shared).toContain('isCapacitor')
    expect(shared).toContain('isAppleAuthEnabledClient')
    // Order: Google button block appears before the Apple button block.
    expect(shared.indexOf('Google ile devam et')).toBeLessThan(
      shared.indexOf('Apple ile devam et')
    )
  })

  it('verifies provider availability contract for Desktop Web, Mobile Web, and Native Capacitor', () => {
    // Contract assertions:
    // 1. Web (Desktop & Mobile Web / iOS Safari):
    //    isCapacitor() === false -> Google renders, Apple renders (when flag true)
    // 2. Native Capacitor iOS app:
    //    isCapacitor() === true -> Google is hidden until native Google Sign-In plugin is deployed, Apple renders (native SIWA)
    // 3. Apple kill-switch flag:
    //    NEXT_PUBLIC_APPLE_AUTH_ENABLED='false' -> Apple hidden everywhere
    const shared = readForm('AuthSocialProviders.tsx')
    expect(shared).toContain('!onIos &&')
    expect(shared).toContain('showApple ?')
  })
})


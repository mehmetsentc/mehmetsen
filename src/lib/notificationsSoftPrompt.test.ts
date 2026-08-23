import { beforeEach, describe, expect, it, vi } from 'vitest'

function makeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v))
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    clear: () => map.clear(),
  }
}

describe('notificationsSoftPrompt', () => {
  beforeEach(() => {
    vi.resetModules()

    const local = makeStorage()
    const session = makeStorage()

    vi.stubGlobal('localStorage', local)
    vi.stubGlobal('sessionStorage', session)
    vi.stubGlobal('window', {
      localStorage: local,
      sessionStorage: session,
      innerWidth: 390,
      matchMedia: () => ({ matches: true }),
      Notification: { permission: 'default' },
      Capacitor: undefined,
    })
    vi.stubGlobal('Notification', { permission: 'default' })
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
  })

  it('never shows when permission is granted', async () => {
    ;(window as unknown as { Notification: { permission: string } }).Notification.permission =
      'granted'
    ;(Notification as unknown as { permission: string }).permission = 'granted'
    const mod = await import('./notificationsSoftPrompt')
    expect(mod.shouldShowNotificationsSoftPrompt()).toBe(false)
    expect(localStorage.getItem(mod.SOFT_PROMPT_GRANTED_KEY)).toBe('1')
  })

  it('shows on first visit when default and mobile', async () => {
    const mod = await import('./notificationsSoftPrompt')
    expect(mod.shouldShowNotificationsSoftPrompt()).toBe(true)
  })

  it('hides after dismiss for current version', async () => {
    const mod = await import('./notificationsSoftPrompt')
    mod.markSoftPromptDismissedForVersion(mod.getSoftPromptAppVersion())
    expect(mod.shouldShowNotificationsSoftPrompt()).toBe(false)
  })

  it('shows again after version bump if still off', async () => {
    const mod = await import('./notificationsSoftPrompt')
    mod.markSoftPromptDismissedForVersion('old-sha')
    expect(mod.shouldShowNotificationsSoftPrompt()).toBe(true)
  })

  it('does not spam within the same session', async () => {
    const mod = await import('./notificationsSoftPrompt')
    mod.markSoftPromptShownThisSession()
    expect(mod.shouldShowNotificationsSoftPrompt()).toBe(false)
  })

  it('skips desktop user agents', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    })
    vi.stubGlobal('window', {
      ...window,
      innerWidth: 1280,
      matchMedia: () => ({ matches: false }),
      Capacitor: undefined,
      Notification: { permission: 'default' },
    })
    const mod = await import('./notificationsSoftPrompt')
    expect(mod.isMobileNotificationSurface()).toBe(false)
    expect(mod.shouldShowNotificationsSoftPrompt()).toBe(false)
  })
})

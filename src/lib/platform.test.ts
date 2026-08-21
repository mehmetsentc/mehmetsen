import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('platform', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      navigator: { userAgent: 'Mozilla/5.0', standalone: false },
    })
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      standalone: false,
    })
  })

  it('isNativeApp is false in plain Safari / browser', async () => {
    const mod = await import('./platform')
    expect(mod.isNativeApp()).toBe(false)
    expect(mod.shouldShowWebInstallCta()).toBe(true)
  })

  it('isNativeApp is true when Capacitor.isNativePlatform() is true', async () => {
    ;(window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor = {
      isNativePlatform: () => true,
    }
    const mod = await import('./platform')
    expect(mod.isNativeApp()).toBe(true)
    expect(mod.isCapacitorNative()).toBe(true)
    expect(mod.shouldShowWebInstallCta()).toBe(false)
  })

  it('isNativeApp is true when Capacitor platform is ios', async () => {
    ;(window as unknown as { Capacitor: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => 'ios',
    }
    const mod = await import('./platform')
    expect(mod.isNativeApp()).toBe(true)
    expect(mod.isIOSNative()).toBe(true)
    expect(mod.shouldShowWebInstallCta()).toBe(false)
  })

  it('isNativeApp is true when Cordova bridge exists', async () => {
    ;(window as unknown as { cordova: object }).cordova = { platformId: 'ios' }
    const mod = await import('./platform')
    expect(mod.isNativeApp()).toBe(true)
    expect(mod.shouldShowWebInstallCta()).toBe(false)
  })

  it('isNativeApp is true for Capacitor UA marker', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone) Capacitor/8.0.0',
    })
    Object.defineProperty(window, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (iPhone) Capacitor/8.0.0' },
      configurable: true,
    })
    const mod = await import('./platform')
    expect(mod.isNativeApp()).toBe(true)
  })

  it('standalone PWA alone does not count as native', async () => {
    vi.stubGlobal('window', {
      matchMedia: (q: string) => ({
        matches: q.includes('display-mode: standalone'),
      }),
      navigator: { userAgent: 'Mozilla/5.0 (iPhone)', standalone: true },
      Capacitor: undefined,
    })
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone)',
      standalone: true,
    })
    const mod = await import('./platform')
    expect(mod.isNativeApp()).toBe(false)
    expect(mod.isPwaStandaloneDisplay()).toBe(true)
    expect(mod.shouldShowWebInstallCta()).toBe(false)
  })

  it('Capacitor web mode (isNativePlatform false, platform web) is not native', async () => {
    ;(window as unknown as {
      Capacitor: { isNativePlatform: () => boolean; getPlatform: () => string }
    }).Capacitor = {
      isNativePlatform: () => false,
      getPlatform: () => 'web',
    }
    const mod = await import('./platform')
    expect(mod.isNativeApp()).toBe(false)
    expect(mod.shouldShowWebInstallCta()).toBe(true)
  })
})

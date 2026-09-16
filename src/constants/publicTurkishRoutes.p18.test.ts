import { describe, expect, it } from 'vitest'
import { isHomePathname, isPublicRoute, pathIs, ROUTES } from '@/constants/routes'

describe('Türkçe kamu yolları', () => {
  it('anasayfa / ve eski /feed', () => {
    expect(ROUTES.FEED).toBe('/')
    expect(ROUTES.HOME).toBe('/')
    expect(isHomePathname('/')).toBe(true)
    expect(isHomePathname('/feed')).toBe(true)
    expect(isHomePathname('/kategori/gundem')).toBe(false)
  })

  it('kullanıcıya görünen yollar Türkçe', () => {
    expect(ROUTES.SEARCH).toBe('/ara')
    expect(ROUTES.SETTINGS).toBe('/ayarlar')
    expect(ROUTES.NOTIFICATIONS).toBe('/bildirimler')
    expect(ROUTES.MESSAGES).toBe('/mesajlar')
    expect(ROUTES.WEATHER).toBe('/hava-durumu')
    expect(ROUTES.EVENTS).toBe('/etkinlikler')
    expect(ROUTES.DISCOVER).toBe('/kesfet')
    expect(ROUTES.LOGIN).toBe('/giris')
    expect(ROUTES.REGISTER).toBe('/kayit')
    expect(ROUTES.SAVED).toBe('/kaydedilenler')
    expect(ROUTES.INFLUENCER).toBe('/fenomenler')
    expect(ROUTES.PROFILE('ayse')).toBe('/profil/ayse')
  })

  it('eski İngilizce yollar hâlâ kamu ve eşleşir', () => {
    expect(isPublicRoute('/')).toBe(true)
    expect(isPublicRoute('/feed')).toBe(true)
    expect(isPublicRoute('/ara')).toBe(true)
    expect(isPublicRoute('/search')).toBe(true)
    expect(isPublicRoute('/giris')).toBe(true)
    expect(isPublicRoute('/login')).toBe(true)
    expect(pathIs('/ayarlar/gizlilik', ROUTES.SETTINGS, '/settings')).toBe(true)
    expect(pathIs('/settings/privacy', ROUTES.SETTINGS, '/settings')).toBe(true)
  })
})

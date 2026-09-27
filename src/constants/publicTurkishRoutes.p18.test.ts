import { describe, expect, it } from 'vitest'
import { isHomePathname, isProfileSurface, isPublicRoute, pathIs, ROUTES, shouldShowSiteFooter } from '@/constants/routes'

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

  it('profil yüzeyinde kategori şeridi yok', () => {
    expect(isProfileSurface('/profil/nahabercom')).toBe(true)
    expect(isProfileSurface('/profile/ayse')).toBe(true)
    expect(isProfileSurface('/u/ayse')).toBe(true)
    expect(isProfileSurface('/yazar/ulke-iran')).toBe(true)
    expect(isProfileSurface('/publisher/dunya')).toBe(true)
    expect(isProfileSurface('/')).toBe(false)
    expect(isProfileSurface('/kategori/gundem')).toBe(false)
    expect(isProfileSurface('/publisher-studio/dunya')).toBe(false)
  })

  it('footer yalnızca ana sayfa, kategori ve haberde', () => {
    expect(shouldShowSiteFooter('/')).toBe(true)
    expect(shouldShowSiteFooter('/feed')).toBe(true)
    expect(shouldShowSiteFooter('/kategori/gundem')).toBe(true)
    expect(shouldShowSiteFooter('/haber/ornek-haber')).toBe(true)
    expect(shouldShowSiteFooter('/post/abc')).toBe(true)
    expect(shouldShowSiteFooter('/profil/ayse')).toBe(false)
    expect(shouldShowSiteFooter('/profile/ayse')).toBe(false)
    expect(shouldShowSiteFooter('/u/ayse')).toBe(false)
    expect(shouldShowSiteFooter('/yazar/ulke-iran')).toBe(false)
    expect(shouldShowSiteFooter('/publisher/dunya')).toBe(false)
    expect(shouldShowSiteFooter('/kaynak/dunya')).toBe(false)
    expect(shouldShowSiteFooter('/post/create')).toBe(false)
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

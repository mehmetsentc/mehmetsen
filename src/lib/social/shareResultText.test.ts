import { describe, expect, it } from 'vitest'
import { describeShareResult, metaCodeFromSafeError, readJsonResponse, shareState, unreadableResponseText } from './shareResultText'

describe('shareResultText — platform bazında güvenli sonuç metni', () => {
  it('production olayı: legacy token oturumu geçersiz (190/460) → yeniden bağlantı mesajı, legacy olarak etiketlenir', () => {
    const r = { success: false, error: 'Instagram story reddedildi (HTTP 400, kod 190/460)' }
    expect(metaCodeFromSafeError(r.error)).toEqual({ code: 190, subcode: 460 })
    expect(shareState(r)).toBe('token_invalid')
    const line = describeShareResult('Hikâye IG', r)
    expect(line).toBe('Hikâye IG (Onyeditivi eski bağlantı): ✗ erişim anahtarı geçersiz — hesabı yeniden bağlayın')
  })

  it('seçilen OAuth hesabı ve kilit / kayıt durumları ayrı gösterilir', () => {
    expect(describeShareResult('Post IG', { success: true, accountId: 'instagram_1' })).toBe('Post IG (seçilen hesap): ✓ yayımlandı')
    expect(shareState({ success: false, code: 'already_published', accountId: 'instagram_1' })).toBe('already_published')
    expect(shareState({ success: false, code: 'in_progress' })).toBe('in_progress')
    expect(shareState({ success: false, code: 'uncertain_previous_attempt' })).toBe('uncertain_previous_attempt')
    expect(shareState({ success: false, ledgerStatus: 'uncertain', error: 'Instagram post zaman aşımı' })).toBe('uncertain')
    expect(describeShareResult('Post Th', { success: false, ledgerStatus: 'uncertain' })).toContain('otomatik tekrar yok')
    expect(shareState({ success: false, error: 'not attempted' })).toBe('not_attempted')
    expect(shareState(undefined)).toBe('not_attempted')
  })

  it('izin ve hız sınırı kodları sınıflanır; bilinmeyen hata güvenli metniyle kalır', () => {
    expect(shareState({ success: false, error: 'Facebook post reddedildi (HTTP 403, kod 200)' })).toBe('permission')
    expect(shareState({ success: false, error: 'Facebook post reddedildi (HTTP 400, kod 4)' })).toBe('rate_limited')
    const other = { success: false, error: 'Facebook post reddedildi (HTTP 400, kod 100/2018001)' }
    expect(shareState(other)).toBe('failed')
    expect(describeShareResult('Post FB', other)).toBe('Post FB (Onyeditivi eski bağlantı): ✗ başarısız (Facebook post reddedildi (HTTP 400, kod 100/2018001))')
  })

  it('JSON olmayan yanıt "Bağlantı hatası" yerine HTTP durumuyla raporlanır', async () => {
    const html = new Response('<html>Bad Gateway</html>', { status: 502 })
    expect(await readJsonResponse(html)).toEqual({ ok: false, status: 502 })
    const ok = new Response('{"error":"x"}', { status: 502 })
    expect(await readJsonResponse(ok)).toEqual({ ok: true, data: { error: 'x' } })
    expect(unreadableResponseText(502)).toContain('HTTP 502')
    expect(unreadableResponseText(0)).toContain('ağ hatası')
    expect(unreadableResponseText(502)).not.toContain('Bağlantı hatası')
  })
})

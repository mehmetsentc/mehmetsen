import { describe, expect, it } from 'vitest'
import { automationSensitivityBlock, classifySensitivity, neutralizeHashtags, neutralizeSocialText, sensitivityFromDoc } from './sensitiveNews'

describe('nötr haber dili (sosyal)', () => {
  it('Küçükçekmece örneği: büyük harf korunur', () => {
    expect(neutralizeSocialText("KÜÇÜKÇEKMECE'DE MOTOSİKLET OTOMOBİLLE ÇARPIŞTI: 21 YAŞINDAKİ SÜRÜCÜ ÖLDÜ")).toBe(
      "KÜÇÜKÇEKMECE'DE MOTOSİKLET OTOMOBİLLE ÇARPIŞTI: 21 YAŞINDAKİ SÜRÜCÜ HAYATINI KAYBETTİ",
    )
    expect(neutralizeSocialText("Küçükçekmece'de motosiklet otomobille çarpıştı: 21 yaşındaki sürücü öldü")).toBe(
      "Küçükçekmece'de motosiklet otomobille çarpıştı: 21 yaşındaki sürücü hayatını kaybetti",
    )
  })
  it('ölü / ceset / kalıplar', () => {
    expect(neutralizeSocialText('Zincirleme kazada 2 ölü, 5 yaralı')).toBe('Zincirleme kazada 2 kişi hayatını kaybetti, 5 yaralı')
    expect(neutralizeSocialText('Evinde ölü bulundu')).toBe('Evinde hayatını kaybetmiş olarak bulundu')
    expect(neutralizeSocialText('Ormanda ceset bulundu. Cesedi otopsiye kaldırıldı.')).toBe('Ormanda cansız beden bulundu. Cansız bedeni otopsiye kaldırıldı.')
    expect(neutralizeSocialText('Kazada ölenlerin kimlikleri belli oldu')).toBe('Kazada hayatını kaybedenlerin kimlikleri belli oldu')
    expect(neutralizeSocialText('Kan donduran olay: genç adam can verdi')).toBe('Olay: genç adam hayatını kaybetti')
  })
  it('alakasız kelimelere dokunmaz', () => {
    const s = 'Ölçüm sonuçları açıklandı, Öldürücü virüs değil. Bölen sayısı 3. https://nahaber.com/x-oldu'
    expect(neutralizeSocialText(s)).toBe(s)
    expect(neutralizeSocialText('Belediye yeni parkı açtı')).toBe('Belediye yeni parkı açtı')
  })
  it('bağlantılar korunur', () => {
    expect(neutralizeSocialText('📰 Ormanda ceset bulundu\n\nHaberi Oku:\nhttps://nahaber.com/haber/ormanda-ceset-bulundu-123\n\n#asayiş')).toBe(
      '📰 Ormanda cansız beden bulundu\n\nHaberi Oku:\nhttps://nahaber.com/haber/ormanda-ceset-bulundu-123\n\n#asayiş',
    )
  })
  it('hassas hashtagler çıkarılır', () => {
    expect(neutralizeHashtags(['#cinayet', '#Küçükçekmece', '#İntihar', 'asayiş', '#ölümlükaza'])).toEqual(['#Küçükçekmece', 'asayiş'])
    expect(neutralizeSocialText('Haber metni.\n\n#cinayet #Ankara #asayiş')).toBe('Haber metni.\n\n#Ankara #asayiş')
  })
})

describe('hassasiyet düzeyi', () => {
  it('düzeyler', () => {
    expect(classifySensitivity({ title: 'Belediye yeni bisiklet yolunu açtı' }).level).toBe(0)
    expect(classifySensitivity({ title: 'Uyuşturucu operasyonunda 5 gözaltı' }).level).toBe(1)
    expect(classifySensitivity({ title: 'Kavşakta kaza: 3 yaralı' }).level).toBe(1)
    expect(classifySensitivity({ title: "Küçükçekmece'de motosiklet otomobille çarpıştı: 21 yaşındaki sürücü öldü" }).level).toBe(2)
    expect(classifySensitivity({ title: 'Ankara’da silahlı saldırı', body: 'Saldırıda bir kişi hayatını kaybetti.' }).level).toBe(2)
    expect(classifySensitivity({ title: 'Genç kadın intihar etti' }).level).toBe(3)
    expect(classifySensitivity({ title: '7 yaşındaki çocuk havuzda boğularak hayatını kaybetti' }).level).toBe(3)
    expect(classifySensitivity({ title: 'Çocuk parkı yenilendi' }).level).toBe(0)
    expect(classifySensitivity({ title: 'Okul servisi devrildi, 4 çocuk yaralandı' }).level).toBe(1)
  })
  it('editör kararı önce gelir; belgeden okunur', () => {
    expect(sensitivityFromDoc({ title: 'Sürücü öldü', socialSensitivity: 0 }).level).toBe(0)
    expect(sensitivityFromDoc({ title: 'Olay yerinde', content: '<p>Yaşlı adam evinde ölü bulundu.</p>' }).level).toBe(2)
  })
  it('otomatik paylaşım kapısı', () => {
    expect(automationSensitivityBlock(0, 'reel')).toBeNull()
    expect(automationSensitivityBlock(1, 'story')).toBeNull()
    expect(automationSensitivityBlock(2, 'post')).toBeNull()
    expect(automationSensitivityBlock(2, 'reel')).toBe('sensitive_format')
    expect(automationSensitivityBlock(2, 'story')).toBe('sensitive_format')
    expect(automationSensitivityBlock(3, 'post')).toBe('sensitive_blocked')
  })
})

describe('yöntem ifadeleri (DSÖ / RTÜK)', () => {
  it('yöntem ve ölüm birlikteyse yalnız «hayatını kaybetti» kalır', () => {
    expect(neutralizeSocialText('Genç adam kendini tabancayla vurarak intihar etti')).toBe('Genç adam yaşamına son verdi')
    expect(neutralizeSocialText('Kadın evinde kendini asarak yaşamına son verdi.')).toBe('Kadın evinde yaşamına son verdi.')
    expect(neutralizeSocialText('KENDİNİ KÖPRÜDEN ATARAK İNTİHAR ETTİ')).toBe('YAŞAMINA SON VERDİ')
    expect(neutralizeSocialText('Öğrenci canına kıydı')).toBe('Öğrenci yaşamına son verdi')
  })
  it('ölüm bilgisi yoksa olgu korunur, yöntem çıkar', () => {
    expect(neutralizeSocialText('Polis memuru kendini av tüfeğiyle vurdu, hastaneye kaldırıldı')).toBe('Polis memuru kendine zarar verdi, hastaneye kaldırıldı')
    expect(neutralizeSocialText('Kendini balkondan attı')).toBe('Kendine zarar verdi')
    expect(neutralizeSocialText('Genç kız intihara teşebbüs etti')).toBe('Genç kız kendine zarar verdi')
    expect(neutralizeSocialText('intihar salgını uyarısı')).toBe('yaşamına son verme vakalarındaki artış uyarısı')
  })
  it('mecaz ve başka anlamlar değişmez', () => {
    expect(neutralizeSocialText('Kendini savunmak için hırsızı vurdu')).toBe('Kendini savunmak için hırsızı vurdu')
    expect(neutralizeSocialText('Yağmur başlayınca kendini dışarı attı')).toBe('Yağmur başlayınca kendini dışarı attı')
    expect(neutralizeSocialText('Kendini işine verdi')).toBe('Kendini işine verdi')
  })
})

describe('elle paylaşım: düzey 3', () => {
  it('paylaşım engellenmez: bilgi notu; gönderiye yardım satırı bir kez eklenir', async () => {
    const { sensitiveShareNotice, isGraveNews, withHelpLine, HELP_LINE_TEXT } = await import('./sensitiveNews')
    const suicide = { title: 'Genç adam evinde hayatını kaybetti', content: 'Polis intihar olasılığı üzerinde duruyor.' }
    const crash = { title: 'Kazada 2 kişi hayatını kaybetti', content: 'Otomobil devrildi.' }
    expect(sensitiveShareNotice(suicide)).toMatch(/kurallarına göre hazırlandı/)
    expect(sensitiveShareNotice(suicide)).toMatch(/yardım satırı/)
    expect(sensitiveShareNotice(crash)).toMatch(/müziksiz/)
    expect(sensitiveShareNotice({ title: 'Belediye yeni parkı açtı' })).toBeNull()
    expect(isGraveNews(suicide)).toBe(true)
    expect(isGraveNews(crash)).toBe(true)
    const c = withHelpLine('📰 Haber', suicide)
    expect(c.endsWith(HELP_LINE_TEXT)).toBe(true)
    expect(withHelpLine(c, suicide)).toBe(c)
    expect(withHelpLine('📰 Haber', crash)).toBe('📰 Haber')
  })
})

describe('yasak kelimeler: ölü / ölüm / öldü / intihar (26.11.2026)', () => {
  const banned = /(?<![\p{L}])(?:öl(?:ü|d|m|e)|intihar)/iu
  it('seslendirme örnekleri', () => {
    const cases: Array<[string, string]> = [
      ['Evinde ölü bulunan yaşlı adamın cenazesi defnedildi', 'Evinde hayatını kaybetmiş olarak bulunan yaşlı adamın cenazesi defnedildi'],
      ['Ölümlü kazada 2 ölü, 3 yaralı var', 'Can kayıplı kazada 2 kişi hayatını kaybetti, 3 yaralı var'],
      ['Ahmet Yılmaz\'ın ölümü ailesini yasa boğdu', 'Ahmet Yılmaz\'ın vefatı ailesini yasa boğdu'],
      ['Silahlı saldırıda öldürülen genç toprağa verildi', 'Silahlı saldırıda hayatını kaybeden genç toprağa verildi'],
      ['Polis intihar olasılığı üzerinde duruyor', 'Polis yaşamına son verme olasılığı üzerinde duruyor'],
      ['Kazada ölü ve yaralılar hastaneye kaldırıldı', 'Kazada hayatını kaybeden ve yaralananlar hastaneye kaldırıldı'],
      ['Ölümcül kaza kamerada', 'Can kaybına yol açan kaza kamerada'],
      ['Sürücünün ölümüne neden oldu', 'Sürücünün hayatını kaybetmesine neden oldu'],
    ]
    for (const [a, b] of cases) {
      const out = neutralizeSocialText(a)
      expect(out).toBe(b)
      expect(banned.test(out)).toBe(false)
    }
  })
  it('benzer ama farklı kelimelere dokunmaz', () => {
    for (const s of ['Ölçüm sonuçları açıklandı', 'Bölümün başkanı', 'Ölçek büyüdü', 'Kendini işine verdi']) expect(neutralizeSocialText(s)).toBe(s)
  })
})

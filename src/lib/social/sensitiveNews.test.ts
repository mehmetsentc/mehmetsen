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
    expect(neutralizeSocialText('Evinde ölü bulundu')).toBe('Evinde hayatını kaybetmiş halde bulundu')
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
    expect(neutralizeSocialText('Genç adam kendini tabancayla vurarak intihar etti')).toBe('Genç adam hayatını kaybetti')
    expect(neutralizeSocialText('Kadın evinde kendini asarak yaşamına son verdi.')).toBe('Kadın evinde hayatını kaybetti.')
    expect(neutralizeSocialText('KENDİNİ KÖPRÜDEN ATARAK İNTİHAR ETTİ')).toBe('HAYATINI KAYBETTİ')
    expect(neutralizeSocialText('Öğrenci canına kıydı')).toBe('Öğrenci hayatını kaybetti')
  })
  it('ölüm bilgisi yoksa olgu korunur, yöntem çıkar', () => {
    expect(neutralizeSocialText('Polis memuru kendini av tüfeğiyle vurdu, hastaneye kaldırıldı')).toBe('Polis memuru intihar girişiminde bulundu, hastaneye kaldırıldı')
    expect(neutralizeSocialText('Kendini balkondan attı')).toBe('İntihar girişiminde bulundu')
    expect(neutralizeSocialText('Genç kız intihara teşebbüs etti')).toBe('Genç kız intihar girişiminde bulundu')
    expect(neutralizeSocialText('intihar salgını uyarısı')).toBe('intihar vakalarındaki artış uyarısı')
  })
  it('mecaz ve başka anlamlar değişmez', () => {
    expect(neutralizeSocialText('Kendini savunmak için hırsızı vurdu')).toBe('Kendini savunmak için hırsızı vurdu')
    expect(neutralizeSocialText('Yağmur başlayınca kendini dışarı attı')).toBe('Yağmur başlayınca kendini dışarı attı')
    expect(neutralizeSocialText('Kendini işine verdi')).toBe('Kendini işine verdi')
  })
})

describe('elle paylaşım: düzey 3', () => {
  it('intihar haberinde video engellenir, gönderiye yardım satırı bir kez eklenir', async () => {
    const { manualVideoBlocked, withHelpLine, HELP_LINE_TEXT } = await import('./sensitiveNews')
    const suicide = { title: 'Genç adam evinde hayatını kaybetti', content: 'Polis intihar olasılığı üzerinde duruyor.' }
    const crash = { title: 'Kazada 2 kişi hayatını kaybetti', content: 'Otomobil devrildi.' }
    expect(manualVideoBlocked(suicide)).toBe(true)
    expect(manualVideoBlocked(crash)).toBe(false)
    const c = withHelpLine('📰 Haber', suicide)
    expect(c.endsWith(HELP_LINE_TEXT)).toBe(true)
    expect(withHelpLine(c, suicide)).toBe(c)
    expect(withHelpLine('📰 Haber', crash)).toBe('📰 Haber')
  })
})

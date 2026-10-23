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

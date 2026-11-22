import { describe, expect, it } from 'vitest'
import { resolveSourceContentGeo } from './sourceContentGeo'

describe('resolveSourceContentGeo (Görev 43)', () => {
  it('il + ilçe kalıbı en güçlü sinyal', () => {
    const g = resolveSourceContentGeo({
      title: 'Yolcu otobüsü devrildi: 12 yaralı',
      body: "İzmir'den Bursa'ya giden yolcu otobüsü Balıkesir'in Susurluk ilçesinde devrildi.",
    })
    expect(g.citySlug).toBe('balikesir')
    expect(g.districtSlug).toBe('susurluk')
    expect(g.confidence).toBe('high')
  })

  it('yalnızca ilçe adı geçen yerel haber ilini bulur', () => {
    const g = resolveSourceContentGeo({
      title: "Biga'da trafik kazası: 1 yaralı",
      body: 'Kaza Biga-Çan karayolunda meydana geldi.',
    })
    expect(g.citySlug).toBe('canakkale')
    expect(g.confidence).toBe('high')
  })

  it('üniversite adı konum sayılmaz', () => {
    const g = resolveSourceContentGeo({
      title: "Sakarya Üniversitesi öğrencileri Antalya'da COP31'e katıldı",
      body: "Etkinlik Antalya'da düzenlendi.",
    })
    expect(g.citySlug).toBe('antalya')
  })

  it('il adı geçmeyen ulusal haber il almaz', () => {
    const g = resolveSourceContentGeo({
      title: 'Merkez Bankası faiz kararını açıkladı',
      body: "Politika faizi yüzde 35'te sabit tutuldu.",
    })
    expect(g.citySlug).toBeNull()
  })

  it('çok ilde uyarı → ulusal', () => {
    const g = resolveSourceContentGeo({
      title: "Meteoroloji'den 6 ile sarı kod: Antalya, Mersin, Adana, Muğla, Hatay ve Osmaniye",
      body: 'Antalya, Mersin, Adana, Muğla, Hatay ve Osmaniye için kuvvetli yağış uyarısı yapıldı.',
    })
    expect(g.citySlug).toBeNull()
    expect(g.likelyNational).toBe(true)
  })

  it('kısa metin → bilinmiyor', () => {
    expect(resolveSourceContentGeo({ title: 'Kısa' }).citySlug).toBeNull()
  })
})

import { sourceGeoOverride } from './sourceContentGeo'
import { enrichGeo } from '@/services/newsroom/geoEngine'

describe('sourceGeoOverride (Görev 43)', () => {
  const balikesir = resolveSourceContentGeo({
    title: 'Otobüs devrildi',
    body: "Balıkesir'in Susurluk ilçesinde yolcu otobüsü devrildi.",
  })
  it('kaynak gazetenin ili farklıysa içerik ili gelir', () => {
    const o = sourceGeoOverride('canakkale', balikesir)
    expect(o?.forcedCitySlug).toBe('balikesir')
    expect(o?.forcedDistrict).toBe('Susurluk')
  })
  it('aynı il ve ilçe yoksa dokunmaz', () => {
    const g = resolveSourceContentGeo({ title: "Çanakkale'de festival", body: "Çanakkale'de festival başladı." })
    expect(sourceGeoOverride('canakkale', g)).toBeNull()
  })
  it('ulusal haberde kaynak ili düşer', () => {
    const g = resolveSourceContentGeo({
      title: "6 ile sarı kod: Antalya, Mersin, Adana, Muğla, Hatay ve Osmaniye",
      body: 'Antalya, Mersin, Adana, Muğla, Hatay ve Osmaniye için uyarı.',
    })
    expect(sourceGeoOverride('hakkari', g)).toEqual({
      forcedCitySlug: undefined,
      forcedCity: undefined,
      forcedDistrict: undefined,
    })
  })
  it('düşük güvende dokunmaz', () => {
    expect(sourceGeoOverride('canakkale', resolveSourceContentGeo({ title: 'Merkez Bankası faiz kararı' }))).toBeNull()
  })
})

describe('enrichGeo — model ili yalnızca kaynak metinle kabul edilir (Görev 43)', () => {
  it('modelin yeniden yazımda uydurduğu il kaynakta yoksa düşer', () => {
    const geo = enrichGeo(
      {
        title: "Çanakkale'de belediye yeni otobüs hattı açtı",
        description: "Çanakkale'de yeni hat hizmete girdi.",
        summary: '',
        content: '',
        city: 'Çanakkale',
        tags: [],
        categoryId: 'yerel-haber',
      } as never,
      [],
      { categoryId: 'yerel-haber', evidenceText: 'Belediye yeni otobüs hattını hizmete açtı. Hat sabah saatlerinde çalışacak.' }
    )
    expect(geo.citySlug || '').not.toBe('canakkale')
  })
})

describe('sourceGeoOverride — ulusal kaynak', () => {
  it('kaynağın ili yoksa dokunmaz', () => {
    const g = resolveSourceContentGeo({ title: "Bakan Ankara'da açıklama yaptı", body: "Bakan Ankara'da basın toplantısı düzenledi." })
    expect(sourceGeoOverride('', g)).toBeNull()
  })
})

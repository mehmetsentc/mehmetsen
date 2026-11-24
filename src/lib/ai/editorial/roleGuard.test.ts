import { describe, expect, it } from 'vitest'
import { findRoleMentions, guardArticleRoles, guardRoles } from './roleGuard'

describe('roleGuard — kişi unvanı kaynağa sadakat', () => {
  it('kaynakta başka parti yazıyorsa yanlış parti unvanını kaynağınkiyle değiştirir', () => {
    const source =
      "Yeni Parti Genel Başkanı Özgür Özel, Manisa'da yaptığı açıklamada seçim çağrısını yineledi."
    const out = guardRoles(
      "Bu sözler, CHP Genel Başkanı Özgür Özel'in Manisa ziyaretinde gündeme geldi.",
      source
    )
    expect(out.text).toBe(
      "Bu sözler, Yeni Parti Genel Başkanı Özgür Özel'in Manisa ziyaretinde gündeme geldi."
    )
    expect(out.fixes[0]?.action).toBe('replaced')
  })

  it('kaynakta unvan yoksa uydurulan unvanı siler, adı bırakır', () => {
    const source = "Dutlulu, \"Özgür Özel'e sürpriz olabilir\" ifadelerini kullandı."
    const out = guardRoles("CHP Genel Başkanı Özgür Özel'e yönelik iddia tartışma yarattı.", source)
    expect(out.text).toBe("Özgür Özel'e yönelik iddia tartışma yarattı.")
    expect(out.fixes[0]?.action).toBe('removed')
  })

  it('kaynak "eski" diyorsa çıktıya "eski" ekler', () => {
    const source = 'Eski Fenerbahçe Kulübü Başkanı Ali Koç, maçı locasından izledi.'
    const out = guardRoles('Maçı Fenerbahçe Kulübü Başkanı Ali Koç da izledi.', source)
    expect(out.text).toBe('Maçı eski Fenerbahçe Kulübü Başkanı Ali Koç da izledi.')
    expect(out.fixes[0]?.action).toBe('marked_former')
  })

  it('kaynakta başka kurumun başkanıysa kulüp unvanını kaynaktakiyle değiştirir', () => {
    const source = 'Açılışa Koç Holding Yönetim Kurulu Başkanı Ali Koç da katıldı.'
    const out = guardRoles("Fenerbahçe Başkanı Ali Koç, mağazada tezgâha geçti.", source)
    expect(out.text).toBe('Koç Holding Yönetim Kurulu Başkanı Ali Koç, mağazada tezgâha geçti.')
  })

  it('kaynakla uyumlu unvana dokunmaz (eş anlamlı lider/başkan dahil)', () => {
    const source = 'CHP Genel Başkanı Ahmet Yılmaz grup toplantısında konuştu.'
    expect(guardRoles('CHP lideri Ahmet Yılmaz grup toplantısında konuştu.', source).fixes).toHaveLength(0)
    expect(guardRoles('CHP Genel Başkanı Ahmet Yılmaz konuştu.', source).fixes).toHaveLength(0)
  })

  it('valilik gibi yerel unvanlarda kaynakla aynıysa dokunmaz', () => {
    const source = 'Antalya Valisi Hulusi Şahin, yangın bölgesinde incelemede bulundu.'
    const out = guardRoles('Antalya Valisi Hulusi Şahin bölgede incelemede bulundu.', source)
    expect(out.fixes).toHaveLength(0)
  })

  it("parti bağlantısını (CHP'li) kaynakta yoksa kaldırır", () => {
    const source = "Yeni Partili Özgür Özel, mitingde konuştu."
    const out = guardRoles("CHP'li Özgür Özel mitingde konuştu.", source)
    expect(out.text).toBe('Özgür Özel mitingde konuştu.')
  })

  it('cümle başındaki sıradan sözcüğü metinde bırakır', () => {
    const source = 'Ali Koç törene katıldı.'
    const out = guardRoles('Dün Fenerbahçe Başkanı Ali Koç törene katıldı.', source)
    expect(out.text).toBe('Dün Ali Koç törene katıldı.')
  })

  it('unvanlı anmaları bulur', () => {
    const m = findRoleMentions("Yeni Parti Genel Başkanı Özgür Özel'in açıklaması")
    expect(m[0]?.roleText).toBe('Yeni Parti Genel Başkanı')
    expect(m[0]?.name).toBe('Özgür Özel')
  })

  it('haber alanlarını birlikte düzeltir', () => {
    const source = 'Eski Fenerbahçe Başkanı Ali Koç açıklama yaptı.'
    const r = guardArticleRoles(
      {
        title: 'Fenerbahçe Başkanı Ali Koç açıklama yaptı',
        content: 'Fenerbahçe Başkanı Ali Koç, açıklamasında yeni projeyi anlattı.',
      },
      source
    )
    expect(r.fields.title).toBe('Eski Fenerbahçe Başkanı Ali Koç açıklama yaptı')
    expect(r.fields.content).toBe('Eski Fenerbahçe Başkanı Ali Koç, açıklamasında yeni projeyi anlattı.')
    expect(r.fixes).toHaveLength(2)
  })

  it('unvansız metne ve kaynakla aynı tam unvana dokunmaz', () => {
    const source = 'Cumhurbaşkanı Recep Tayyip Erdoğan kabine toplantısının ardından açıklama yaptı.'
    expect(guardRoles('Cumhurbaşkanı Erdoğan açıklama yaptı.', source).fixes).toHaveLength(0)
    expect(guardRoles('Toplantı saat 14.00’te başladı.', source).fixes).toHaveLength(0)
  })

  it("adın arkasına yapışan yer adında da kişiyi bulur", () => {
    const source = 'Muratpaşa Belediye Başkanı Ahmet Yılmaz, parkı açtı.'
    const out = guardRoles("Muratpaşa Belediye Başkanı Ahmet Yılmaz Antalya'da parkı açtı.", source)
    expect(out.fixes).toHaveLength(0)
  })
})

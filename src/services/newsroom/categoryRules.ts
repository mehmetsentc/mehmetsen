/**
 * Kategori Kuralları — NaHaber Editör Rehberi
 *
 * Her kategori için:
 *  - Hangi içerik türleri bu kategoriye gider
 *  - Hangi içerikler bu kategoriye GİREMEZ
 *  - Son-dakika olup olamayacağı
 *  - Özel davranış notları
 *
 * Bu kurallar categoryEngine.ts ve breakingNewsEditor.ts tarafından
 * uygulanır. Yeni kural eklemek için bu dosyayı düzenle, ardından
 * ilgili engine dosyasına keyword/guard ekle.
 */

export interface CategoryRule {
  id: string
  displayName: string
  /** Hangi içerikler bu kategoriye girmeli */
  include: string[]
  /** Hangi içerikler bu kategoriye GİREMEZ */
  exclude: string[]
  /** Bu kategori son-dakika olabilir mi? */
  canBeBreaking: boolean
  /** Son-dakika olabiliyorsa hangi şartlarda? */
  breakingCondition?: string
  /** Notlar */
  notes?: string
}

export const CATEGORY_RULES: CategoryRule[] = [
  // ── HABER KATEGORİLERİ ────────────────────────────────────────────────────

  {
    id: 'son-dakika',
    displayName: 'Son Dakika',
    include: [
      'Deprem, patlama, yangın, sel, terör saldırısı gibi gerçek acil durumlar',
      'Ulusal veya uluslararası kriz haberleri',
      'Can kaybı olan olaylar',
      'Önemli siyasi krizler (darbe girişimi, cumhurbaşkanı açıklaması vb.)',
    ],
    exclude: [
      'Babalar Günü, Anneler Günü, Sevgililer Günü gibi özel gün kutlamaları',
      'Bayram kutlamaları (açılış/tören boyutunda değilse)',
      'Mezuniyet törenleri, sergi açılışları, resepsiyonlar',
      'Şenlik, festival, kariyer günü gibi planlı sosyal etkinlikler',
      'Spor maç sonuçları (Dünya Kupası finali hariç)',
      'Magazin haberleri, ünlü dedikodular',
      'Yerel trafik kazaları, yerel yangınlar (sadece il/ilçe kapsamı)',
    ],
    canBeBreaking: true,
    breakingCondition: 'Ulusal/uluslararası kapsam ZORUNLU. Yerel veya sosyal içerik kabul edilmez.',
    notes: 'UYARI: "son dakika" kelimesini içeren RSS kaynağı adı veya başlık TEKLİ BAŞINA son-dakika statüsü vermez. İçerik gerçekten acil olmalı.',
  },

  {
    id: 'gundem',
    displayName: 'Gündem',
    include: [
      'Genel Türkiye gündemi — tek bir kategoriye sığmayan haberler',
      'Sosyal olaylar, sivil toplum (çevre/eğitim hariç)',
      'Sağlık sistemi haberleri (uzmanlık gerektirmeyen)',
      'Belediye haberleri (ulusal kapsama sahip olanlar)',
    ],
    exclude: [
      'Net siyasi içerik → siyaset',
      'Ekonomi/borsa/faiz → ekonomi / finans-piyasa',
      'Eğitim / YKS / MEB → egitim',
      'İklim / çevre kirliliği → cevre-iklim',
      'Yabancı ülke haberleri → dunya',
      'Tek il/ilçe kapsamı → yerel-haber',
    ],
    canBeBreaking: false,
    notes: 'Fallback kategori — başka kategori uymuyorsa gündem.',
  },

  {
    id: 'siyaset',
    displayName: 'Siyaset',
    include: [
      'Siyasi partiler: AKP, CHP, MHP, HDP, DEM Parti, İYİ Parti haberleri',
      'Seçimler, sandık, oy oranları, siyasi kampanya',
      'TBMM, meclis oturumları, yasa teklifleri',
      'Cumhurbaşkanı, başbakan, bakanlar kurulu açıklamaları',
      'Hükümet politika açıklamaları',
    ],
    exclude: [
      'Belediye başkanının rutin hizmet açıklamaları → yerel-haber',
      'Afet haberleri (siyasi figür bölgede olsa bile) → gundem',
    ],
    canBeBreaking: true,
    breakingCondition: 'Gerçek siyasi kriz: darbe, cumhurbaşkanı istifası, ani kabine değişikliği.',
  },

  {
    id: 'dunya',
    displayName: 'Dünya',
    include: [
      'Türkiye dışındaki ülkelerden haberler',
      'Uluslararası örgütler: BM, NATO, AB, IMF, G7, G20',
      'Savaş, diplomasi, yaptırım haberleri',
      'Yabancı devlet başkanları, hükümetleri',
    ],
    exclude: [
      'Haber Türkiye\'yi etkilese bile kaynak ülke Türkiye ise → gundem/siyaset',
    ],
    canBeBreaking: true,
    breakingCondition: 'Dünya genelini etkileyen kriz, savaş başlangıcı, büyük terör saldırısı.',
    notes: 'ALTIN KURAL: Olay Türkiye dışında geçiyorsa → dunya. Kaynak gazete Bursa\'dan çıksa bile.',
  },

  {
    id: 'ekonomi',
    displayName: 'Ekonomi',
    include: [
      'Borsa, BIST, hisse senedi haberleri',
      'Döviz kuru: dolar, euro, sterlin',
      'Merkez Bankası (TCMB) kararları, faiz oranı',
      'Enflasyon, TÜİK verileri',
      'Şirket haberleri: kâr, zarar, halka arz, birleşme',
      'Kripto para: Bitcoin, Ethereum vb.',
      'Asgari ücret, SGK haberleri',
    ],
    exclude: [
      'Ekonomi haberi kılığında siyasi haber → siyaset',
    ],
    canBeBreaking: true,
    breakingCondition: 'Ani döviz krizi, merkez bankası acil kararı, büyük şirket iflası.',
  },

  // ── SPOR KATEGORİLERİ ────────────────────────────────────────────────────

  {
    id: 'spor',
    displayName: 'Spor',
    include: [
      'Hangi spor dalı olduğu belli değilse genel spor haberleri',
      'Olimpiyat açılış/kapanış töreni',
      'Çok sayıda spor branşını kapsayan haberler',
    ],
    exclude: [
      'Net futbol haberi → futbol',
      'Net basketbol haberi → basketbol',
      'Net voleybol haberi → voleybol',
    ],
    canBeBreaking: false,
    notes: 'Alt dal tespit edilebiliyorsa daha spesifik kategoriye yönlendir.',
  },

  {
    id: 'futbol',
    displayName: 'Futbol',
    include: [
      'Süper Lig maç sonuçları, gol, kart, hakem kararları',
      'UEFA Şampiyonlar Ligi, Avrupa Ligi',
      'Milli futbol takımı haberleri',
      'FIFA düzenlemeleri, Dünya Kupası (futbol)',
      'Futbol transferleri, teknik direktör haberleri',
      'Galatasaray, Fenerbahçe, Beşiktaş, Trabzonspor (futbol bölümü)',
    ],
    exclude: [
      'Aynı kulüpten basketbol haberi → basketbol (Fenerbahçe Beko, Galatasaray Nef vb.)',
      'Olimpiyat → spor',
    ],
    canBeBreaking: false,
    breakingCondition: 'Dünya Kupası finalinde Türkiye şampiyonluğu gibi istisnai durum.',
  },

  {
    id: 'basketbol',
    displayName: 'Basketbol',
    include: [
      'NBA haberleri',
      'EuroLeague, BSL (Basketbol Süper Ligi)',
      'FIBA, Milli basketbol takımı',
      'Anadolu Efes, Fenerbahçe Beko, Galatasaray Nef haberleri (basketbol)',
      'Basketbol transferleri, antrenmanlar',
    ],
    exclude: [
      'Aynı kulüpten futbol haberi → futbol',
      'Voleybol → voleybol',
    ],
    canBeBreaking: false,
  },

  {
    id: 'voleybol',
    displayName: 'Voleybol',
    include: [
      'CEV, FIVB haberleri',
      'Sultanlar Ligi, Efeler Ligi',
      'Milli voleybol takımı',
      'Voleybol maçı, transfer, antrenman',
    ],
    exclude: [
      'Futbol → futbol',
      'Basketbol → basketbol',
    ],
    canBeBreaking: false,
  },

  // ── KÜLTÜR / YAŞAM KATEGORİLERİ ─────────────────────────────────────────

  {
    id: 'magazin',
    displayName: 'Magazin',
    include: [
      'Ünlülerin kişisel hayatı: ilişki, evlilik, ayrılık, doğum',
      'Skandallar, dedikodular',
    ],
    exclude: [
      'Film/dizi haberi → sinema',
      'Konser haberi → konser',
      'Moda / defile / stil → moda',
      'İlişki tavsiyesi (ünlü değil) → iliskiler',
      'Siyasetçinin kişisel haberi → siyaset (özel hayat değilse)',
    ],
    canBeBreaking: false,
  },

  {
    id: 'kultur',
    displayName: 'Kültür',
    include: [
      'Müze, galeri, sergi haberleri',
      'Edebiyat, kitap, roman, şiir',
      'Opera, bale, dans',
      'Genel kültür-sanat (branş belli değilse)',
    ],
    exclude: [
      'Sinema filmi → sinema',
      'Tiyatro oyunu → tiyatro',
      'Konser → konser',
      'Film festivali → festival',
    ],
    canBeBreaking: false,
  },

  {
    id: 'sinema',
    displayName: 'Sinema',
    include: [
      'Film vizyon tarihleri, fragmanlar',
      'Oyuncu/yönetmen haberleri',
      'Oscar, Altın Küre, BAFTA gibi sinema ödülleri',
      'Netflix/Disney+ orijinal filmleri',
    ],
    exclude: [
      'Dizi haberi → magazin veya kultur',
      'Film festivali → festival',
    ],
    canBeBreaking: false,
  },

  {
    id: 'tiyatro',
    displayName: 'Tiyatro',
    include: [
      'Tiyatro oyunları, prömiyerler, bitiş gösterimleri',
      'Sahne, piyes, opera, bale haberleri',
    ],
    exclude: [],
    canBeBreaking: false,
  },

  {
    id: 'konser',
    displayName: 'Konser',
    include: [
      'Konser duyuruları, turne haberleri',
      'Albüm çıkışları, müzik etkinlikleri',
    ],
    exclude: [
      'Müzik festivali → festival',
    ],
    canBeBreaking: false,
  },

  {
    id: 'festival',
    displayName: 'Festival',
    include: [
      'Kültür/sanat festivalleri',
      'Film festivalleri: Cannes, Berlin, İstanbul Film Festivali',
      'Müzik festivalleri: Glastonbury, Coachella vb.',
    ],
    exclude: [],
    canBeBreaking: false,
  },

  {
    id: 'teknoloji',
    displayName: 'Teknoloji',
    include: [
      'Yeni telefon, tablet, bilgisayar modelleri',
      'Yapay zeka: ChatGPT, Gemini, Claude haberleri',
      'Siber güvenlik, veri ihlali, hack',
      'Sosyal medya platform haberleri (politika değil)',
      'Yazılım güncellemeleri, yeni uygulamalar',
    ],
    exclude: [
      'Teknoloji şirketinin siyasi lobi → siyaset',
      'Elektrikli araç → otomobil',
      'SpaceX roketi → bilim (uzay)',
    ],
    canBeBreaking: false,
    notes: 'Sosyal medya ünlü haberlerine dikkat — teknoloji değil magazin olabilir.',
  },

  {
    id: 'saglik',
    displayName: 'Sağlık',
    include: [
      'Hastalık haberleri, pandemi, salgın',
      'İlaç onayları, aşı haberleri',
      'Hastane, sağlık sistemi haberleri',
      'Beslenme, diyet (bilimsel kaynaklı)',
    ],
    exclude: [
      'Sağlık politikası (Sağlık Bakanlığı kararı) → siyaset veya gundem',
    ],
    canBeBreaking: true,
    breakingCondition: 'Yeni pandemi/salgın ilanı, ani sağlık krizi.',
  },

  {
    id: 'bilim',
    displayName: 'Bilim',
    include: [
      'Uzay, NASA, ESA, SpaceX keşif haberleri',
      'Bilimsel araştırma sonuçları',
      'Fizik, kimya, biyoloji bulguları',
      'Fosil keşifleri, arkeoloji',
    ],
    exclude: [
      'Teknoloji ürünü (iPhone, Android) → teknoloji',
      'Sağlık araştırması → saglik',
      'İklim politikası / çevre kirliliği → cevre-iklim',
    ],
    canBeBreaking: false,
  },

  {
    id: 'egitim',
    displayName: 'Eğitim',
    include: ['MEB, YKS, LGS, üniversite, okul, öğretmen, müfredat'],
    exclude: ['Yerel okul etkinliği (tek okul) → yerel-haber'],
    canBeBreaking: false,
  },
  {
    id: 'cevre-iklim',
    displayName: 'Çevre & İklim',
    include: ['İklim değişikliği, sera gazı, çevre kirliliği, orman yangını ekolojik boyutu, sürdürülebilirlik'],
    exclude: ['Saf meteoroloji tahmini → meteoroloji', 'Saf bilimsel keşif → bilim'],
    canBeBreaking: true,
    breakingCondition: 'Ulusal ölçekli çevre felaketi.',
  },
  {
    id: 'oyun-espor',
    displayName: 'Oyun & Espor',
    include: ['Video oyunları, konsol, espor turnuvaları, Steam, Twitch'],
    exclude: ['Donanım incelemesi → teknoloji', 'Spor maçı → spor alt dalları'],
    canBeBreaking: false,
  },
  {
    id: 'din-inanc',
    displayName: 'Din & İnanç',
    include: ['Diyanet, ibadet, dini bayram, inanç haberleri'],
    exclude: ['Siyasi dini polemik → siyaset'],
    canBeBreaking: false,
  },
  {
    id: 'finans-piyasa',
    displayName: 'Finans & Piyasa',
    include: ['Borsa, döviz, faiz, TCMB, hisse, yatırım'],
    exclude: ['Genel şirket haberi → ekonomi'],
    canBeBreaking: true,
    breakingCondition: 'Ani kur/faiz krizi.',
  },
  {
    id: 'emlak-konut',
    displayName: 'Emlak & Konut',
    include: ['Konut, kira, emlak, gayrimenkul, TOKİ'],
    exclude: [],
    canBeBreaking: false,
  },
  {
    id: 'enerji',
    displayName: 'Enerji',
    include: ['Petrol, doğalgaz, elektrik piyasası, enerji politikası'],
    exclude: ['Elektrikli araç modeli → otomobil'],
    canBeBreaking: false,
  },
  {
    id: 'is-kariyer',
    displayName: 'İş & Kariyer',
    include: ['İstihdam, kariyer, işsizlik, çalışma hayatı'],
    exclude: ['Asgari ücret kararı → ekonomi'],
    canBeBreaking: false,
  },
  {
    id: 'moda',
    displayName: 'Moda',
    include: ['Moda, defile, stil, giyim'],
    exclude: ['Ünlü skandalı → magazin'],
    canBeBreaking: false,
  },
  {
    id: 'anne-cocuk',
    displayName: 'Anne & Çocuk',
    include: ['Ebeveynlik, çocuk bakımı, hamilelik'],
    exclude: [],
    canBeBreaking: false,
  },
  {
    id: 'dekorasyon',
    displayName: 'Dekorasyon',
    include: ['Ev dekorasyonu, iç mimari, mobilya'],
    exclude: [],
    canBeBreaking: false,
  },
  {
    id: 'iliskiler',
    displayName: 'İlişkiler',
    include: ['İlişki tavsiyesi, evlilik rehberi'],
    exclude: ['Ünlü ayrılığı → magazin'],
    canBeBreaking: false,
  },

  {
    id: 'gastronomi',
    displayName: 'Gastronomi',
    include: [
      'Yemek tarifleri',
      'Restoran açılışları, kapanışları',
      'Şef haberleri, Michelin yıldızı',
      'Yemek yarışmaları: MasterChef, Top Chef',
      'Yiyecek kültürü, street food',
    ],
    exclude: [
      'Gıda güvenliği krizi (zehirlenme, geri çekme) → gundem veya saglik',
    ],
    canBeBreaking: false,
  },

  {
    id: 'otomobil',
    displayName: 'Otomobil',
    include: [
      'Yeni araç modelleri, tanıtımlar',
      'TOGG, yerli otomobil haberleri',
      'Elektrikli araç, şarj istasyonu',
      'Otomotiv fuarları: IAA, AutoShow',
      'Trafik haberleri (kural değişikliği, muayene)',
    ],
    exclude: [
      'Trafik kazası → yerel-haber (yerel ise)',
      'Marka/sektör/model haberi ASLA yerel-otomobil olmaz → otomobil',
    ],
    canBeBreaking: false,
    notes: 'Honda/TOGG/elektrikli araç ulusal otomobil. TR il uydurma yasak.',
  },

  {
    id: 'yerel-haber',
    displayName: 'Yerel Haber',
    include: [
      'Tek bir Türkiye ili/ilçesini kapsayan haberler',
      'Belediye kararları, hizmetleri',
      'Yerel trafik kazaları, yangınlar, suç haberleri',
      'İl/ilçe valisi, kaymakamı haberleri',
    ],
    exclude: [
      'Türkiye genelini etkileyen olay → gundem',
      'Yurt dışı olay → dunya (kaynak gazete yerel olsa bile)',
      '3+ ili kapsayan haber → gundem',
      'otomobil/teknoloji/sağlık/yaşam/gastronomi/magazin dikeyleri → ulusal kategori',
    ],
    canBeBreaking: false,
    notes: 'KESINLIKLE son-dakika olamaz. Yerel yangın/kaza/operasyon ne kadar dramatik olursa olsun. AA Ankara dateline olay yeri değildir.',
  },
]

/** Kategori ID'sine göre kuralı döner */
export function getCategoryRule(categoryId: string): CategoryRule | undefined {
  return CATEGORY_RULES.find(r => r.id === categoryId)
}

/** Bu kategori son-dakika statüsü alabilir mi? */
export function categoryCanBeBreaking(categoryId: string): boolean {
  return getCategoryRule(categoryId)?.canBeBreaking ?? false
}

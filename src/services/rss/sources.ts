/**
 * RSS feed sources for the AI news ingestion pipeline.
 * Override any feed URL via env: RSS_FEED_{SOURCE_ID}=https://…
 * Disable sources via env: RSS_DISABLED_SOURCES=iha,dha,t24,gazeteduvar
 */

export type RssFeedFormat = 'rss' | 'trt-xml'

export interface RssSourceDefinition {
  id: string
  label: string
  /** Default RSS/Atom feed URL */
  feedUrl: string
  /** Alternate URLs tried when primary fetch/parse fails */
  alternateFeedUrls?: string[]
  /** Non-standard feed shape (e.g. TRT xml_mobile.php) */
  feedFormat?: RssFeedFormat
  /** Max new items to process per cron run (rate-limit guard) */
  maxItemsPerRun: number
  enabled: boolean
  /** Optional local-news metadata (province slug/name from worker). */
  localMeta?: {
    citySlug: string
    cityName: string
    district?: string
  }
}

const DEFAULT_SOURCES: RssSourceDefinition[] = [
  // ── Türk Haber Ajansları ─────────────────────────────────────────────────
  {
    id: 'aa',
    label: 'Anadolu Ajansı',
    feedUrl: 'https://www.aa.com.tr/tr/rss/default?cat=guncel',
    alternateFeedUrls: [
      'https://www.aa.com.tr/rss/ajansguncel.xml',
      'https://www.aa.com.tr/tr/rss/default?cat=yerel',
    ],
    maxItemsPerRun: 8,
    enabled: true,
  },
  {
    id: 'iha',
    label: 'İHA',
    feedUrl: 'https://www.iha.com.tr/rss.aspx', // guncel boş döndü, aspx dene
    alternateFeedUrls: [
      'https://www.iha.com.tr/rss/guncel',
      'https://news.google.com/rss/search?q=site:iha.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 6,
    enabled: true,
  },
  {
    id: 'dha',
    label: 'DHA (Demirören)',
    feedUrl: 'https://news.google.com/rss/search?q=site:dha.com.tr+haber&hl=tr&gl=TR&ceid=TR:tr', // dha.com.tr/rss boş döndü
    alternateFeedUrls: [
      'https://www.dha.com.tr/rss',
      'https://news.google.com/rss/search?q=DHA+Demir%C3%B6ren+haber&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 6,
    enabled: true,
  },
  {
    id: 'haberler',
    label: 'Haberler.com',
    feedUrl: 'https://www.haberler.com/rss/',
    alternateFeedUrls: [
      'https://www.haberler.com/rss/1.xml',
      'https://rss.haberler.com/rssnew.aspx',
      'https://news.google.com/rss/search?q=site:haberler.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 6,
    enabled: true,
  },
  {
    id: 'sondakika',
    label: 'Sondakika.com',
    feedUrl: 'https://www.sondakika.com/rss/',
    alternateFeedUrls: [
      'https://www.sondakika.com/rss/haber/',
      'https://news.google.com/rss/search?q=site:sondakika.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 6,
    enabled: true,
  },
  {
    id: 'mynet',
    label: 'Mynet Haber',
    feedUrl: 'https://www.mynet.com/haber/rss/gundem',
    alternateFeedUrls: [
      'https://www.mynet.com/haber/rss/anasayfa',
      'https://news.google.com/rss/search?q=site:mynet.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 6,
    enabled: true,
  },
  {
    id: 'reuters',
    label: 'Reuters',
    feedUrl: 'https://feeds.reuters.com/reuters/topNews',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:reuters.com&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 5,
    enabled: false, // reuters-world kullanılıyor, bu duplicate
  },
  {
    id: 'bbc',
    label: 'BBC Türkçe',
    feedUrl: 'https://feeds.bbci.co.uk/turkce/rss.xml',
    maxItemsPerRun: 3,
    enabled: false, // Feed bayatladı — son güncelleme 7 Nisan 2026, yeni içerik gelmiyor
  },
  {
    id: 'cnn',
    label: 'CNN Türk',
    feedUrl: 'https://www.cnnturk.com/feed/rss/all/news',
    alternateFeedUrls: [
      'https://www.cnnturk.com/feed/rss/gundem/news',
      'https://news.google.com/rss/search?q=site:cnnturk.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 6,
    enabled: true,
  },
  {
    id: 'trt',
    label: 'TRT Haber',
    feedUrl:
      'https://www.trthaber.com/xml_mobile.php?tur=xml_genel&kategori=gundem&adet=20',
    feedFormat: 'trt-xml',
    maxItemsPerRun: 6,
    enabled: true,
  },
  {
    id: 'ntv',
    label: 'NTV',
    feedUrl: 'https://www.ntv.com.tr/gundem.rss',
    alternateFeedUrls: [
      'https://www.ntv.com.tr/son-dakika.rss',
      'https://news.google.com/rss/search?q=site:ntv.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 6,
    enabled: true,
  },
  {
    id: 'haberturk',
    label: 'Habertürk',
    feedUrl: 'https://www.haberturk.com/rss/kategori/gundem.xml',
    alternateFeedUrls: [
      'https://www.haberturk.com/rss/son-dakika',
      'https://news.google.com/rss/search?q=site:haberturk.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 6,
    enabled: true,
  },
  {
    id: 'hurriyet',
    label: 'Hürriyet',
    feedUrl: 'https://www.hurriyet.com.tr/rss/gundem',
    alternateFeedUrls: [
      'https://www.hurriyet.com.tr/rss/anasayfa',
      'https://news.google.com/rss/search?q=site:hurriyet.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 6,
    enabled: true,
  },
  {
    id: 'sozcu',
    label: 'Sözcü',
    feedUrl: 'https://www.sozcu.com.tr/feeds-haberler',
    alternateFeedUrls: [
      'https://www.sozcu.com.tr/rss/gundem',
      'https://www.sozcu.com.tr/rss/guncel',
      'https://news.google.com/rss/search?q=site:sozcu.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 6,
    enabled: true,
  },
  {
    id: 't24',
    label: 'T24',
    feedUrl: 'https://news.google.com/rss/search?q=site:t24.com.tr&hl=tr&gl=TR&ceid=TR:tr', // /rss ve /rss/haber/gundem 404 döndü
    alternateFeedUrls: [
      'https://t24.com.tr/rss/haber/gundem',
      'https://t24.com.tr/rss',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'gazeteduvar',
    label: 'Gazete Duvar',
    feedUrl: 'https://news.google.com/rss/search?q=site:gazeteduvar.com.tr&hl=tr&gl=TR&ceid=TR:tr', // gundem/rss boş döndü
    alternateFeedUrls: [
      'https://www.gazeteduvar.com.tr/gundem/rss',
      'https://www.gazeteduvar.com.tr/rss',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },

  // ── Finans ───────────────────────────────────────────────────────────────
  {
    id: 'bloomberght',
    label: 'Bloomberg HT',
    feedUrl: 'https://www.bloomberght.com/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:bloomberght.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 5,
    enabled: true,
  },
  {
    id: 'dunya-ekonomi',
    label: 'Dünya Gazetesi',
    feedUrl: 'https://www.dunya.com/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:dunya.com+ekonomi&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'ekonomim',
    label: 'Ekonomim',
    feedUrl: 'https://www.ekonomim.com/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:ekonomim.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'ntv-ekonomi',
    label: 'NTV Ekonomi',
    feedUrl: 'https://www.ntv.com.tr/ekonomi.rss',
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'haberturk-ekonomi',
    label: 'Habertürk Ekonomi',
    feedUrl: 'https://www.haberturk.com/rss/kategori/ekonomi.xml',
    maxItemsPerRun: 4,
    enabled: true,
  },

  // ── Eğlence / Magazin / Kültür / Spor ───────────────────────────────────
  {
    id: 'milliyet-magazin',
    label: 'Milliyet Magazin',
    feedUrl: 'https://www.milliyet.com.tr/rss/rssNew/magazinRss.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:milliyet.com.tr+magazin&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'sabah-magazin',
    label: 'Sabah Magazin',
    feedUrl: 'https://www.sabah.com.tr/rss/magazin.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:sabah.com.tr+magazin&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'posta-magazin',
    label: 'Posta Magazin',
    feedUrl: 'https://www.posta.com.tr/rss/magazin',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:posta.com.tr+magazin&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'ntv-spor',
    label: 'NTV Spor',
    feedUrl: 'https://www.ntvspor.net/rss/tum-haberler',
    alternateFeedUrls: [
      'https://www.ntvspor.net/rss',
      'https://news.google.com/rss/search?q=site:ntvspor.net&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 5,
    enabled: true,
  },
  {
    id: 'hurriyet-spor',
    label: 'Hürriyet Spor',
    feedUrl: 'https://www.hurriyet.com.tr/rss/spor',
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'ntv-kultur',
    label: 'NTV Kültür Sanat',
    feedUrl: 'https://www.ntv.com.tr/kultur-sanat.rss',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'haberturk-spor',
    label: 'Habertürk Spor',
    feedUrl: 'https://www.haberturk.com/rss/kategori/spor.xml',
    maxItemsPerRun: 4,
    enabled: true,
  },

  // ── Sözcü — İzole Kategori Akışları ─────────────────────────────────────
  // Bu kaynaklar forcedCategoryId ile kendi worker'larında kullanılır.
  // Ana feed'e düşmez.
  {
    id: 'sozcu-world-cup',
    label: 'Sözcü — 2026 FIFA Dünya Kupası',
    feedUrl: 'https://www.sozcu.com.tr/feeds-rss-category-2026-fifa-dunya-kupasi',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=2026+dünya+kupası+site:sozcu.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 10,
    enabled: true,
  },
  {
    id: 'sozcu-voleybol',
    label: 'Sözcü — Voleybol',
    feedUrl: 'https://www.sozcu.com.tr/feeds-rss-category-voleybol',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=voleybol+site:sozcu.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 8,
    enabled: true,
  },
  {
    id: 'sozcu-basketbol',
    label: 'Sözcü — Basketbol',
    feedUrl: 'https://www.sozcu.com.tr/feeds-rss-category-basketbol',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=basketbol+site:sozcu.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 8,
    enabled: true,
  },
  {
    id: 'sozcu-dunyadan-spor',
    label: 'Sözcü — Dünyadan Spor (Futbol)',
    feedUrl: 'https://www.sozcu.com.tr/feeds-rss-category-dunyadan-spor',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=futbol+dünya+site:sozcu.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 8,
    enabled: true,
  },
  {
    id: 'sozcu-kripto',
    label: 'Sözcü — Kripto',
    feedUrl: 'https://www.sozcu.com.tr/feeds-rss-category-kripto',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=kripto+bitcoin+site:sozcu.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 8,
    enabled: true,
  },
  {
    id: 'sozcu-borsa',
    label: 'Sözcü — Borsa',
    feedUrl: 'https://www.sozcu.com.tr/feeds-rss-category-borsa',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=borsa+bist+site:sozcu.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 8,
    enabled: true,
  },
  {
    id: 'sozcu-otomotiv',
    label: 'Sözcü — Otomotiv',
    feedUrl: 'https://www.sozcu.com.tr/feeds-rss-category-otomotiv',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=otomobil+araç+site:sozcu.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 8,
    enabled: true,
  },
  {
    id: 'sozcu-bilim-teknoloji',
    label: 'Sözcü — Bilim & Teknoloji',
    feedUrl: 'https://www.sozcu.com.tr/feeds-rss-category-bilim-teknoloji',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=bilim+teknoloji+site:sozcu.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 10,
    enabled: true,
  },
  {
    id: 'sozcu-saglik',
    label: 'Sözcü — Sağlık',
    feedUrl: 'https://www.sozcu.com.tr/feeds-rss-category-saglik',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=sağlık+site:sozcu.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 8,
    enabled: true,
  },
  {
    id: 'sozcu-son-dakika',
    label: 'Sözcü — Son Dakika',
    feedUrl: 'https://www.sozcu.com.tr/feeds-rss-category-son-dakika',
    alternateFeedUrls: [
      'https://www.sozcu.com.tr/rss/son-dakika',
      'https://news.google.com/rss/search?q=son+dakika+site:sozcu.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 15,
    enabled: true,
  },

  // ── Kripto ───────────────────────────────────────────────────────────────
  {
    id: 'coindesk',
    label: 'CoinDesk',
    feedUrl: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:coindesk.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'cointelegraph',
    label: 'CoinTelegraph',
    feedUrl: 'https://cointelegraph.com/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:cointelegraph.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'kriptokoin',
    label: 'Kriptokoin.com',
    feedUrl: 'https://news.google.com/rss/search?q=kripto+bitcoin+ethereum+türkiye&hl=tr&gl=TR&ceid=TR:tr', // kriptokoin.com/feed/ timeout alıyor
    alternateFeedUrls: [
      'https://kriptokoin.com/feed/',
      'https://news.google.com/rss/search?q=site:kriptokoin.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'btchaber',
    label: 'BtcHaber',
    feedUrl: 'https://btchaber.com/feed/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:btchaber.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },

  // ── Türk Ulusal Gazeteler (ek) ───────────────────────────────────────────
  {
    id: 'milliyet',
    label: 'Milliyet',
    feedUrl: 'https://www.milliyet.com.tr/rss/rssNew/gundemRss.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:milliyet.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'sabah',
    label: 'Sabah',
    feedUrl: 'https://www.sabah.com.tr/rss/gundem.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:sabah.com.tr+gündem&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'cumhuriyet',
    label: 'Cumhuriyet',
    feedUrl: 'https://www.cumhuriyet.com.tr/rss/son_dakika.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:cumhuriyet.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'yenisafak',
    label: 'Yeni Şafak',
    feedUrl: 'https://www.yenisafak.com/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:yenisafak.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: false, // Kullanıcı isteğiyle devre dışı
  },
  {
    id: 'karar',
    label: 'Karar',
    feedUrl: 'https://www.karar.com/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:karar.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'independent-tr',
    label: 'Independent Türkçe',
    feedUrl: 'https://www.indyturk.com/rss.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:indyturk.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'euronews-tr',
    label: 'Euronews Türkçe',
    feedUrl: 'https://tr.euronews.com/rss?format=mrss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:tr.euronews.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'medyascope',
    label: 'Medyascope',
    feedUrl: 'https://medyascope.tv/feed/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:medyascope.tv&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 2,
    enabled: false, // Küçük kitle, national worker overlap
  },
  {
    id: 'birgün',
    label: 'BirGün',
    feedUrl: 'https://www.birgun.net/feed/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:birgun.net&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 2,
    enabled: false, // Küçük kitle, cumhuriyet/t24 overlap
  },

  // ── Uluslararası Kaynaklar ───────────────────────────────────────────────
  {
    id: 'reuters-world',
    label: 'Reuters World',
    feedUrl: 'https://feeds.reuters.com/reuters/worldNews',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=reuters+world+news&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'ap-news',
    label: 'Associated Press',
    feedUrl: 'https://feeds.apnews.com/rss/apf-topnews',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:apnews.com&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'aljazeera',
    label: 'Al Jazeera English',
    feedUrl: 'https://www.aljazeera.com/xml/rss/all.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:aljazeera.com&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'guardian',
    label: 'The Guardian',
    feedUrl: 'https://www.theguardian.com/world/rss',
    alternateFeedUrls: [
      'https://www.theguardian.com/international/rss',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'bloomberg-int',
    label: 'Bloomberg Markets',
    feedUrl: 'https://feeds.bloomberg.com/markets/news.rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:bloomberg.com+markets&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'cnbc-int',
    label: 'CNBC Markets',
    feedUrl: 'https://www.cnbc.com/id/10000664/device/rss/rss.html',
    alternateFeedUrls: [
      'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839135',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'dw-english',
    label: 'DW English',
    feedUrl: 'https://rss.dw.com/rdf/rss-en-all',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:dw.com&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'sky-news',
    label: 'Sky News',
    feedUrl: 'https://feeds.skynews.com/feeds/rss/world.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:news.sky.com&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },

  // ── Teknoloji ────────────────────────────────────────────────────────────
  {
    id: 'techcrunch',
    label: 'TechCrunch',
    feedUrl: 'https://techcrunch.com/feed/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:techcrunch.com&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'theverge',
    label: 'The Verge',
    feedUrl: 'https://www.theverge.com/rss/index.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:theverge.com&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'wired',
    label: 'Wired',
    feedUrl: 'https://www.wired.com/feed/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:wired.com&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'arstechnica',
    label: 'Ars Technica',
    feedUrl: 'https://feeds.arstechnica.com/arstechnica/index',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:arstechnica.com&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'venturebeat',
    label: 'VentureBeat',
    feedUrl: 'https://venturebeat.com/feed/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:venturebeat.com+AI&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'mit-tech',
    label: 'MIT Technology Review',
    feedUrl: 'https://www.technologyreview.com/feed/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:technologyreview.com&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 2,
    enabled: true,
  },
  {
    id: 'shiftdelete',
    label: 'ShiftDelete (TR)',
    feedUrl: 'https://shiftdelete.net/feed',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:shiftdelete.net&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'webtekno',
    label: 'Webtekno (TR)',
    feedUrl: 'https://www.webtekno.com/rss.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:webtekno.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },

  // ── Spor (ek) ────────────────────────────────────────────────────────────
  {
    id: 'fanatik',
    label: 'Fanatik',
    feedUrl: 'https://news.google.com/rss/search?q=site:fanatik.com.tr&hl=tr&gl=TR&ceid=TR:tr', // /rss ve /rss/guncel-haberler boş döndü
    alternateFeedUrls: [
      'https://www.fanatik.com.tr/rss',
      'https://www.fanatik.com.tr/rss/guncel-haberler',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'fotomac',
    label: 'Fotomaç',
    feedUrl: 'https://news.google.com/rss/search?q=site:fotomac.com.tr&hl=tr&gl=TR&ceid=TR:tr', // /rss/tum-haberler.xml boş döndü
    alternateFeedUrls: [
      'https://www.fotomac.com.tr/rss/tum-haberler.xml',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'sporx',
    label: 'Sporx',
    feedUrl: 'https://www.sporx.com/rss/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:sporx.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: false, // Çok fazla tanıtım/reklam içeriği — devre dışı
  },
  {
    id: 'ajansspor',
    label: 'Ajansspor',
    feedUrl: 'https://news.google.com/rss/search?q=site:ajansspor.com&hl=tr&gl=TR&ceid=TR:tr', // /rss boş döndü
    alternateFeedUrls: [
      'https://www.ajansspor.com/rss',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'goal-tr',
    label: 'Goal.com Türkçe',
    feedUrl: 'https://www.goal.com/feeds/tr/news',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:goal.com+türkiye&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'f1-espn',
    label: 'ESPN F1',
    feedUrl: 'https://www.espn.com/espn/rss/f1/news',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=Formula+1+F1+race&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },

  // ── Sağlık & Bilim ───────────────────────────────────────────────────────
  {
    id: 'who-news',
    label: 'WHO News',
    feedUrl: 'https://www.who.int/rss-feeds/news-english.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=WHO+health+news&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 2,
    enabled: true,
  },
  {
    id: 'nih-news',
    label: 'NIH News',
    feedUrl: 'https://www.nih.gov/news-events/feed.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:nih.gov+news&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 2,
    enabled: true,
  },
  {
    id: 'saglik-tr',
    label: 'Sağlık Haberleri (TR)',
    feedUrl: 'https://news.google.com/rss/search?q=sağlık+hastalık+tedavi+Türkiye&hl=tr&gl=TR&ceid=TR:tr',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'nature-news',
    label: 'Nature News',
    feedUrl: 'https://www.nature.com/nature.rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:nature.com+research&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 2,
    enabled: true,
  },
  {
    id: 'science-daily',
    label: 'Science Daily',
    feedUrl: 'https://www.sciencedaily.com/rss/all.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=scientific+discovery+research&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 2,
    enabled: true,
  },

  // ── Eğitim ───────────────────────────────────────────────────────────────
  {
    id: 'egitim-tr',
    label: 'Eğitim Haberleri (TR)',
    feedUrl: 'https://news.google.com/rss/search?q=eğitim+okul+üniversite+YKS+LGS+MEB&hl=tr&gl=TR&ceid=TR:tr',
    maxItemsPerRun: 3,
    enabled: false, // Google News search → rate-limit riski, national worker zaten kapsar
  },

  // ── Turizm & Çevre ───────────────────────────────────────────────────────
  {
    id: 'turizm-tr',
    label: 'Turizm Haberleri (TR)',
    feedUrl: 'https://news.google.com/rss/search?q=turizm+otel+tatil+sezon+Türkiye&hl=tr&gl=TR&ceid=TR:tr',
    maxItemsPerRun: 2,
    enabled: false, // Google News search → rate-limit riski
  },

  // ── Spor (ek kaynaklar) ──────────────────────────────────────────────────
  {
    id: 'trt-spor',
    label: 'TRT Spor',
    feedUrl: 'https://www.trthaber.com/xml_mobile.php?tur=xml_genel&kategori=spor&adet=20',
    feedFormat: 'trt-xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:trtspor.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'milliyet-spor',
    label: 'Milliyet Spor',
    feedUrl: 'https://www.milliyet.com.tr/rss/rssNew/spor',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:milliyet.com.tr+spor&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'takvim-spor',
    label: 'Takvim Spor',
    feedUrl: 'https://news.google.com/rss/search?q=site:takvim.com.tr+spor&hl=tr&gl=TR&ceid=TR:tr',
    maxItemsPerRun: 3,
    enabled: false, // Google News search, fanatik/fotomac overlap
  },
  {
    id: 'bbc-sport',
    label: 'BBC Sport',
    feedUrl: 'https://feeds.bbci.co.uk/sport/rss.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:bbc.com+sport&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'espn-soccer',
    label: 'ESPN Soccer',
    feedUrl: 'https://www.espn.com/espn/rss/soccer/news',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=soccer+football+Champions+League&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'transfermarkt-news',
    label: 'Transfermarkt News',
    feedUrl: 'https://news.google.com/rss/search?q=transfermarkt+transfer+futbol&hl=tr&gl=TR&ceid=TR:tr',
    maxItemsPerRun: 3,
    enabled: false, // Google News search, fanatik/fotomac transfer haberleri zaten kapsar
  },
  {
    id: 'uefa-news',
    label: 'UEFA News',
    feedUrl: 'https://news.google.com/rss/search?q=UEFA+Champions+League+Europa+League&hl=en&gl=US&ceid=US:en',
    maxItemsPerRun: 3,
    enabled: false, // İngilizce, sports worker'daki Türkçe kaynaklar yeterli
  },

  // ── Dünya Haberleri (ek) ─────────────────────────────────────────────────
  {
    id: 'nyt-world',
    label: 'New York Times World',
    feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:nytimes.com+world&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 3,
    enabled: false, // Paywall — RSS çalışmıyor, reuters-world/ap-news yeterli
  },
  {
    id: 'wapo-world',
    label: 'Washington Post World',
    feedUrl: 'https://feeds.washingtonpost.com/rss/world',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:washingtonpost.com+world&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 3,
    enabled: false, // Paywall — RSS çalışmıyor
  },
  {
    id: 'france24-en',
    label: 'France 24 English',
    feedUrl: 'https://www.france24.com/en/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:france24.com+world&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'bbc-world',
    label: 'BBC World News',
    feedUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:bbc.com+world+news&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },

  // ── Teknoloji (ek) ───────────────────────────────────────────────────────
  {
    id: 'openai-blog',
    label: 'OpenAI Blog',
    feedUrl: 'https://openai.com/news/rss.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:openai.com&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 2,
    enabled: true,
  },
  {
    id: 'google-blog',
    label: 'Google Blog',
    feedUrl: 'https://blog.google/rss/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:blog.google&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 2,
    enabled: true,
  },
  {
    id: 'microsoft-blog',
    label: 'Microsoft Blog',
    feedUrl: 'https://blogs.microsoft.com/feed/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:blogs.microsoft.com&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 2,
    enabled: true,
  },
  {
    id: 'apple-newsroom',
    label: 'Apple Newsroom',
    feedUrl: 'https://www.apple.com/newsroom/rss-feed.rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:apple.com+newsroom&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 2,
    enabled: true,
  },
  {
    id: 'donanimhaber',
    label: 'Donanım Haber (TR)',
    feedUrl: 'https://www.donanimhaber.com/rss/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:donanimhaber.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'chip-tr',
    label: 'Chip Online TR',
    feedUrl: 'https://news.google.com/rss/search?q=site:chip.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    maxItemsPerRun: 2,
    enabled: false, // Google News search, shiftdelete/webtekno yeterli
  },

  // ── Siyaset ──────────────────────────────────────────────────────────────
  {
    id: 'anka-haber',
    label: 'ANKA Haber Ajansı',
    feedUrl: 'https://news.google.com/rss/search?q=site:ankahaber.net&hl=tr&gl=TR&ceid=TR:tr', // ankahaber.net/rss/haber boş döndü
    alternateFeedUrls: [
      'https://www.ankahaber.net/rss/haber',
    ],
    maxItemsPerRun: 8,
    enabled: true,
  },
  {
    id: 'ntv-politika',
    label: 'NTV Politika',
    feedUrl: 'https://www.ntv.com.tr/politika.rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:ntv.com.tr+siyaset&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'haberturk-politika',
    label: 'Habertürk Siyaset',
    feedUrl: 'https://www.haberturk.com/rss/kategori/siyaset.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:haberturk.com+siyaset&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'trt-politika',
    label: 'TRT Haber Siyaset',
    feedUrl: 'https://www.trthaber.com/xml_mobile.php?tur=xml_genel&kategori=siyaset&adet=20',
    feedFormat: 'trt-xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:trthaber.com+siyaset&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'aa-siyaset',
    label: 'Anadolu Ajansı Siyaset',
    feedUrl: 'https://www.aa.com.tr/tr/rss/default?cat=siyaset',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:aa.com.tr+siyaset&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'milliyet-siyaset',
    label: 'Milliyet Siyaset',
    feedUrl: 'https://www.milliyet.com.tr/rss/rssNew/siyaset',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:milliyet.com.tr+siyaset&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'hurriyet-siyaset',
    label: 'Hürriyet Siyaset',
    feedUrl: 'https://www.hurriyet.com.tr/rss/siyaset',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:hurriyet.com.tr+siyaset&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },

  // ── Sağlık (ek) ──────────────────────────────────────────────────────────
  {
    id: 'cdc-news',
    label: 'CDC Newsroom',
    feedUrl: 'https://tools.cdc.gov/api/v2/resources/media/132608.rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:cdc.gov+health+news&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 2,
    enabled: true,
  },
  {
    id: 'lancet',
    label: 'The Lancet',
    feedUrl: 'https://www.thelancet.com/rssfeed/lancet_online.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:thelancet.com&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 2,
    enabled: true,
  },
  {
    id: 'medimagazin',
    label: 'Medimagazin (TR)',
    feedUrl: 'https://medimagazin.com.tr/feed/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:medimagazin.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'saglik-aktuel',
    label: 'Sağlık Aktüel (TR)',
    feedUrl: 'https://www.saglikaktuel.com/rss.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=sağlık+tıp+ilaç+araştırma&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },

  // ── Magazin / Eğlence (ek) ───────────────────────────────────────────────
  {
    id: 'hurriyet-magazin',
    label: 'Hürriyet Magazin',
    feedUrl: 'https://www.hurriyet.com.tr/rss/magazin',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:hurriyet.com.tr+magazin&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'takvim-magazin',
    label: 'Takvim Magazin',
    feedUrl: 'https://www.takvim.com.tr/rss/magazin.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:takvim.com.tr+magazin&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'variety',
    label: 'Variety',
    feedUrl: 'https://variety.com/feed/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:variety.com&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 3,
    enabled: false, // Amerikan eğlence → Türk okuyucuyla düşük alakası
  },
  {
    id: 'billboard',
    label: 'Billboard',
    feedUrl: 'https://www.billboard.com/feed/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:billboard.com+music&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 2,
    enabled: false, // Amerikan müzik listesi → Türk okuyucuyla düşük alakası
  },
  {
    id: 'tmz-news',
    label: 'TMZ',
    feedUrl: 'https://www.tmz.com/rss.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:tmz.com+celebrity&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 2,
    enabled: false, // Amerikan dedikodu → Türk magazin kitlesiyle alakasız
  },
  {
    id: 'hollywood-reporter',
    label: 'Hollywood Reporter',
    feedUrl: 'https://www.hollywoodreporter.com/c/news/feed/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:hollywoodreporter.com&hl=en&gl=US&ceid=US:en',
    ],
    maxItemsPerRun: 2,
    enabled: false, // Hollywood odaklı → Türk magazin kitlesiyle alakasız
  },

  // ── Gastronomi ───────────────────────────────────────────────────────────
  {
    id: 'gastronomi-google-news',
    label: 'Gastronomi (Google News)',
    feedUrl: 'https://news.google.com/rss/search?q=yemek+restoran+mutfak+şef+tarif&hl=tr&gl=TR&ceid=TR:tr',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=gastronomi+türk+mutfağı+restoran&hl=tr&gl=TR&ceid=TR:tr',
      'https://news.google.com/rss/search?q=yemek+tarifi+şef+michelin&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 6,
    enabled: true,
  },
  {
    id: 'lezzet-com',
    label: 'Lezzet.com',
    feedUrl: 'https://www.lezzet.com.tr/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:lezzet.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 5,
    enabled: true,
  },
  {
    id: 'yemek-com',
    label: 'Yemek.com',
    feedUrl: 'https://www.yemek.com/rss/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:yemek.com+tarif+yemek&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 5,
    enabled: true,
  },
  {
    id: 'milliyet-gastronomi',
    label: 'Milliyet Gastronomi',
    feedUrl: 'https://www.milliyet.com.tr/rss/rssnew/yasamrss.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:milliyet.com.tr+restoran+yemek+gastronomi&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'hurriyet-gastronomi',
    label: 'Hürriyet Gastronomi',
    feedUrl: 'https://www.hurriyet.com.tr/rss/yazarlar',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:hurriyet.com.tr+restoran+yemek+gastronomi&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },

  // ── NTV (ek kategoriler) ─────────────────────────────────────────────────
  {
    id: 'ntv-turkiye',
    label: 'NTV Türkiye',
    feedUrl: 'https://www.ntv.com.tr/turkiye.rss',
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'ntv-yasam',
    label: 'NTV Yaşam',
    feedUrl: 'https://www.ntv.com.tr/yasam.rss',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'ntv-saglik',
    label: 'NTV Sağlık',
    feedUrl: 'https://www.ntv.com.tr/saglik.rss',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'ntv-teknoloji',
    label: 'NTV Teknoloji',
    feedUrl: 'https://www.ntv.com.tr/teknoloji.rss',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'ntv-otomobil',
    label: 'NTV Otomobil',
    feedUrl: 'https://www.ntv.com.tr/otomobil.rss',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'ntv-seyahat',
    label: 'NTV Seyahat',
    feedUrl: 'https://www.ntv.com.tr/seyahat.rss',
    maxItemsPerRun: 2,
    enabled: true,
  },

  // ── A Haber — Kullanıcı isteğiyle devre dışı ────────────────────────────
  {
    id: 'ahaber',
    label: 'A Haber',
    feedUrl: 'https://www.ahaber.com.tr/rss/gundem.xml',
    alternateFeedUrls: [
      'https://www.ahaber.com.tr/rss/anasayfa.xml',
      'https://www.ahaber.com.tr/rss/son24saat.xml',
      'https://news.google.com/rss/search?q=site:ahaber.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 5,
    enabled: false,
  },
  {
    id: 'ahaber-ekonomi',
    label: 'A Haber Ekonomi',
    feedUrl: 'https://www.ahaber.com.tr/rss/ekonomi.xml',
    maxItemsPerRun: 3,
    enabled: false,
  },
  {
    id: 'ahaber-spor',
    label: 'A Haber Spor',
    feedUrl: 'https://www.ahaber.com.tr/rss/spor.xml',
    maxItemsPerRun: 3,
    enabled: false,
  },
  {
    id: 'ahaber-dunya',
    label: 'A Haber Dünya',
    feedUrl: 'https://www.ahaber.com.tr/rss/dunya.xml',
    maxItemsPerRun: 3,
    enabled: false,
  },
  {
    id: 'ahaber-saglik',
    label: 'A Haber Sağlık',
    feedUrl: 'https://www.ahaber.com.tr/rss/saglik.xml',
    maxItemsPerRun: 3,
    enabled: false,
  },
  {
    id: 'ahaber-teknoloji',
    label: 'A Haber Teknoloji',
    feedUrl: 'https://www.ahaber.com.tr/rss/teknoloji.xml',
    maxItemsPerRun: 3,
    enabled: false,
  },

  // ── Sabah (ek kategoriler) ───────────────────────────────────────────────
  {
    id: 'sabah-ekonomi',
    label: 'Sabah Ekonomi',
    feedUrl: 'https://www.sabah.com.tr/rss/ekonomi.xml',
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'sabah-spor',
    label: 'Sabah Spor',
    feedUrl: 'https://www.sabah.com.tr/rss/spor.xml',
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'sabah-dunya',
    label: 'Sabah Dünya',
    feedUrl: 'https://www.sabah.com.tr/rss/dunya.xml',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'sabah-teknoloji',
    label: 'Sabah Teknoloji',
    feedUrl: 'https://news.google.com/rss/search?q=site:sabah.com.tr+teknoloji&hl=tr&gl=TR&ceid=TR:tr', // /rss/teknoloji.xml boş döndü
    alternateFeedUrls: [
      'https://www.sabah.com.tr/rss/teknoloji.xml',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'sabah-saglik',
    label: 'Sabah Sağlık',
    feedUrl: 'https://www.sabah.com.tr/rss/saglik.xml',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'sabah-sondakika',
    label: 'Sabah Son Dakika',
    feedUrl: 'https://www.sabah.com.tr/rss/sondakika.xml',
    maxItemsPerRun: 6,
    enabled: true,
  },
  {
    id: 'sabah-yasam',
    label: 'Sabah Yaşam',
    feedUrl: 'https://www.sabah.com.tr/rss/yasam.xml',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'sabah-kultur-sanat',
    label: 'Sabah Kültür Sanat',
    feedUrl: 'https://www.sabah.com.tr/rss/kultur-sanat.xml',
    maxItemsPerRun: 3,
    enabled: true,
  },

  // ── Milliyet (ek kategoriler) ────────────────────────────────────────────
  {
    id: 'milliyet-ekonomi',
    label: 'Milliyet Ekonomi',
    feedUrl: 'https://www.milliyet.com.tr/rss/rssNew/ekonomiRss.xml',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'milliyet-teknoloji',
    label: 'Milliyet Teknoloji',
    feedUrl: 'https://www.milliyet.com.tr/rss/rssNew/teknolojiRss.xml',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'milliyet-saglik',
    label: 'Milliyet Sağlık',
    feedUrl: 'https://www.milliyet.com.tr/rss/rssNew/saglikRss.xml',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'milliyet-dunya',
    label: 'Milliyet Dünya',
    feedUrl: 'https://www.milliyet.com.tr/rss/rssNew/dunyaRss.xml',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'milliyet-sondakika',
    label: 'Milliyet Son Dakika',
    feedUrl: 'https://www.milliyet.com.tr/rss/rssNew/SonDakikaRss.xml',
    maxItemsPerRun: 6,
    enabled: true,
  },

  // ── Hürriyet (ek kategoriler) ────────────────────────────────────────────
  {
    id: 'hurriyet-ekonomi',
    label: 'Hürriyet Ekonomi',
    feedUrl: 'https://www.hurriyet.com.tr/rss/ekonomi',
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'hurriyet-saglik',
    label: 'Hürriyet Sağlık',
    feedUrl: 'https://www.hurriyet.com.tr/rss/saglik',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'hurriyet-teknoloji',
    label: 'Hürriyet Teknoloji',
    feedUrl: 'https://www.hurriyet.com.tr/rss/teknoloji',
    maxItemsPerRun: 3,
    enabled: true,
  },

  // ── CNN Türk (ek kategoriler) ────────────────────────────────────────────
  {
    id: 'cnnturk-ekonomi',
    label: 'CNN Türk Ekonomi',
    feedUrl: 'https://www.cnnturk.com/feed/rss/ekonomi/news',
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'cnnturk-spor',
    label: 'CNN Türk Spor',
    feedUrl: 'https://www.cnnturk.com/feed/rss/spor/news',
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'cnnturk-saglik',
    label: 'CNN Türk Sağlık',
    feedUrl: 'https://www.cnnturk.com/feed/rss/saglik/news',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'cnnturk-bilim',
    label: 'CNN Türk Bilim Teknoloji',
    feedUrl: 'https://news.google.com/rss/search?q=teknoloji+bilim+yapay+zeka+türkiye&hl=tr&gl=TR&ceid=TR:tr', // /bilim-teknoloji/news boş döndü
    alternateFeedUrls: [
      'https://www.cnnturk.com/feed/rss/bilim-teknoloji/news',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'cnnturk-kultur',
    label: 'CNN Türk Kültür Sanat',
    feedUrl: 'https://www.cnnturk.com/feed/rss/kultur-sanat/news',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'cnnturk-yasam',
    label: 'CNN Türk Yaşam',
    feedUrl: 'https://www.cnnturk.com/feed/rss/yasam/news',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'cnnturk-otomobil',
    label: 'CNN Türk Otomobil',
    feedUrl: 'https://www.cnnturk.com/feed/rss/otomobil/news',
    maxItemsPerRun: 3,
    enabled: true,
  },

  // ── TRT Son Dakika ───────────────────────────────────────────────────────
  {
    id: 'trt-sondakika',
    label: 'TRT Haber Son Dakika',
    feedUrl: 'https://www.trthaber.com/sondakika.rss',
    maxItemsPerRun: 6,
    enabled: false, // Feed bayatladı — son güncelleme 20 Nisan 2026; trt (xml_mobile) çalışıyor
  },

  // ── Uluslararası Türkçe Kaynaklar ───────────────────────────────────────
  {
    id: 'sputnik-tr',
    label: 'Sputnik Türkçe',
    feedUrl: 'https://tr.sputniknews.com/export/rss2/archive/index.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:tr.sputniknews.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: false, // Timeout alıyor — muhtemelen DNS/ağ engeli (Türkiye'de bloklu)
  },
  {
    id: 'dw-turkish',
    label: 'DW Türkçe',
    feedUrl: 'https://rss.dw.com/rdf/rss-tur-all',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:dw.com/tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },

  // ── Diğer Türk Haber Siteleri ────────────────────────────────────────────
  {
    id: 'ensonhaber',
    label: 'Ensonhaber',
    feedUrl: 'https://www.ensonhaber.com/rss/ensonhaber.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:ensonhaber.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 5,
    enabled: true,
  },
  {
    id: 'yeniasir',
    label: 'Yeni Asır',
    feedUrl: 'https://www.yeniasir.com.tr/rss/anasayfa.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:yeniasir.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'yeniakit',
    label: 'Yeni Akit',
    feedUrl: 'https://www.yeniakit.com.tr/rss/haber',
    alternateFeedUrls: [
      'https://www.yeniakit.com.tr/rss/haber/gundem',
      'https://news.google.com/rss/search?q=site:yeniakit.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },

  // ── Finans (ek) ──────────────────────────────────────────────────────────
  {
    id: 'bigpara',
    label: 'Bigpara (Hürriyet)',
    feedUrl: 'https://bigpara.hurriyet.com.tr/rss/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:bigpara.hurriyet.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'finansgundem',
    label: 'Finansgundem',
    feedUrl: 'https://www.finansgundem.com/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:finansgundem.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },

  // ── Otomobil ─────────────────────────────────────────────────────────────
  {
    id: 'otomobil-google-news',
    label: 'Otomobil (Google News)',
    feedUrl: 'https://news.google.com/rss/search?q=otomobil+araba+araç+model&hl=tr&gl=TR&ceid=TR:tr',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=elektrikli+araç+tesla+togg+otomobil&hl=tr&gl=TR&ceid=TR:tr',
      'https://news.google.com/rss/search?q=otomobil+fiyat+kampanya+sıfır+araba&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 6,
    enabled: true,
  },
  {
    id: 'oto-com-tr',
    label: 'Oto.com.tr',
    feedUrl: 'https://www.oto.com.tr/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:oto.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 5,
    enabled: true,
  },
  {
    id: 'otomobilhaber',
    label: 'OtomobilHaber.com',
    feedUrl: 'https://www.otomobilhaber.com/rss/',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:otomobilhaber.com&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 5,
    enabled: true,
  },
  {
    id: 'sabah-otomobil',
    label: 'Sabah Otomobil',
    feedUrl: 'https://www.sabah.com.tr/rss/otomobil.xml',
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'arabalar-com-tr',
    label: 'Arabalar.com.tr',
    feedUrl: 'https://www.arabalar.com.tr/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:arabalar.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'hurriyet-otomobil',
    label: 'Hürriyet Otomobil',
    feedUrl: 'https://www.hurriyet.com.tr/rss/otomobil',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:hurriyet.com.tr+otomobil+araba&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 5,
    enabled: true,
  },
  {
    id: 'milliyet-otomobil',
    label: 'Milliyet Otomobil',
    feedUrl: 'https://www.milliyet.com.tr/rss/rssnew/otomobilrss.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:milliyet.com.tr+otomobil+araba+elektrikli&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 5,
    enabled: true,
  },

  // ══════════════════════════════════════════════════════════════════
  // GÜNDEM BOTU — Ulusal öneme sahip haberler için özel kaynaklar
  // ══════════════════════════════════════════════════════════════════

  // Google News TR — algoritmik olarak öne çıkan ulusal haberler
  {
    id: 'google-news-tr',
    label: 'Google Haberler Türkiye',
    feedUrl: 'https://news.google.com/rss?hl=tr&gl=TR&ceid=TR:tr',
    maxItemsPerRun: 15,
    enabled: true,
  },
  {
    id: 'google-news-tr-ulusal',
    label: 'Google Haberler TR Ulusal',
    feedUrl: 'https://news.google.com/rss/headlines/section/topic/NATION?hl=tr&gl=TR&ceid=TR:tr',
    maxItemsPerRun: 12,
    enabled: true,
  },
  {
    id: 'google-news-tr-politika',
    label: 'Google Haberler TR Politika',
    feedUrl: 'https://news.google.com/rss/headlines/section/topic/POLITICS?hl=tr&gl=TR&ceid=TR:tr',
    maxItemsPerRun: 10,
    enabled: true,
  },
  {
    id: 'google-news-tr-ekonomi',
    label: 'Google Haberler TR Ekonomi',
    feedUrl: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=tr&gl=TR&ceid=TR:tr',
    maxItemsPerRun: 10,
    enabled: true,
  },

  // Anadolu Ajansı — kategori bazlı feed'ler
  {
    id: 'aa-gundem',
    label: 'AA Gündem',
    feedUrl: 'https://www.aa.com.tr/tr/rss/default?cat=gundem',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:aa.com.tr+gündem&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 12,
    enabled: true,
  },
  {
    id: 'aa-politika',
    label: 'AA Politika',
    feedUrl: 'https://www.aa.com.tr/tr/rss/default?cat=politika',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:aa.com.tr+politika+tbmm+meclis&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 10,
    enabled: true,
  },
  {
    id: 'aa-ekonomi',
    label: 'AA Ekonomi',
    feedUrl: 'https://www.aa.com.tr/tr/rss/default?cat=ekonomi',
    maxItemsPerRun: 8,
    enabled: true,
  },

  // Son dakika feed'leri — ulusal medya
  {
    id: 'ntv-sondakika',
    label: 'NTV Son Dakika',
    feedUrl: 'https://www.ntv.com.tr/son-dakika.rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:ntv.com.tr+son+dakika&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 10,
    enabled: true,
  },
  {
    id: 'haberturk-sondakika',
    label: 'Habertürk Son Dakika',
    feedUrl: 'https://www.haberturk.com/rss/haber/sondakika.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:haberturk.com+son+dakika&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 10,
    enabled: true,
  },
  {
    id: 'cumhuriyet-gundem',
    label: 'Cumhuriyet Gündem',
    feedUrl: 'https://www.cumhuriyet.com.tr/rss/son_dakika.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:cumhuriyet.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 8,
    enabled: true,
  },
  {
    id: 'iha-gundem',
    label: 'İHA Gündem',
    feedUrl: 'https://news.google.com/rss/search?q=site:iha.com.tr&hl=tr&gl=TR&ceid=TR:tr', // iha.com.tr RSS'leri boş döndü
    alternateFeedUrls: [
      'https://www.iha.com.tr/rss/rss.php?kategori=0',
      'https://www.iha.com.tr/rss/guncel',
    ],
    maxItemsPerRun: 12,
    enabled: true,
  },
]

function envFeedOverride(sourceId: string): string | undefined {
  const key = `RSS_FEED_${sourceId.toUpperCase().replace(/-/g, '_')}`
  return process.env[key]?.trim() || undefined
}

function isSourceEnabled(sourceId: string): boolean {
  const disabled = process.env.RSS_DISABLED_SOURCES?.trim()
  if (!disabled) return true
  const set = new Set(disabled.split(',').map((s) => s.trim().toLowerCase()))
  return !set.has(sourceId.toLowerCase())
}

/** Returns enabled RSS sources with env overrides applied. */
export function getRssSources(): RssSourceDefinition[] {
  return DEFAULT_SOURCES.map((src) => ({
    ...src,
    feedUrl: envFeedOverride(src.id) ?? src.feedUrl,
    enabled: src.enabled && isSourceEnabled(src.id),
  })).filter((s) => s.enabled)
}

export function getRssSourceById(id: string): RssSourceDefinition | undefined {
  return getRssSources().find((s) => s.id === id)
}

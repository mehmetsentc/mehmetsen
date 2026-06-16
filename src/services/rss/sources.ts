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
    feedUrl: 'https://www.iha.com.tr/rss/guncel',
    alternateFeedUrls: [
      'https://www.iha.com.tr/rss.aspx',
      'https://news.google.com/rss/search?q=site:iha.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 6,
    enabled: true,
  },
  {
    id: 'dha',
    label: 'DHA (Demirören)',
    feedUrl: 'https://www.dha.com.tr/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:dha.com.tr&hl=tr&gl=TR&ceid=TR:tr',
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
    enabled: true,
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
    feedUrl: 'https://t24.com.tr/rss/haber/gundem',
    alternateFeedUrls: [
      'https://t24.com.tr/rss/haber/gundem/feed',
      'https://t24.com.tr/rss',
      'https://news.google.com/rss/search?q=site:t24.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 3,
    enabled: true,
  },
  {
    id: 'gazeteduvar',
    label: 'Gazete Duvar',
    feedUrl: 'https://www.gazeteduvar.com.tr/gundem/rss',
    alternateFeedUrls: [
      'https://www.gazeteduvar.com.tr/rss',
      'https://news.google.com/rss/search?q=site:gazeteduvar.com.tr&hl=tr&gl=TR&ceid=TR:tr',
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
    feedUrl: 'https://kriptokoin.com/feed/',
    alternateFeedUrls: [
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
    enabled: true,
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
    feedUrl: 'https://www.fanatik.com.tr/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:fanatik.com.tr&hl=tr&gl=TR&ceid=TR:tr',
    ],
    maxItemsPerRun: 4,
    enabled: true,
  },
  {
    id: 'fotomac',
    label: 'Fotomaç',
    feedUrl: 'https://www.fotomac.com.tr/rss/tum-haberler.xml',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:fotomac.com.tr&hl=tr&gl=TR&ceid=TR:tr',
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
    feedUrl: 'https://www.ajansspor.com/rss',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:ajansspor.com&hl=tr&gl=TR&ceid=TR:tr',
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
    feedUrl: 'https://www.ankahaber.net/rss/haber',
    alternateFeedUrls: [
      'https://news.google.com/rss/search?q=site:ankahaber.net&hl=tr&gl=TR&ceid=TR:tr',
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

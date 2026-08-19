import type { CrawlerSourceCategory, CrawlPriorityBand, GeographicScope } from './types'
import { crawlIntervalForPriority, numericPriorityForBand } from './enabled'
import type { InsertSourceInput } from './store/types'

export interface TurkeyRegistryEntry {
  key: string
  name: string
  domain: string
  baseUrl: string
  rssUrls: string[]
  sitemapUrls?: string[]
  category: CrawlerSourceCategory
  scope: GeographicScope
  city?: string
  region?: string
  district?: string
  crawlPriority: CrawlPriorityBand
}

export const TURKEY_SOURCE_REGISTRY: TurkeyRegistryEntry[] = [
  { key: 'aa', name: 'Anadolu Ajansı', domain: 'aa.com.tr', baseUrl: 'https://www.aa.com.tr', rssUrls: ['https://www.aa.com.tr/tr/rss/default?cat=guncel'], category: 'AGENCY', scope: 'NATIONAL', crawlPriority: 'BREAKING' },
  { key: 'iha', name: 'İHA', domain: 'iha.com.tr', baseUrl: 'https://www.iha.com.tr', rssUrls: ['https://www.iha.com.tr/rss/guncel'], category: 'AGENCY', scope: 'NATIONAL', crawlPriority: 'HIGH' },
  { key: 'dha', name: 'DHA', domain: 'dha.com.tr', baseUrl: 'https://www.dha.com.tr', rssUrls: ['https://www.dha.com.tr/rss'], category: 'AGENCY', scope: 'NATIONAL', crawlPriority: 'HIGH' },
  { key: 'trt', name: 'TRT Haber', domain: 'trthaber.com', baseUrl: 'https://www.trthaber.com', rssUrls: ['https://www.trthaber.com/gundem_articles.rss'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'BREAKING' },
  { key: 'ntv', name: 'NTV', domain: 'ntv.com.tr', baseUrl: 'https://www.ntv.com.tr', rssUrls: ['https://www.ntv.com.tr/gundem.rss'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'HIGH' },
  { key: 'cnn', name: 'CNN Türk', domain: 'cnnturk.com', baseUrl: 'https://www.cnnturk.com', rssUrls: ['https://www.cnnturk.com/feed/rss/all/news'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'HIGH' },
  { key: 'haberturk', name: 'Habertürk', domain: 'haberturk.com', baseUrl: 'https://www.haberturk.com', rssUrls: ['https://www.haberturk.com/rss/kategori/gundem.xml'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'HIGH' },
  { key: 'hurriyet', name: 'Hürriyet', domain: 'hurriyet.com.tr', baseUrl: 'https://www.hurriyet.com.tr', rssUrls: ['https://www.hurriyet.com.tr/rss/gundem'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'HIGH' },
  { key: 'sozcu', name: 'Sözcü', domain: 'sozcu.com.tr', baseUrl: 'https://www.sozcu.com.tr', rssUrls: ['https://www.sozcu.com.tr/feeds-haberler'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'HIGH' },
  { key: 'milliyet', name: 'Milliyet', domain: 'milliyet.com.tr', baseUrl: 'https://www.milliyet.com.tr', rssUrls: ['https://www.milliyet.com.tr/rss/rssnew/gundemrss.xml'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'sabah', name: 'Sabah', domain: 'sabah.com.tr', baseUrl: 'https://www.sabah.com.tr', rssUrls: ['https://www.sabah.com.tr/rss/gundem.xml'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'cumhuriyet', name: 'Cumhuriyet', domain: 'cumhuriyet.com.tr', baseUrl: 'https://www.cumhuriyet.com.tr', rssUrls: ['https://www.cumhuriyet.com.tr/rss'], category: 'POLITICS', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'yenisafak', name: 'Yeni Şafak', domain: 'yenisafak.com', baseUrl: 'https://www.yenisafak.com', rssUrls: ['https://www.yenisafak.com/rss'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'star', name: 'Star', domain: 'star.com.tr', baseUrl: 'https://www.star.com.tr', rssUrls: ['https://www.star.com.tr/rss/rss.asp'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'LOW' },
  { key: 'takvim', name: 'Takvim', domain: 'takvim.com.tr', baseUrl: 'https://www.takvim.com.tr', rssUrls: ['https://www.takvim.com.tr/rss/gundem'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'LOW' },
  { key: 'aksam', name: 'Akşam', domain: 'aksam.com.tr', baseUrl: 'https://www.aksam.com.tr', rssUrls: ['https://www.aksam.com.tr/cache/rss.xml'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'LOW' },
  { key: 'turkiye', name: 'Türkiye Gazetesi', domain: 'turkiyegazetesi.com.tr', baseUrl: 'https://www.turkiyegazetesi.com.tr', rssUrls: ['https://www.turkiyegazetesi.com.tr/rss/rss.xml'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'LOW' },
  { key: 'ahaber', name: 'A Haber', domain: 'ahaber.com.tr', baseUrl: 'https://www.ahaber.com.tr', rssUrls: ['https://www.ahaber.com.tr/rss/gundem.xml'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'haber7', name: 'Haber7', domain: 'haber7.com', baseUrl: 'https://www.haber7.com', rssUrls: ['https://www.haber7.com/rss/manset.xml'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'haberler', name: 'Haberler.com', domain: 'haberler.com', baseUrl: 'https://www.haberler.com', rssUrls: ['https://www.haberler.com/rss/'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'ensonhaber', name: 'Ensonhaber', domain: 'ensonhaber.com', baseUrl: 'https://www.ensonhaber.com', rssUrls: ['https://www.ensonhaber.com/rss/mansetler.xml'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'sondakika', name: 'Sondakika.com', domain: 'sondakika.com', baseUrl: 'https://www.sondakika.com', rssUrls: ['https://www.sondakika.com/rss/'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'mynet', name: 'Mynet Haber', domain: 'mynet.com', baseUrl: 'https://www.mynet.com', rssUrls: ['https://www.mynet.com/haber/rss/gundem'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 't24', name: 'T24', domain: 't24.com.tr', baseUrl: 'https://t24.com.tr', rssUrls: ['https://t24.com.tr/rss'], category: 'POLITICS', scope: 'NATIONAL', crawlPriority: 'HIGH' },
  { key: 'diken', name: 'Diken', domain: 'diken.com.tr', baseUrl: 'https://www.diken.com.tr', rssUrls: ['https://www.diken.com.tr/feed/'], category: 'POLITICS', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'duvar', name: 'Gazete Duvar', domain: 'gazeteduvar.com.tr', baseUrl: 'https://www.gazeteduvar.com.tr', rssUrls: ['https://www.gazeteduvar.com.tr/export/rss'], category: 'POLITICS', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'bianet', name: 'Bianet', domain: 'bianet.org', baseUrl: 'https://bianet.org', rssUrls: ['https://bianet.org/biamag.rss'], category: 'POLITICS', scope: 'NATIONAL', crawlPriority: 'LOW' },
  { key: 'birgun', name: 'BirGün', domain: 'birgun.net', baseUrl: 'https://www.birgun.net', rssUrls: ['https://www.birgun.net/rss'], category: 'POLITICS', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'evrensel', name: 'Evrensel', domain: 'evrensel.net', baseUrl: 'https://www.evrensel.net', rssUrls: ['https://www.evrensel.net/rss/haber.xml'], category: 'POLITICS', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'karar', name: 'Karar', domain: 'karar.com', baseUrl: 'https://www.karar.com', rssUrls: ['https://www.karar.com/service/rss.php'], category: 'POLITICS', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'odatv', name: 'Odatv', domain: 'odatv.com', baseUrl: 'https://www.odatv.com', rssUrls: ['https://www.odatv.com/rss.xml'], category: 'POLITICS', scope: 'NATIONAL', crawlPriority: 'LOW' },
  { key: 'tele1', name: 'Tele1', domain: 'tele1.com.tr', baseUrl: 'https://www.tele1.com.tr', rssUrls: ['https://www.tele1.com.tr/feed'], category: 'POLITICS', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'indyturk', name: 'Independent Türkçe', domain: 'indyturk.com', baseUrl: 'https://www.indyturk.com', rssUrls: ['https://www.indyturk.com/rss.xml'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'dwtr', name: 'DW Türkçe', domain: 'dw.com', baseUrl: 'https://www.dw.com', rssUrls: ['https://rss.dw.com/rdf/rss-tur-all'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'HIGH' },
  { key: 'bbctr', name: 'BBC Türkçe', domain: 'bbc.com', baseUrl: 'https://www.bbc.com', rssUrls: ['https://feeds.bbci.co.uk/turkce/rss.xml'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'HIGH' },
  { key: 'euronews', name: 'Euronews Türkçe', domain: 'tr.euronews.com', baseUrl: 'https://tr.euronews.com', rssUrls: ['https://tr.euronews.com/rss'], category: 'GENERAL', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'bloomberght', name: 'Bloomberg HT', domain: 'bloomberght.com', baseUrl: 'https://www.bloomberght.com', rssUrls: ['https://www.bloomberght.com/rss'], category: 'ECONOMY', scope: 'NATIONAL', crawlPriority: 'HIGH' },
  { key: 'dunya', name: 'Dünya', domain: 'dunya.com', baseUrl: 'https://www.dunya.com', rssUrls: ['https://www.dunya.com/rss'], category: 'ECONOMY', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'ekonomim', name: 'Ekonomim', domain: 'ekonomim.com', baseUrl: 'https://www.ekonomim.com', rssUrls: ['https://www.ekonomim.com/rss/tum'], category: 'ECONOMY', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'paraanaliz', name: 'Para Analiz', domain: 'paraanaliz.com', baseUrl: 'https://www.paraanaliz.com', rssUrls: ['https://www.paraanaliz.com/feed/'], category: 'ECONOMY', scope: 'NATIONAL', crawlPriority: 'LOW' },
  { key: 'fanatik', name: 'Fanatik', domain: 'fanatik.com.tr', baseUrl: 'https://www.fanatik.com.tr', rssUrls: ['https://www.fanatik.com.tr/rss/anasayfa.xml'], category: 'SPORTS', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'fotomac', name: 'Fotomaç', domain: 'fotomac.com.tr', baseUrl: 'https://www.fotomac.com.tr', rssUrls: ['https://www.fotomac.com.tr/rss/anasayfa.xml'], category: 'SPORTS', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'ntvspor', name: 'NTV Spor', domain: 'ntvspor.net', baseUrl: 'https://www.ntvspor.net', rssUrls: ['https://www.ntvspor.net/rss'], category: 'SPORTS', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'sporx', name: 'Sporx', domain: 'sporx.com', baseUrl: 'https://www.sporx.com', rssUrls: ['https://www.sporx.com/rss.xml'], category: 'SPORTS', scope: 'NATIONAL', crawlPriority: 'LOW' },
  { key: 'webtekno', name: 'Webtekno', domain: 'webtekno.com', baseUrl: 'https://www.webtekno.com', rssUrls: ['https://www.webtekno.com/rss.xml'], category: 'TECHNOLOGY', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'donanimhaber', name: 'Donanımhaber', domain: 'donanimhaber.com', baseUrl: 'https://www.donanimhaber.com', rssUrls: ['https://www.donanimhaber.com/rss/headlines/'], category: 'TECHNOLOGY', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'shiftdelete', name: 'ShiftDelete', domain: 'shiftdelete.net', baseUrl: 'https://shiftdelete.net', rssUrls: ['https://shiftdelete.net/feed'], category: 'TECHNOLOGY', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'technopat', name: 'Technopat', domain: 'technopat.net', baseUrl: 'https://www.technopat.net', rssUrls: ['https://www.technopat.net/feed/'], category: 'TECHNOLOGY', scope: 'NATIONAL', crawlPriority: 'LOW' },
  { key: 'chip', name: 'Chip', domain: 'chip.com.tr', baseUrl: 'https://www.chip.com.tr', rssUrls: ['https://www.chip.com.tr/rss/'], category: 'TECHNOLOGY', scope: 'NATIONAL', crawlPriority: 'LOW' },
  { key: 'webrazzi', name: 'Webrazzi', domain: 'webrazzi.com', baseUrl: 'https://webrazzi.com', rssUrls: ['https://webrazzi.com/feed/'], category: 'TECHNOLOGY', scope: 'NATIONAL', crawlPriority: 'NORMAL' },
  { key: 'canakkaleolay', name: 'Çanakkale Olay', domain: 'canakkaleolay.com', baseUrl: 'https://www.canakkaleolay.com', rssUrls: ['https://www.canakkaleolay.com/rss'], category: 'LOCAL', scope: 'CITY', city: 'Çanakkale', region: 'Marmara', crawlPriority: 'NORMAL' },
  { key: 'canakkaleicinde', name: 'Çanakkale İçinde', domain: 'canakkaleicinde.com', baseUrl: 'https://www.canakkaleicinde.com', rssUrls: ['https://www.canakkaleicinde.com/feed'], category: 'LOCAL', scope: 'CITY', city: 'Çanakkale', region: 'Marmara', crawlPriority: 'NORMAL' },
  { key: 'gelibolu', name: 'Gelibolu Haber', domain: 'geliboluhaber.com', baseUrl: 'https://www.geliboluhaber.com', rssUrls: ['https://www.geliboluhaber.com/rss'], category: 'LOCAL', scope: 'DISTRICT', city: 'Çanakkale', district: 'Gelibolu', region: 'Marmara', crawlPriority: 'LOW' },
  { key: 'biga', name: 'Biga Haber', domain: 'bigahaber.com', baseUrl: 'https://www.bigahaber.com', rssUrls: ['https://www.bigahaber.com/rss'], category: 'LOCAL', scope: 'DISTRICT', city: 'Çanakkale', district: 'Biga', region: 'Marmara', crawlPriority: 'LOW' },
  { key: 'anadolujet', name: 'Ankara Büyükşehir', domain: 'ankara.bel.tr', baseUrl: 'https://www.ankara.bel.tr', rssUrls: ['https://www.ankara.bel.tr/rss'], category: 'PUBLIC', scope: 'CITY', city: 'Ankara', region: 'İç Anadolu', crawlPriority: 'LOW' },
  { key: 'ibb', name: 'İBB Haber', domain: 'ibb.istanbul', baseUrl: 'https://www.ibb.istanbul', rssUrls: ['https://www.ibb.istanbul/rss'], category: 'PUBLIC', scope: 'CITY', city: 'İstanbul', region: 'Marmara', crawlPriority: 'LOW' },
]

export function turkeyRegistryToInsert(entry: TurkeyRegistryEntry): InsertSourceInput {
  return {
    name: entry.name,
    domain: entry.domain,
    baseUrl: entry.baseUrl,
    countryCode: 'TR',
    countryName: 'Türkiye',
    region: entry.region ?? null,
    city: entry.city ?? null,
    district: entry.district ?? null,
    language: 'tr',
    sourceType: entry.scope === 'CITY' || entry.scope === 'DISTRICT' ? 'LOCAL' : entry.category === 'AGENCY' ? 'AGENCY' : entry.category === 'SPORTS' ? 'SPORT' : entry.category === 'ECONOMY' ? 'FINANCE' : entry.category === 'TECHNOLOGY' ? 'TECHNOLOGY' : entry.category === 'MAGAZINE' ? 'MAGAZINE' : 'NATIONAL',
    status: 'PAUSED',
    crawlPriority: entry.crawlPriority,
    geographicScope: entry.scope,
    sourceCategory: entry.category,
    priority: numericPriorityForBand(entry.crawlPriority),
    discoveryMethod: 'RSS',
    rssUrls: entry.rssUrls,
    sitemapUrls: entry.sitemapUrls ?? [],
    crawlIntervalSeconds: crawlIntervalForPriority(entry.crawlPriority),
    articleFetchMode: 'HTTP',
    freshnessHours: 48,
    registryKey: entry.key,
    qualityTier: 'UNTESTED',
  }
}

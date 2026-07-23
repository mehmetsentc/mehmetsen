import { ROUTES } from '@/constants/routes'

/** Genel iletişim e-postası — footer ve iletişim sayfasında gösterilir. */
export const CONTACT_EMAIL = 'bilgi@nahaber.com'

export interface SiteLegalLink {
  label: string
  href: string
}

/** Footer ve iletişim sayfasında listelenen tüm yasal / kurumsal belgeler. */
export const FOOTER_LEGAL_LINKS: readonly SiteLegalLink[] = [
  { label: 'Gizlilik Politikası', href: '/hukuk/gizlilik' },
  { label: 'KVKK Aydınlatma Metni', href: '/hukuk/kvkk' },
  { label: 'Aydınlatma Metni', href: '/aydinlatma-metni' },
  { label: 'Çerez Politikası', href: '/hukuk/cerez-politikasi' },
  { label: 'Kullanım Koşulları', href: '/hukuk/kullanim-kosullari' },
  { label: 'Editoryal İlkeler', href: '/editoryal-ilkeler' },
  { label: 'İçerik Kuralları', href: ROUTES.FEED_CONTENT_POLICY },
  { label: 'Künye', href: '/kunye' },
  { label: 'Hakkımızda', href: '/hakkimizda' },
  { label: 'İletişim', href: '/iletisim' },
  { label: 'Site Haritası', href: ROUTES.SITE_MAP },
] as const

export const CONTACT_FORM_SUBJECTS = [
  { value: 'genel', label: 'Genel Bilgi' },
  { value: 'reklam', label: 'Reklam ve İş Birliği' },
  { value: 'editorial', label: 'Editoryal / Haber Düzeltme' },
  { value: 'kvkk', label: 'KVKK / Gizlilik' },
  { value: 'teknik', label: 'Teknik Destek' },
] as const

export interface FooterLink {
  label: string
  href: string
  external?: boolean
}

export interface FooterColumn {
  title: string
  links: readonly FooterLink[]
}

/** NYT tarzı footer sütunları — haber, yaşam, kültür, bilim, kurumsal. */
export const FOOTER_NAV_COLUMNS: readonly FooterColumn[] = [
  {
    title: 'Haberler',
    links: [
      { label: 'Ana Sayfa', href: '/feed' },
      { label: 'Gündem', href: '/kategori/gundem' },
      { label: '3. Sayfa', href: '/kategori/asayis' },
      { label: 'Son Dakika', href: '/kategori/son-dakika' },
      { label: 'Dünya', href: '/kategori/dunya' },
      { label: 'Siyaset', href: '/kategori/siyaset' },
      { label: 'Yerel Haberler', href: '/yerel' },
      { label: 'Tarihte Bugün', href: '/feed' },
    ],
  },
  {
    title: 'Spor & Ekonomi',
    links: [
      { label: 'Spor', href: '/kategori/spor' },
      { label: 'Futbol', href: '/kategori/futbol' },
      { label: 'Basketbol', href: '/kategori/basketbol' },
      { label: 'Ekonomi', href: '/kategori/ekonomi' },
      { label: 'Borsa', href: '/kategori/borsa' },
      { label: 'Kripto', href: '/kategori/kripto' },
      { label: 'Döviz', href: '/kategori/ekonomi' },
    ],
  },
  {
    title: 'Yaşam',
    links: [
      { label: 'Turizm', href: '/kategori/turizm' },
      { label: 'Gezi', href: '/kategori/gezi' },
      { label: 'Sağlık', href: '/kategori/saglik' },
      { label: 'Yaşam', href: '/kategori/yasam' },
      { label: 'Gastronomi', href: '/kategori/gastronomi' },
      { label: 'Magazin', href: '/kategori/magazin' },
      { label: 'Müzeler', href: '/kategori/kultur' },
    ],
  },
  {
    title: 'Kültür & Medya',
    links: [
      { label: 'Kültür', href: '/kategori/kultur' },
      { label: 'Sinema', href: '/kategori/sinema' },
      { label: 'Tiyatro', href: '/kategori/tiyatro' },
      { label: 'Konser', href: '/kategori/konser' },
      { label: 'Teve', href: '/reels' },
      { label: 'Keşfet', href: '/discover' },
      { label: 'Eğitim', href: '/kategori/egitim' },
      { label: 'Etkinlikler', href: '/kategori/etkinlikler' },
    ],
  },
  {
    title: 'Bilim & Teknoloji',
    links: [
      { label: 'Teknoloji', href: '/kategori/teknoloji' },
      { label: 'Bilim', href: '/kategori/bilim' },
      { label: 'Otomobil', href: '/kategori/otomobil' },
      { label: 'Meteoroloji', href: '/kategori/meteoroloji' },
      { label: 'Hava Durumu', href: '/weather' },
      { label: 'Uzay', href: '/kategori/bilim' },
    ],
  },
  {
    title: 'Kurumsal',
    links: [
      { label: 'Hakkımızda', href: '/hakkimizda' },
      { label: 'Künye', href: '/kunye' },
      { label: 'Editoryal İlkeler', href: '/editoryal-ilkeler' },
      { label: 'İletişim', href: '/iletisim' },
      { label: 'Reklam', href: '/iletisim' },
      { label: 'RSS Beslemeleri', href: '/rss.xml', external: true },
      { label: 'Haberler RSS', href: '/rss.xml', external: true },
    ],
  },
] as const

/** Sağ sütun — hesap ve iletişim (NYT Account sütunu). */
export const FOOTER_ACCOUNT_LINKS: readonly FooterLink[] = [
  { label: 'Giriş Yap', href: '/login' },
  { label: 'Kayıt Ol', href: '/register' },
  { label: 'Hesap Ayarları', href: '/settings' },
  { label: 'Mobil Uygulama', href: '/uygulama' },
  { label: 'İletişim Formu', href: '/iletisim#iletisim-formu' },
] as const

/** Alt çubuk — yasal ve yardım bağlantıları. */
export const FOOTER_BOTTOM_LINKS: readonly SiteLegalLink[] = [
  { label: 'İletişim', href: '/iletisim' },
  { label: 'Gizlilik Politikası', href: '/hukuk/gizlilik' },
  { label: 'KVKK Aydınlatma Metni', href: '/hukuk/kvkk' },
  { label: 'Çerez Politikası', href: '/hukuk/cerez-politikasi' },
  { label: 'Kullanım Koşulları', href: '/hukuk/kullanim-kosullari' },
  { label: 'Editoryal İlkeler', href: '/editoryal-ilkeler' },
  { label: 'Site Haritası', href: ROUTES.SITE_MAP },
  { label: 'Künye', href: '/kunye' },
  { label: 'Hakkımızda', href: '/hakkimizda' },
] as const

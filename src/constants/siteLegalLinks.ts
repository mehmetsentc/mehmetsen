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

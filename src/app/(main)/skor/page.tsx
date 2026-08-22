import { redirect } from 'next/navigation'
import { ROUTES } from '@/constants/routes'

/**
 * NaHaber Skor geçici olarak kapatıldı — API-Football prod'da boş dönüyor,
 * ESPN hydrate güvenilir değil. Kullanıcı yüzeyini Spor kategorisine yönlendir.
 */
export default function SkorPage() {
  redirect(ROUTES.SPOR)
}

import type { Metadata } from 'next'
import { GamesHubClient } from '@/components/games/GamesHubClient'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

export const metadata: Metadata = {
  title: 'Online Oyunlar',
  description:
    'Tavla, satranç, sudoku, kelime günü, adam asmaca, hafıza, mayın tarlası, 2048 ve daha fazlası — NaHaber’de ücretsiz online oyna.',
  alternates: { canonical: `${getSiteUrl()}${ROUTES.GAMES}` },
  // Oyun hub’ı haber içeriği değil — yayıncı incelemesinde ince sayfa riskini azalt
  robots: { index: false, follow: false },
}

export default function GamesPage() {
  return <GamesHubClient />
}

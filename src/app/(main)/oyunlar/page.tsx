import type { Metadata } from 'next'
import { GamesHubClient } from '@/components/games/GamesHubClient'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

export const metadata: Metadata = {
  title: 'Online Oyunlar',
  description:
    'Tavla, satranç, sudoku, neon yılan ve tetris — NaHaber’de ücretsiz online oyna.',
  alternates: { canonical: `${getSiteUrl()}${ROUTES.GAMES}` },
  robots: { index: true, follow: true },
}

export default function GamesPage() {
  return <GamesHubClient />
}

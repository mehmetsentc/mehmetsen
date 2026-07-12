import type { Metadata } from 'next'
import { FootballPage } from '@/components/football/FootballPage'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Süper Lig — Puan Tablosu & Maçlar',
  description: 'Türkiye Süper Lig puan tablosu, bugünkü maçlar ve canlı skorlar.',
  openGraph: {
    title: 'Süper Lig Puan Tablosu & Maçlar — Nahaber',
    description: 'Türkiye Süper Lig puan tablosu, bugünkü maçlar ve canlı skorlar.',
  },
}

export default function FutbolCanliPage() {
  return <FootballPage />
}

import type { Metadata } from 'next'
import { MuseumBrowser } from '@/components/museums/MuseumBrowser'

export const revalidate = 86400

export const metadata: Metadata = {
  title: 'Türkiye Müzeleri',
  description:
    "Türkiye'deki müzeleri şehre göre keşfet. Adres, çalışma saatleri, telefon ve diğer detaylar.",
  openGraph: {
    title: 'Türkiye Müzeleri — Nahaber',
    description:
      "Türkiye'deki müzeleri şehre göre keşfet. Adres, çalışma saatleri, telefon ve diğer detaylar.",
  },
}

export default function MuzelerPage() {
  return <MuseumBrowser />
}

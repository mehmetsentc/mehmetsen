import type { Metadata } from 'next'
import { LocalNewsClient } from '@/components/local/LocalNewsClient'

export const metadata: Metadata = {
  title: 'Yerel Haberler | NaHaber',
  description: 'Bulunduğunuz şehre ve çevrenize özel haberler',
}

export default function LocalNewsPage() {
  return <LocalNewsClient />
}

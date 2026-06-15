import type { Metadata } from 'next'
import { LocalNewsClient } from '@/components/local/LocalNewsClient'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Yerel Haberler',
  description: 'Bulunduğunuz şehre ve çevrenize özel haberler',
}

export default function LocalNewsPage() {
  return <LocalNewsClient />
}

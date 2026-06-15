import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ara',
  description: 'NaHaber içinde haber, kullanıcı ve konu ara.',
  robots: { index: false, follow: false },
}

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children
}

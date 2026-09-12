import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Kaydedilenler',
  robots: { index: false, follow: false },
}

export default function SavedLayout({ children }: { children: React.ReactNode }) {
  return children
}

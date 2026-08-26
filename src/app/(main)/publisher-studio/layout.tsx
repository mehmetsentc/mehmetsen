import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Publisher Studio',
  robots: { index: false, follow: false },
}

export default function PublisherStudioLayout({ children }: { children: React.ReactNode }) {
  return <div className="publisher-studio">{children}</div>
}

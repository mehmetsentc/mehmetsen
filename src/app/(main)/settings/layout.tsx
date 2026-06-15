import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ayarlar',
  robots: { index: false, follow: false },
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <div className="settings-hub">{children}</div>
}

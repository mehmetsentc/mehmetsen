import { notFound } from 'next/navigation'
import { DesignSystemShowcase } from './DesignSystemShowcase'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

/**
 * /dev/design-system — F1 vitrin sayfası.
 * Sadece DEV ortamında erişilebilir; prod'da 404 döner.
 * NaHaber 2026 tasarım dilini (token + primitive'ler) tek ekranda gösterir.
 */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <DesignSystemShowcase />
}

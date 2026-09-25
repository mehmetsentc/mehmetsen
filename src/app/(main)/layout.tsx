import { MainLayoutClient } from '@/components/layout/MainLayoutClient'

/**
 * National chrome only. City hosts are rewritten to /city-site/* in middleware
 * (including /haber). This layout must not call headers() or cookies(), or
 * Vercel marks every HTML response private, no-store.
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <MainLayoutClient>{children}</MainLayoutClient>
}

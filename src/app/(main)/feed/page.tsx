import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ROUTES } from '@/constants/routes'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

/** Eski /feed adresi — Anasayfa artık `/`. next.config 301 asıl kaynak. */
export default function FeedAliasPage() {
  redirect(ROUTES.HOME)
}

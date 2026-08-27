import { notFound } from 'next/navigation'
import Link from 'next/link'
import { hasDatabaseUrl } from '@/db'
import { isAdvertiserPlatformEnabled } from '@/lib/advertiser/marketplaceFlags'

export const dynamic = 'force-dynamic'

export default function AdvertiserIndexPage() {
  if (!isAdvertiserPlatformEnabled() || !hasDatabaseUrl()) notFound()
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="mb-4 text-3xl font-semibold">Reklamveren Stüdyo</h1>
      <p className="mb-8 text-stone-600">
        Hesabınızı oluşturun veya mevcut hesabınıza giriş yapın.
      </p>
      <div className="flex flex-col gap-3">
        <Link
          href="/advertiser/onboarding"
          className="rounded bg-stone-900 px-4 py-3 text-white"
        >
          Reklam Ver — Hesap Oluştur
        </Link>
        <Link href="/advertiser/onboarding" className="text-sm text-stone-600 underline">
          Mevcut hesaplarımı gör
        </Link>
      </div>
    </div>
  )
}

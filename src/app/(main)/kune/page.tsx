import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/seo'

const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'Künye',
  description: `${siteName} yayın bilgileri, sorumlu müdür ve iletişim bilgileri.`,
  alternates: { canonical: `${siteUrl}/kune` },
}

export default function KunePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold">Künye</h1>

      <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-white/5">
        {[
          { label: 'Yayın Adı',          value: siteName },
          { label: 'Yayın Türü',         value: 'İnternet Haber Sitesi' },
          { label: 'Yayın Dili',         value: 'Türkçe' },
          { label: 'Yayın Adresi',       value: siteUrl },
          { label: 'Genel Yayın Yönetmeni', value: 'NaHaber Editörya' },
          { label: 'İletişim',           value: 'bilgi@nahaber.com' },
          { label: 'Haber İletişim',     value: 'bilgi@nahaber.com' },
          { label: 'Kuruluş Yılı',       value: '2024' },
          { label: 'Yayın Bölgesi',      value: 'Türkiye' },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:items-center sm:gap-4">
            <span className="w-52 shrink-0 text-sm font-medium text-white">{label}</span>
            <span className="text-sm text-[rgb(var(--color-muted))]">{value}</span>
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-[rgb(var(--color-muted))]">
        {siteName}, 5187 sayılı Basın Kanunu ve 5651 sayılı İnternet Ortamında Yapılan
        Yayınların Düzenlenmesi ve Bu Yayınlar Yoluyla İşlenen Suçlarla Mücadele Edilmesi
        Hakkında Kanun kapsamında yayın yapmaktadır.
      </p>
    </main>
  )
}

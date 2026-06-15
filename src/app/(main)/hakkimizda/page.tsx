import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/seo'

const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: `Hakkımızda | ${siteName}`,
  description: `${siteName} hakkında bilgi edinin. Misyonumuz, vizyonumuz ve haber anlayışımız.`,
  alternates: { canonical: `${siteUrl}/hakkimizda` },
  openGraph: {
    title: `Hakkımızda | ${siteName}`,
    description: `${siteName} hakkında bilgi edinin.`,
    url: `${siteUrl}/hakkimizda`,
    type: 'website',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  name: `${siteName} Hakkımızda`,
  url: `${siteUrl}/hakkimizda`,
  mainEntity: {
    '@type': 'NewsMediaOrganization',
    name: siteName,
    url: siteUrl,
    foundingDate: '2024',
    areaServed: 'TR',
    inLanguage: 'tr-TR',
    publishingPrinciples: `${siteUrl}/editoryal-ilkeler`,
    logo: {
      '@type': 'ImageObject',
      url: `${siteUrl}/brand/nahaber-logo.png`,
    },
  },
}

export default function HakkimizdaPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-6 text-3xl font-bold">Hakkımızda</h1>

        <section className="prose prose-invert max-w-none space-y-6 text-[rgb(var(--color-muted))]">
          <p>
            <strong className="text-white">NaHaber</strong>, Türkiye'nin anlık dijital haber
            platformudur. Gündem, siyaset, ekonomi, spor, teknoloji, sağlık ve dünya
            haberlerini hızlı, doğru ve tarafsız biçimde okuyucularına ulaştırmayı
            hedeflemekteyiz.
          </p>

          <h2 className="text-xl font-semibold text-white">Misyonumuz</h2>
          <p>
            Vatandaşların güvenilir, hızlı ve kapsamlı haberlere erişimini sağlamak; bilgiye
            dayalı bir toplum oluşturulmasına katkıda bulunmak.
          </p>

          <h2 className="text-xl font-semibold text-white">Vizyonumuz</h2>
          <p>
            Türkiye'nin en güvenilir dijital haber kaynağı olmak ve okuyucularımızı doğru
            bilgiyle güçlendirmek.
          </p>

          <h2 className="text-xl font-semibold text-white">Haber Anlayışımız</h2>
          <p>
            Tüm haberlerimiz doğruluğu teyit edilmiş kaynaklardan derlenmekte, editöryal
            standartlarımız çerçevesinde işlenmektedir. Habercilik faaliyetlerimizde bağımsızlık,
            tarafsızlık ve şeffaflık ilkelerine sıkı sıkıya bağlıyız.
          </p>

          <h2 className="text-xl font-semibold text-white">İletişim</h2>
          <p>
            Görüş, öneri ve şikayetleriniz için{' '}
            <a href="/iletisim" className="text-[rgb(var(--color-brand))] underline">
              iletişim sayfamızı
            </a>{' '}
            ziyaret edebilirsiniz.
          </p>
        </section>
      </main>
    </>
  )
}

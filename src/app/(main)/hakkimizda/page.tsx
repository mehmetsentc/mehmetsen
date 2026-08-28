import type { Metadata } from 'next'
import Link from 'next/link'
import { getSiteUrl } from '@/lib/seo'

const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'Hakkımızda',
  description: `${siteName} hakkında bilgi edinin. Misyonumuz, vizyonumuz, editoryal standartlarımız ve iletişim.`,
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
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-6 text-3xl font-bold">Hakkımızda</h1>

        <section className="prose prose-invert max-w-none space-y-6 text-[rgb(var(--color-muted))]">
          <p>
            <strong className="text-white">NaHaber</strong>, Türkiye&apos;nin dijital haber
            platformudur. Gündem, siyaset, ekonomi, spor, teknoloji, sağlık, kültür ve dünya
            haberlerini hızlı, doğru ve anlaşılır biçimde okuyucularına ulaştırmayı hedefler.
            Yerel gelişmelerden ulusal gündeme, spordan bilime kadar geniş bir yelpazede
            güncel içerik sunar.
          </p>

          <h2 className="text-xl font-semibold text-white">Misyonumuz</h2>
          <p>
            Vatandaşların güvenilir, hızlı ve kapsamlı haberlere erişimini sağlamak; bilgiye
            dayalı bir kamuoyu oluşumuna katkıda bulunmak. Her haber sayfasında okuyucuya
            bağlam, olgu ve arka plan sunarak yalnızca manşet değil, anlamlı bir okuma
            deneyimi vermeyi amaçlarız.
          </p>

          <h2 className="text-xl font-semibold text-white">Vizyonumuz</h2>
          <p>
            Türkiye&apos;nin güvenilir dijital haber kaynaklarından biri olmak; okuyucuları
            doğru ve zamanında bilgiyle güçlendirmek. Mobil ve masaüstünde hızlı, erişilebilir
            ve şeffaf bir yayın deneyimi sunmak.
          </p>

          <h2 className="text-xl font-semibold text-white">Haber anlayışımız</h2>
          <p>
            Haberlerimiz doğrulanabilir kaynaklardan derlenir, editoryal standartlarımız
            çerçevesinde işlenir ve yayınlanır. Bağımsızlık, tarafsızlık, düzeltme politikası
            ve şeffaflık ilkelerimize{' '}
            <Link href="/editoryal-ilkeler" className="text-[rgb(var(--color-brand))] underline">
              Editoryal İlkeler
            </Link>{' '}
            sayfamızda yer veriyoruz. Yayın künyemiz için{' '}
            <Link href="/kunye" className="text-[rgb(var(--color-brand))] underline">
              Künye
            </Link>{' '}
            sayfasına bakabilirsiniz.
          </p>

          <h2 className="text-xl font-semibold text-white">Editoryal süreç ve teknoloji</h2>
          <p>
            NaHaber, haber üretim sürecinde yapay zekâ destekli araçlardan yararlanabilir;
            ancak içerikler otomatik üretilmiş sayfa yığını değildir. Kaynak tarama, taslak
            üretimi ve dil düzenlemesi araçlarla hızlandırılır; yayın öncesi editoryal
            denetim, kategori ve kalite kontrolleri uygulanır. Okuyucuya sunulan metinlerin
            olgusal tutarlılığı ve okunabilirliği önceliğimizdir.
          </p>

          <h2 className="text-xl font-semibold text-white">Kategoriler ve yerel haber</h2>
          <p>
            Platform; gündem, siyaset, ekonomi, spor, dünya, teknoloji, sağlık, kültür,
            turizm ve daha birçok kategoride içerik barındırır. Ayrıca şehir bazlı{' '}
            <Link href="/yerel" className="text-[rgb(var(--color-brand))] underline">
              yerel haber
            </Link>{' '}
            akışı ve{' '}
            <Link href="/events" className="text-[rgb(var(--color-brand))] underline">
              etkinlikler
            </Link>{' '}
            bölümü ile kullanıcıya günlük yaşamda işe yarayan bilgi sunmayı hedefleriz.
          </p>

          <h2 className="text-xl font-semibold text-white">İletişim</h2>
          <p>
            Görüş, öneri, düzeltme talebi ve reklam iş birlikleri için{' '}
            <Link href="/iletisim" className="text-[rgb(var(--color-brand))] underline">
              iletişim sayfamızı
            </Link>{' '}
            ziyaret edebilir veya{' '}
            <a href="mailto:bilgi@nahaber.com" className="text-[rgb(var(--color-brand))] underline">
              bilgi@nahaber.com
            </a>{' '}
            adresine yazabilirsiniz. Gizlilik uygulamalarımız{' '}
            <Link href="/gizlilik" className="text-[rgb(var(--color-brand))] underline">
              Gizlilik Politikası
            </Link>{' '}
            sayfasındadır.
          </p>
        </section>
      </div>
    </>
  )
}

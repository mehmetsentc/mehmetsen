import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/seo'

const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: `Editoryal İlkeler | ${siteName}`,
  description: `${siteName}'in haber doğrulama, kaynak standartları ve editoryal bağımsızlık ilkeleri.`,
  alternates: { canonical: `${siteUrl}/editoryal-ilkeler` },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: `${siteName} Editoryal İlkeler`,
  url: `${siteUrl}/editoryal-ilkeler`,
  description: `${siteName} haber standartları ve editoryal bağımsızlık politikası`,
}

export default function EditoryelIlkelerPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-2 text-3xl font-bold">Editoryal İlkeler</h1>
        <p className="mb-8 text-sm text-[rgb(var(--color-muted))]">Son güncelleme: Haziran 2025</p>

        <div className="prose prose-invert max-w-none space-y-6 text-[rgb(var(--color-muted))]">
          <h2 className="text-xl font-semibold text-white">1. Bağımsızlık</h2>
          <p>
            {siteName} editoryal kararları ticari veya siyasi baskılardan bağımsız olarak
            alınmaktadır. Hiçbir haber, reklam veya iş birliği gerekçesiyle değiştirilemez,
            bastırılamaz veya öne çıkarılamaz.
          </p>

          <h2 className="text-xl font-semibold text-white">2. Doğruluk ve Kaynak Standartları</h2>
          <p>
            Tüm haberler en az iki güvenilir kaynakla doğrulanmaktadır. Resmi açıklamalar,
            bilimsel veriler ve uzman görüşleri öncelikli kaynaklarımızdır. Hatalı bilgi
            fark edildiğinde haber derhal düzeltilir ve düzeltme notu eklenir.
          </p>

          <h2 className="text-xl font-semibold text-white">3. Tarafsızlık</h2>
          <p>
            Siyasi, etnik veya dinî ayrım gözetmeksizin tüm görüşlere eşit uzaklıkta
            haberciliği benimsiyoruz. Yorum ve analiz içerikleri açıkça etiketlenerek
            haber içeriğinden ayrıştırılmaktadır.
          </p>

          <h2 className="text-xl font-semibold text-white">4. Hata Düzeltme Politikası</h2>
          <p>
            Yayınlanan haberlerdeki hatalar en kısa sürede düzeltilir. Önemli hatalar için
            makalenin başında açık bir düzeltme notu yayınlanır. Düzeltme taleplerini{' '}
            <a href="mailto:haber@nahaber.com" className="text-[rgb(var(--color-brand))] underline">
              haber@nahaber.com
            </a>{' '}
            adresine iletebilirsiniz.
          </p>

          <h2 className="text-xl font-semibold text-white">5. Çıkar Çatışması</h2>
          <p>
            Muhabirler ve editörler, haber yapacakları konularda çıkar çatışması olduğunda
            haberi başka bir editöre devreder. Destekçi veya iş ortağı olduğumuz kuruluşlara
            ilişkin haberler açıkça etiketlenir.
          </p>

          <h2 className="text-xl font-semibold text-white">6. Yapay Zeka Kullanımı</h2>
          <p>
            Haberlerimiz yapay zeka destekli araçlarla işlenip düzenlenebilir; ancak tüm
            içerikler yayın öncesinde editörel denetimden geçirilmektedir. Yapay zeka içerik
            üreticisi değil, editoryal verimliliği artıran bir araç olarak kullanılmaktadır.
          </p>
        </div>
      </main>
    </>
  )
}

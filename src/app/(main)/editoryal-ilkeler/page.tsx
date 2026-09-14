import type { Metadata } from 'next'
import { NewspaperEditorialPage } from '@/components/home/desktop/NewspaperEditorialPage'
import { getSiteUrl } from '@/lib/seo'

const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'Editoryal İlkeler',
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
      <NewspaperEditorialPage
        title="Editoryal İlkeler"
        kicker="Kurumsal"
        updated="Son güncelleme: Haziran 2025"
      >
        <div className="space-y-6">
          <h2>1. Bağımsızlık</h2>
          <p>
            {siteName} editoryal kararları ticari veya siyasi baskılardan bağımsız olarak
            alınmaktadır. Hiçbir haber, reklam veya iş birliği gerekçesiyle değiştirilemez,
            bastırılamaz veya öne çıkarılamaz.
          </p>

          <h2>2. Doğruluk ve Kaynak Standartları</h2>
          <p>
            Tüm haberler en az iki güvenilir kaynakla doğrulanmaktadır. Resmi açıklamalar,
            bilimsel veriler ve uzman görüşleri öncelikli kaynaklarımızdır. Hatalı bilgi
            fark edildiğinde haber derhal düzeltilir ve düzeltme notu eklenir.
          </p>

          <h2>3. Tarafsızlık</h2>
          <p>
            Siyasi, etnik veya dinî ayrım gözetmeksizin tüm görüşlere eşit uzaklıkta
            haberciliği benimsiyoruz. Yorum ve analiz içerikleri açıkça etiketlenerek
            haber içeriğinden ayrıştırılmaktadır.
          </p>

          <h2>4. Hata Düzeltme Politikası</h2>
          <p>
            Yayınlanan haberlerdeki hatalar en kısa sürede düzeltilir. Önemli hatalar için
            makalenin başında açık bir düzeltme notu yayınlanır. Düzeltme taleplerini{' '}
            <a href="mailto:bilgi@nahaber.com" className="text-[rgb(var(--color-brand))] underline">
              bilgi@nahaber.com
            </a>{' '}
            adresine iletebilirsiniz.
          </p>

          <h2>5. Çıkar Çatışması</h2>
          <p>
            Muhabirler ve editörler, haber yapacakları konularda çıkar çatışması olduğunda
            haberi başka bir editöre devreder. Destekçi veya iş ortağı olduğumuz kuruluşlara
            ilişkin haberler açıkça etiketlenir.
          </p>

          <h2>6. Yapay Zeka Kullanımı</h2>
          <p>
            Haber üretim sürecinde yapay zekâ destekli araçlar (kaynak tarama, taslak,
            dil düzenleme) kullanılabilir. Bu araçlar içerik üreticisinin yerine geçmez;
            editoryal verimliliği artırır. Yayın öncesinde kalite, tutarlılık ve kategori
            kontrolleri uygulanır. Okuyucuya sunulan haberler otomatik üretilmiş ince
            sayfa yığını olarak tasarlanmaz; anlamlı gövde metni ve bağlam hedeflenir.
          </p>
        </div>
      </NewspaperEditorialPage>
    </>
  )
}

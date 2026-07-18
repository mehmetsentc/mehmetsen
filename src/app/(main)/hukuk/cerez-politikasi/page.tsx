import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Çerez Politikası | NaHaber',
  description: 'NaHaber çerez politikası — hangi çerezleri kullandığımız ve nasıl yönetebileceğiniz.',
}

export default function CerezPolitikasiPage() {
  return (
    <div className="legal-content prose prose-sm max-w-none text-[rgb(var(--color-text))]">
      <h1 className="text-2xl font-black text-[rgb(var(--color-text))] mb-1">Çerez Politikası</h1>
      <p className="text-xs text-[rgb(var(--color-muted))] mb-8">Son güncelleme: Haziran 2025</p>

      <Section title="1. Çerez Nedir?">
        <p>
          Çerezler (cookies), bir web sitesini ziyaret ettiğinizde tarayıcınız aracılığıyla
          cihazınıza yerleştirilen küçük metin dosyalarıdır. Bu dosyalar, siteyi tekrar
          ziyaretinizde sizi tanımamıza ve tercihlerinizi hatırlamamıza yardımcı olur.
        </p>
      </Section>

      <Section title="2. Kullandığımız Çerez Türleri">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-[rgb(var(--color-border))]">
              <th className="py-2 pr-4 text-left font-bold text-[rgb(var(--color-text))] w-36">Tür</th>
              <th className="py-2 pr-4 text-left font-bold text-[rgb(var(--color-text))] w-36">Örnek</th>
              <th className="py-2 text-left font-bold text-[rgb(var(--color-text))]">Amaç</th>
            </tr>
          </thead>
          <tbody>
            <CRow type="Zorunlu" example="Oturum çerezi" purpose="Giriş durumu, güvenlik token. Bu çerezler olmadan site düzgün çalışmaz." />
            <CRow type="Tercih" example="Tema, dil, şehir seçimi" purpose="Kullanıcının seçimlerini hatırlamak (koyu/açık mod, yerel şehir)." />
            <CRow type="Analitik" example="Google Analytics" purpose="Anonim ziyaretçi istatistiği, popüler içerik tespiti. Kişisel kimlik içermez." />
            <CRow type="Performans" example="Vercel Speed Insights" purpose="Sayfa yükleme süresi ve teknik performans ölçümü." />
          </tbody>
        </table>
      </Section>

      <Section title="3. Üçüncü Taraf Çerezleri">
        <p>
          Platformumuzda aşağıdaki üçüncü taraf hizmetleri çerez veya benzeri teknolojiler kullanmaktadır:
        </p>
        <ul>
          <li>
            <strong>Google AdSense (Google LLC)</strong> — reklamların gösterilmesi ve kişiselleştirilmesi;
            DoubleClick DART çerezi dahil. Kişiselleştirilmiş reklamları devre dışı bırakmak için{' '}
            <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer"
              className="underline">Google Reklam Ayarları</a>&apos;nı ziyaret edin.
          </li>
          <li><strong>Google Analytics (Google LLC)</strong> — anonim kullanım istatistiği</li>
          <li><strong>Firebase / Firestore (Google LLC)</strong> — kimlik doğrulama ve veritabanı</li>
          <li><strong>Vercel Inc.</strong> — hosting ve performans izleme</li>
        </ul>
        <p>
          Bu hizmetlerin çerez politikaları için ilgili şirketlerin gizlilik belgelerine
          başvurmanızı öneririz. Google&apos;ın gizlilik politikasına{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer"
            className="underline">buradan</a> ulaşabilirsiniz.
        </p>
      </Section>

      <Section title="4. Çerezleri Yönetme">
        <p>
          İlk ziyaretinizde sunulan onay banner'ı aracılığıyla zorunlu çerezler dışındaki
          tüm çerezleri reddedebilirsiniz. Ayrıca tarayıcınızın ayarlarından çerezleri
          istediğiniz zaman silebilir veya engelleyebilirsiniz:
        </p>
        <ul>
          <li>Chrome: Ayarlar → Gizlilik ve Güvenlik → Çerezler</li>
          <li>Safari: Tercihler → Gizlilik → Çerezleri Yönet</li>
          <li>Firefox: Ayarlar → Gizlilik ve Güvenlik → Çerezler ve Site Verileri</li>
        </ul>
        <p className="text-[rgb(var(--color-muted))]">
          Not: Zorunlu çerezlerin engellenmesi sitenin bazı özelliklerini kullanılamaz hale getirebilir.
        </p>
      </Section>

      <Section title="5. Onayınızı Geri Alma">
        <p>
          Daha önce verdiğiniz çerez onayını tarayıcınızın yerel depolamasından
          <code className="mx-1 rounded bg-[rgb(var(--color-surface))] px-1 py-0.5 text-xs">nahaber-consent</code>
          anahtarını silerek geri alabilirsiniz. Sayfayı yenilediğinizde onay ekranı tekrar gösterilecektir.
        </p>
      </Section>

      <Section title="6. İletişim">
        <p>
          Çerez uygulamalarımız hakkında sorularınız için{' '}
          <a href="mailto:bilgi@nahaber.com" className="text-[rgb(var(--color-brand))] hover:underline">
            bilgi@nahaber.com
          </a>{' '}
          adresiyle iletişime geçebilir veya{' '}
          <Link href="/hukuk/kvkk" className="text-[rgb(var(--color-brand))] hover:underline">
            KVKK Politikamızı
          </Link>{' '}
          inceleyebilirsiniz.
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-base font-bold text-[rgb(var(--color-text))]">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-[rgb(var(--color-text))]">
        {children}
      </div>
    </section>
  )
}

function CRow({ type, example, purpose }: { type: string; example: string; purpose: string }) {
  return (
    <tr className="border-b border-[rgb(var(--color-border))]">
      <td className="py-2 pr-4 font-semibold text-[rgb(var(--color-text))]">{type}</td>
      <td className="py-2 pr-4 text-[rgb(var(--color-muted))]">{example}</td>
      <td className="py-2 text-[rgb(var(--color-text))]">{purpose}</td>
    </tr>
  )
}

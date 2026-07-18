import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Kullanım Koşulları | NaHaber',
  description: 'NaHaber platform kullanım koşulları ve hizmet şartları.',
}

export default function KullanimKosullariPage() {
  return (
    <div className="legal-content prose prose-sm max-w-none text-[rgb(var(--color-text))]">
      <h1 className="text-2xl font-black text-[rgb(var(--color-text))] mb-1">Kullanım Koşulları</h1>
      <p className="text-xs text-[rgb(var(--color-muted))] mb-8">Son güncelleme: Haziran 2025</p>

      <Section title="1. Kabul">
        <p>
          nahaber.com'u ziyaret ederek veya kullanarak bu Kullanım Koşulları'nı kabul etmiş
          sayılırsınız. Koşulları kabul etmiyorsanız lütfen sitemizi kullanmayınız.
        </p>
      </Section>

      <Section title="2. Hizmet Tanımı">
        <p>
          NaHaber; Shen Medya tarafından işletilen, yapay zeka destekli içerik düzenleme
          teknolojileri kullanan bir haber platformudur. Platform; son dakika haberleri,
          yerel haberler, spor, ekonomi ve diğer kategorilerde içerik sunar.
        </p>
      </Section>

      <Section title="3. Kullanım Kuralları">
        <p>Platforma erişim sağlayan kişiler aşağıdaki kurallara uymakla yükümlüdür:</p>
        <ul>
          <li>Yasalara, genel ahlaka ve kamu düzenine aykırı içerik paylaşmak yasaktır.</li>
          <li>Başkalarının kişisel verilerini izinsiz toplamak veya kullanmak yasaktır.</li>
          <li>Siteye zarar verebilecek yazılım, botlar veya otomatik araçlar kullanmak yasaktır.</li>
          <li>Telif hakkı korunan içerikleri izinsiz çoğaltmak veya dağıtmak yasaktır.</li>
          <li>Yanıltıcı, hakaret içeren veya iftira niteliğindeki yorum ve içerikler paylaşmak yasaktır.</li>
          <li>Platform güvenliğini tehdit eden her türlü eylem yasaktır.</li>
        </ul>
      </Section>

      <Section title="4. Fikri Mülkiyet">
        <p>
          NaHaber'in ürettiği veya derlediği tüm içerikler (haberler, tasarım, logo, yazılım kodu)
          telif hakkı ve fikri mülkiyet mevzuatı ile korunmaktadır. İçerikler yalnızca
          kişisel ve ticari olmayan amaçlarla kullanılabilir. İzinsiz kopyalama, yayma
          veya ticari kullanım yasaktır.
        </p>
        <p>
          Üçüncü taraf haber kaynaklarından derlenen içeriklerin telif hakları ilgili kaynaklara
          aittir. NaHaber, bu içeriklere yorum, başlık ve özet ekleyerek özgün katkı sağlamaktadır.
        </p>
      </Section>

      <Section title="5. Kullanıcı İçerikleri">
        <p>
          Yorum veya içerik paylaştığınızda, bu içeriğin NaHaber tarafından platform üzerinde
          görüntülenmesi için gerekli lisansı vermiş olursunuz. NaHaber, kurallara aykırı
          içerikleri önceden bildirmeksizin kaldırma hakkını saklı tutar.
        </p>
      </Section>

      <Section title="6. Sorumluluk Sınırlaması">
        <p>
          NaHaber, sunduğu haberler için doğruluk ve tamlık adına azami özeni gösterir; ancak
          haber içeriklerinden kaynaklanan dolaylı zararlar için sorumluluk kabul etmez.
          Platform; üçüncü taraf bağlantılarına (dış linkler) erişimden doğan sorunlardan
          sorumlu tutulamaz.
        </p>
      </Section>

      <Section title="7. Hizmet Kesintileri">
        <p>
          NaHaber, teknik bakım, güvenlik güncellemesi veya öngörülemeyen durumlar nedeniyle
          hizmeti geçici olarak kısıtlayabilir ya da durdurabilir. Bu durumlardan doğacak
          aksaklıklar için sorumluluk kabul edilmez.
        </p>
      </Section>

      <Section title="8. Gizlilik">
        <p>
          Kişisel verilerinizin işlenmesi hakkında bilgi almak için{' '}
          <Link href="/hukuk/kvkk" className="text-[rgb(var(--color-brand))] hover:underline">
            KVKK Politikamızı
          </Link>{' '}
          ve{' '}
          <Link href="/hukuk/gizlilik" className="text-[rgb(var(--color-brand))] hover:underline">
            Gizlilik Politikamızı
          </Link>{' '}
          inceleyebilirsiniz.
        </p>
      </Section>

      <Section title="9. Uygulanacak Hukuk">
        <p>
          Bu koşullar Türk hukukuna tabidir. Uyuşmazlıklarda İstanbul Mahkemeleri ve
          İcra Daireleri yetkilidir.
        </p>
      </Section>

      <Section title="10. Değişiklikler">
        <p>
          NaHaber, bu koşulları önceden bildirmeksizin güncelleme hakkını saklı tutar.
          Değişiklikler yayımlandığı andan itibaren geçerlidir.
        </p>
      </Section>

      <Section title="11. İletişim">
        <p>
          Kullanım koşullarına ilişkin sorularınız için:{' '}
          <a href="mailto:bilgi@nahaber.com" className="text-[rgb(var(--color-brand))] hover:underline">
            bilgi@nahaber.com
          </a>
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

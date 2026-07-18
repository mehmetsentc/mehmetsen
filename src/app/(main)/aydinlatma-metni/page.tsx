import type { Metadata } from 'next'
import Link from 'next/link'
import { ROUTES } from '@/constants/routes'

export const metadata: Metadata = {
  title: 'KVKK Aydınlatma Metni',
  description: '6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında kişisel verilerinizin işlenmesine ilişkin aydınlatma metni.',
}

export default function KVKKPage() {
  return (
    <article className="prose prose-sm mx-auto max-w-2xl dark:prose-invert px-2 py-6">
      <h1 className="text-xl font-black text-[rgb(var(--color-text))]">
        KVKK Kişisel Verilerin Korunması Aydınlatma Metni
      </h1>
      <p className="text-xs text-[rgb(var(--color-muted))]">Son güncelleme: Haziran 2025</p>

      <p>
        <strong>NaHaber</strong> olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu
        (&quot;KVKK&quot;) kapsamında veri sorumlusu sıfatıyla, kişisel verilerinizi aşağıda
        açıklanan amaçlar doğrultusunda işlemekteyiz.
      </p>

      <h2>1. Veri Sorumlusu</h2>
      <p>
        NaHaber Haber Platformu (&quot;NaHaber&quot; veya &quot;Şirket&quot;) olarak kişisel
        verilerinizin işlenmesinden sorumlu veri sorumlusuyuz.
      </p>

      <h2>2. İşlenen Kişisel Veriler</h2>
      <ul>
        <li><strong>Kimlik verileri:</strong> Ad, soyad, kullanıcı adı</li>
        <li><strong>İletişim verileri:</strong> E-posta adresi</li>
        <li><strong>Konum verileri:</strong> Yerel haber özelliği için şehir/ilçe bilgisi (izin vermeniz halinde)</li>
        <li><strong>Kullanım verileri:</strong> Okunan haberler, beğeniler, yorumlar, paylaşımlar</li>
        <li><strong>Teknik veriler:</strong> IP adresi, tarayıcı türü, cihaz bilgisi, çerez verileri</li>
        <li><strong>İçerik verileri:</strong> Yüklediğiniz haberler, görseller ve videolar</li>
      </ul>

      <h2>3. Kişisel Verilerin İşlenme Amaçları</h2>
      <ul>
        <li>Hesap oluşturma ve kimlik doğrulama</li>
        <li>Platform hizmetlerinin sunulması ve iyileştirilmesi</li>
        <li>Yerel haberlerin konuma göre kişiselleştirilmesi</li>
        <li>İçerik moderasyonu ve güvenliğin sağlanması</li>
        <li>Bildirim ve iletişim hizmetleri</li>
        <li>Analitik ve istatistiksel raporlama</li>
        <li>Yasal yükümlülüklerin yerine getirilmesi</li>
      </ul>

      <h2>4. Hukuki İşleme Dayanakları</h2>
      <p>Kişisel verileriniz aşağıdaki hukuki dayanaklara göre işlenmektedir:</p>
      <ul>
        <li>Sözleşmenin kurulması veya ifası (KVKK m.5/2-c)</li>
        <li>Veri sorumlusunun meşru menfaatleri (KVKK m.5/2-f)</li>
        <li>Açık rızanız (KVKK m.5/1) — analitik ve pazarlama çerezleri için</li>
        <li>Kanuni yükümlülük (KVKK m.5/2-ç)</li>
      </ul>

      <h2>5. Çerezler ve İzleme Teknolojileri</h2>
      <p>
        NaHaber, aşağıdaki çerez kategorilerini kullanmaktadır:
      </p>
      <ul>
        <li>
          <strong>Zorunlu çerezler:</strong> Oturum yönetimi ve güvenlik için gereklidir.
          Rızanıza gerek olmaksızın kullanılır.
        </li>
        <li>
          <strong>Analitik çerezler:</strong> Kullanım istatistiklerini toplamak için kullanılır.
          Açık rızanıza tabidir.
        </li>
        <li>
          <strong>Kişiselleştirme çerezleri:</strong> İçerik önerilerini özelleştirmek için
          kullanılır. Açık rızanıza tabidir.
        </li>
      </ul>
      <p>
        Çerez tercihlerinizi{' '}
        <Link href={ROUTES.SETTINGS_PRIVACY} className="text-[rgb(var(--color-brand))]">
          Ayarlar → Gizlilik
        </Link>{' '}
        bölümünden her zaman değiştirebilirsiniz.
      </p>

      <h2>6. Kişisel Verilerin Aktarımı</h2>
      <p>
        Kişisel verileriniz; altyapı hizmetleri için <strong>Google Firebase</strong> (Alphabet
        Inc.) ile paylaşılmaktadır. Bu aktarım, Türkiye Kişisel Verileri Koruma Kurulu
        kararları ve standart sözleşme maddeleri çerçevesinde gerçekleştirilmektedir.
      </p>

      <h2>7. Veri Saklama Süresi</h2>
      <ul>
        <li>Hesap verileri: Hesap silinene kadar veya son aktiviteden itibaren 3 yıl</li>
        <li>Analitik veriler: 13 ay</li>
        <li>Çerez verileri: İzin kararına göre en fazla 12 ay</li>
        <li>Hukuki yükümlülükler kapsamındaki veriler: Kanunun öngördüğü süre boyunca</li>
      </ul>

      <h2>8. KVKK Kapsamındaki Haklarınız</h2>
      <p>KVKK&apos;nın 11. maddesi uyarınca aşağıdaki haklara sahipsiniz:</p>
      <ul>
        <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
        <li>İşlenmişse buna ilişkin bilgi talep etme</li>
        <li>İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme</li>
        <li>Yurt içinde/dışında aktarılan üçüncü kişileri öğrenme</li>
        <li>Eksik veya yanlış işlenmiş verilerin düzeltilmesini isteme</li>
        <li>Kişisel verilerin silinmesini veya yok edilmesini isteme</li>
        <li>İşlemin üçüncü kişilere bildirilmesini isteme</li>
        <li>İşlenen verilerin münhasıran otomatik sistemler vasıtasıyla aleyhinize bir sonuç doğurmasına itiraz etme</li>
        <li>Kanuna aykırı işleme nedeniyle zararın giderilmesini talep etme</li>
      </ul>

      <h2>9. İletişim</h2>
      <p>
        Haklarınızı kullanmak veya sorularınız için:{' '}
        <a href="mailto:bilgi@nahaber.com" className="text-[rgb(var(--color-brand))]">
          bilgi@nahaber.com
        </a>
      </p>
      <p>
        Başvurularınız 30 gün içinde yanıtlanacaktır. Kişisel Verileri Koruma Kurulu&apos;na
        şikâyette bulunma hakkınız saklıdır.
      </p>

      <div className="mt-8 flex flex-wrap gap-3 text-xs">
        <Link href={ROUTES.SETTINGS_PRIVACY_POLICY ?? '/settings/privacy-policy'} className="text-[rgb(var(--color-brand))]">
          Gizlilik Politikası
        </Link>
        <Link href={ROUTES.SETTINGS_PRIVACY} className="text-[rgb(var(--color-brand))]">
          Çerez Tercihleri
        </Link>
        <Link href={ROUTES.FEED} className="text-[rgb(var(--color-brand))]">
          Ana Sayfa
        </Link>
      </div>
    </article>
  )
}

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'KVKK — Kişisel Verilerin Korunması Politikası | NaHaber',
  description: '6698 sayılı Kişisel Verilerin Korunması Kanunu uyarınca NaHaber kişisel veri işleme politikası.',
}

export default function KVKKPage() {
  return (
    <div className="legal-content prose prose-sm max-w-none text-[rgb(var(--color-text))]">
      <h1 className="text-2xl font-black text-[rgb(var(--color-text))] mb-1">Kişisel Verilerin Korunması Politikası</h1>
      <p className="text-xs text-[rgb(var(--color-muted))] mb-8">Son güncelleme: Haziran 2025 · Versiyon 1.0</p>

      <Section title="1. Giriş ve Amaç">
        <p>
          NaHaber, Shen Medya bünyesinde yayın yapan bir haber platformudur. Bu Politika;
          6698 sayılı <strong>Kişisel Verilerin Korunması Kanunu (KVKK)</strong> ve Avrupa Birliği
          Genel Veri Koruma Tüzüğü <strong>(GDPR)</strong> kapsamında, nahaber.com ziyaretçilerinin
          ve üyelerinin kişisel verilerini nasıl topladığımızı, işlediğimizi ve koruduğumuzu açıklamaktadır.
        </p>
        <p>
          Kişisel verilerin korunması temel önceliğimizdir. Veri sorumlusu sıfatıyla,
          topladığımız her verinin işlenme amacını ve hukuki dayanağını bu Politika ile şeffaf biçimde kamuoyuyla paylaşıyoruz.
        </p>
      </Section>

      <Section title="2. Veri Sorumlusu">
        <table className="w-full text-sm border-collapse">
          <tbody>
            <Row label="Ünvan" value="Shen Medya" />
            <Row label="Platform" value="NaHaber (nahaber.com)" />
            <Row label="İletişim" value="iletisim@nahaber.com" />
            <Row label="Adres" value="Türkiye" />
          </tbody>
        </table>
      </Section>

      <Section title="3. Kapsam">
        <p>
          Bu Politika; nahaber.com'u ziyaret eden, içerik okuyan, üye olan veya herhangi bir
          şekilde etkileşime giren tüm gerçek kişilerin verilerini kapsar. Otomatik ya da otomatik
          olmayan yollarla elde edilen tüm kişisel veriler bu Politika çerçevesinde korunur.
        </p>
      </Section>

      <Section title="4. Topladığımız Veriler ve Amaçları">
        <p>Aşağıdaki veri kategorilerini işleyebiliriz:</p>
        <ul>
          <li><strong>Kimlik ve iletişim verileri:</strong> Üye kaydı sırasında alınan ad, e-posta, kullanıcı adı. Amaç: hesap yönetimi, bildirimler.</li>
          <li><strong>Teknik veriler:</strong> IP adresi, tarayıcı bilgisi, cihaz türü, oturum süresi. Amaç: güvenlik, hizmet kalitesi, istatistik.</li>
          <li><strong>Konum verisi (isteğe bağlı):</strong> Yerel haber sekmesinde kullanıcı izni alınarak şehir tespiti. Amaç: yerel içerik sunumu.</li>
          <li><strong>Kullanım verileri:</strong> Okunan haberler, etkileşimler. Amaç: içerik kişiselleştirme, platform iyileştirme.</li>
          <li><strong>Çerez verileri:</strong> Teknik çerezler ve oturum bilgileri. Ayrıntı için bkz. Çerez Politikamız.</li>
        </ul>
        <p>
          <strong>Özel nitelikli kişisel veri</strong> (sağlık, siyasi görüş, din vb.) toplanmamaktadır.
        </p>
      </Section>

      <Section title="5. İşlemenin Hukuki Dayanakları">
        <ul>
          <li>Açık rıza (KVKK Md. 5/1, GDPR Md. 6/1-a) — çerez onayı</li>
          <li>Sözleşmenin ifası (KVKK Md. 5/2-c) — üyelik hizmetleri</li>
          <li>Hukuki yükümlülük (KVKK Md. 5/2-ç) — 5651 sayılı Kanun log saklama yükümlülüğü</li>
          <li>Meşru menfaat (KVKK Md. 5/2-f) — site güvenliği, dolandırıcılık önleme</li>
        </ul>
      </Section>

      <Section title="6. Verilerin Aktarılması">
        <p>
          Kişisel verileriniz; Firestore/Firebase (Google LLC) altyapısı, Vercel Inc. (hosting),
          Google Analytics (istatistik) gibi hizmet sağlayıcılara KVKK Md. 8–9 ve GDPR Bölüm V
          kapsamında aktarılabilir. Tüm üçüncü taraflar, yeterli güvenlik tedbirlerini almış
          ve gerekli sözleşmelerle bağlı olanlardır.
        </p>
      </Section>

      <Section title="7. Saklama Süreleri">
        <p>
          Veriler, işleme amacının gerektirdiği en kısa süre boyunca saklanır. Üyelik verileri
          hesap silinmesinden itibaren 30 gün içinde; log kayıtları 2 yıl; muhasebe belgeleri
          ise ilgili yasal süre (10 yıl) boyunca muhafaza edilir. Süre dolunca veriler
          silinir, yok edilir veya anonim hale getirilir.
        </p>
      </Section>

      <Section title="8. Güvenlik Tedbirleri">
        <p>
          Verilerinizi korumak için SSL/TLS şifreleme, güvenlik duvarları, erişim kısıtlama,
          düzenli güvenlik denetimleri ve veri minimizasyonu ilkesi uygulanmaktadır. Veri
          ihlali tespitinde KVKK Md. 12/5 uyarınca 72 saat içinde Kurul'a ve ilgili kişilere
          bildirim yapılır.
        </p>
      </Section>

      <Section title="9. Haklarınız">
        <p>KVKK Md. 11 ve GDPR Md. 15–22 uyarınca aşağıdaki haklara sahipsiniz:</p>
        <ul>
          <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
          <li>İşleniyorsa buna ilişkin bilgi talep etme</li>
          <li>İşlenme amacını ve amaca uygunluğunu öğrenme</li>
          <li>Yurt içi veya yurt dışında aktarılan üçüncü kişileri bilme</li>
          <li>Eksik veya yanlış verilerin düzeltilmesini isteme</li>
          <li>Koşulların ortadan kalkması halinde silinmesini / yok edilmesini isteme</li>
          <li>İşlemeye itiraz etme (otomatik kararlar dahil)</li>
          <li>Kanuna aykırı işleme nedeniyle zararın tazminini talep etme</li>
        </ul>
        <p>
          Başvurularınızı <strong>iletisim@nahaber.com</strong> adresine e-posta ile iletebilirsiniz.
          Talebiniz 30 (otuz) gün içinde ücretsiz olarak yanıtlanır. Yanıt yetersiz bulunursa
          <strong> Kişisel Verileri Koruma Kurulu</strong>'na şikâyette bulunabilirsiniz.
        </p>
      </Section>

      <Section title="10. Politika Güncellemeleri">
        <p>
          Bu Politika gerektiğinde güncellenir. Önemli değişiklikler sitemizde duyurulur.
          Güncel sürüm daima nahaber.com/hukuk/kvkk adresinde yayımlanır.
        </p>
      </Section>

      <div className="mt-8 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3 text-xs text-[rgb(var(--color-muted))]">
        Sorularınız için: <a href="mailto:iletisim@nahaber.com" className="text-[rgb(var(--color-brand))] hover:underline">iletisim@nahaber.com</a>
      </div>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-[rgb(var(--color-border))]">
      <td className="py-2 pr-4 font-semibold text-[rgb(var(--color-muted))] w-32">{label}</td>
      <td className="py-2 text-[rgb(var(--color-text))]">{value}</td>
    </tr>
  )
}

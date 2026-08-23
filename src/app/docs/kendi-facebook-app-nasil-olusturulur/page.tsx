import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Kendi Facebook App\'ini Bağla — NaHaber Docs',
  description:
    'Facebook paylaşımlarınızın kendi markanızın adıyla görünmesi için özel Facebook App oluşturma rehberi.',
  robots: { index: false },
}

function Step({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
        {n}
      </div>
      <div className="flex-1 pb-8">
        <h3 className="mb-2 text-base font-bold text-gray-900 dark:text-white">{title}</h3>
        <div className="space-y-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {children}
        </div>
      </div>
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-200">
      {children}
    </code>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-200">
      {children}
    </div>
  )
}

function Success({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-200">
      {children}
    </div>
  )
}

export default function FacebookAppDocPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">

        {/* Header */}
        <div className="mb-10">
          <Link
            href="/admin/social"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            ← Sosyal Medya Paneli
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            Kendi Facebook App&apos;ini Bağla
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Paylaşımlarınızın <strong>&quot;NaHaber paylaştı&quot;</strong> yerine{' '}
            <strong>&quot;Onyeditivi Publisher paylaştı&quot;</strong> şeklinde görünmesi
            ve erişimin artması için kendi Facebook App&apos;inizi bağlayın.
            Yaklaşık 5 dakika sürer.
          </p>
        </div>

        {/* Why */}
        <div className="mb-10 rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 dark:border-blue-900/40 dark:bg-blue-900/20">
          <h2 className="mb-1.5 text-sm font-bold text-blue-800 dark:text-blue-300">Neden önemli?</h2>
          <p className="text-sm text-blue-700 dark:text-blue-200">
            Facebook, aynı App'ten çok sayıda sayfaya yapılan paylaşımları{' '}
            <strong>merkezi içerik dağıtımı</strong> olarak işaretler ve erişimi kısıtlar.
            Kendi App'inizi kullandığınızda paylaşımlar <em>sayfanıza özel</em> görünür,
            Facebook algoritması bunu organik içerik olarak değerlendirir.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 h-full w-px bg-gray-100 dark:bg-gray-800" />

          <Step n={1} title="Facebook Developers'a Git">
            <p>
              Tarayıcınızda{' '}
              <a
                href="https://developers.facebook.com/apps"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                developers.facebook.com/apps
              </a>{' '}
              adresini açın. Facebook hesabınızla giriş yapın.
            </p>
          </Step>

          <Step n={2} title="Yeni App Oluştur">
            <p>
              Sağ üstteki <strong>&quot;Create App&quot;</strong> butonuna tıklayın.
            </p>
            <p>
              Açılan ekranda uygulama türü olarak <strong>&quot;Other&quot;</strong> seçin,
              ardından &quot;Next&quot; ile devam edin.
            </p>
            <p>
              App tipi olarak <strong>&quot;Business&quot;</strong> seçin → Next.
            </p>
          </Step>

          <Step n={3} title="App Adını Girin">
            <p>
              <strong>Display Name</strong> alanına markanıza uygun bir isim yazın:
            </p>
            <div className="my-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
              <p className="font-mono text-sm font-semibold text-gray-800 dark:text-gray-100">
                Onyeditivi Publisher
              </p>
            </div>
            <Note>
              Bu isim Facebook kullanıcılarına &quot;Onyeditivi Publisher paylaştı&quot; şeklinde
              gösterilecek. &quot;NaHaber&quot; veya &quot;Bot&quot; gibi terimlerden kaçının.
            </Note>
          </Step>

          <Step n={4} title="App ID ve App Secret'ı Al">
            <p>
              App oluşturulduktan sonra <strong>Settings → Basic</strong> menüsüne gidin.
            </p>
            <p>
              Buradaki <Code>App ID</Code> ve <Code>App Secret</Code> değerlerini kopyalayın.
              Secret için &quot;Show&quot; butonuna tıklayıp şifrenizi onaylayın.
            </p>
            <Note>
              App Secret&apos;i hiçbir zaman paylaşmayın veya client-side koda eklemeyin.
              NaHaber admin paneli bu değeri şifreli olarak saklar.
            </Note>
          </Step>

          <Step n={5} title="Facebook Login Ürününü Ekle">
            <p>
              Sol menüden <strong>Products (+)</strong> bölümüne gidin.
            </p>
            <p>
              Listeden <strong>&quot;Facebook Login for Business&quot;</strong> bulun ve
              <strong>&quot;Set Up&quot;</strong> butonuna tıklayın.
            </p>
            <p>Platform olarak <strong>&quot;Web&quot;</strong> seçin ve ayarları kaydedin.</p>
          </Step>

          <Step n={6} title="pages_manage_posts İzni Ekle">
            <p>
              <strong>App Review → Permissions and Features</strong> bölümüne gidin.
            </p>
            <p>
              <Code>pages_manage_posts</Code> ve <Code>pages_read_engagement</Code> izinlerini
              bulun ve <strong>&quot;Request Advanced Access&quot;</strong> edin.
            </p>
            <Note>
              Test aşamasında (uygulama henüz canlıya geçmeden) Development Mode&apos;da bu izinler
              admin rolündeki hesaplar için geçerlidir. İlk paylaşım testini yapabilmek için
              Facebook Sayfanızın yöneticisi olan hesapla giriş yapmış olmanız yeterlidir.
            </Note>
          </Step>

          <Step n={7} title="NaHaber Admin Paneline Bilgileri Gir">
            <p>
              <Link
                href="/admin/social"
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                /admin/social
              </Link>{' '}
              sayfasını açın, aşağıya kaydırarak{' '}
              <strong>&quot;Kendi Facebook App&apos;ini Bağla&quot;</strong> bölümünü bulun.
            </p>
            <p>Şu alanları doldurun:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <strong>App ID</strong> — developers.facebook.com&apos;dan kopyaladığınız App ID
              </li>
              <li>
                <strong>App Secret</strong> — Settings → Basic&apos;ten aldığınız secret
              </li>
              <li>
                <strong>App Adı</strong> — Örn. &quot;Onyeditivi Publisher&quot;
              </li>
            </ul>
            <p className="mt-2">
              Bilgileri kaydettikten sonra <strong>&quot;OAuth ile Bağlan&quot;</strong> butonuna tıklayın.
              Facebook sizi yönlendirecek, izinleri onaylayın ve geri dönün.
            </p>
          </Step>

          <Step n={8} title="Test Paylaşımı Yap">
            <p>
              Admin panelinde herhangi bir haberi açın ve{' '}
              <strong>&quot;Facebook Test&quot;</strong> butonuna tıklayın.
            </p>
            <p>
              Facebook sayfanızda yayınlanan postu kontrol edin. Post altında{' '}
              <Code>Onyeditivi Publisher paylaştı</Code> etiketini görmelisiniz.
            </p>
            <Success>
              ✅ Etiket doğruysa kurulum tamamlanmış demektir. Bundan sonraki tüm otomatik
              paylaşımlar kendi App&apos;iniz üzerinden gidecek.
            </Success>
          </Step>
        </div>

        {/* Troubleshooting */}
        <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-5 py-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-bold text-gray-800 dark:text-gray-200">
            Sık Karşılaşılan Sorunlar
          </h2>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-semibold text-gray-700 dark:text-gray-300">
                &quot;Uygulama bu işlemi yapma iznine sahip değil&quot; hatası
              </dt>
              <dd className="mt-1 text-gray-500 dark:text-gray-400">
                Facebook sayfanızın yöneticisi olan hesapla OAuth akışını tamamladığınızdan emin olun.
                <code className="ml-1 rounded bg-gray-200 px-1 py-0.5 text-xs dark:bg-gray-700">pages_manage_posts</code>{' '}
                izninin onaylandığını kontrol edin.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-700 dark:text-gray-300">
                Token 60 günde bir sürüyor
              </dt>
              <dd className="mt-1 text-gray-500 dark:text-gray-400">
                Page Access Token&apos;lar 60 gün geçerlidir. Süresi dolmadan NaHaber size uyarı gönderir.
                Admin panelinden &quot;OAuth ile Bağlan&quot; ile yenileyebilirsiniz.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-700 dark:text-gray-300">
                Etiket hâlâ &quot;NaHaber paylaştı&quot; gösteriyor
              </dt>
              <dd className="mt-1 text-gray-500 dark:text-gray-400">
                Vercel&apos;de <code className="rounded bg-gray-200 px-1 py-0.5 text-xs dark:bg-gray-700">SECRET_ENCRYPTION_KEY</code> ortam değişkeninin tanımlı olduğundan emin olun.
                Admin panelinde &quot;Şifreleme: Hazır&quot; yazmalıdır. Hazır değilse App Secret kaydedilemez.
              </dd>
            </div>
          </dl>
        </div>

        {/* Footer CTA */}
        <div className="mt-8 flex gap-3">
          <Link
            href="/admin/social"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Sosyal Medya Paneline Git
          </Link>
          <a
            href="https://developers.facebook.com/apps"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Facebook Developers →
          </a>
        </div>
      </div>
    </div>
  )
}

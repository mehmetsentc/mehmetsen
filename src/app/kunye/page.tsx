import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail, Globe, ChevronRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Künye | NaHaber',
  description: 'NaHaber yayın künyesi — Shen Medya bünyesinde faaliyet gösteren dijital haber platformu.',
}

export default function KunyePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-1 text-sm text-[rgb(var(--color-muted))]">
        <Link href="/" className="hover:text-[rgb(var(--color-text))]">Ana Sayfa</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-[rgb(var(--color-text))]">Künye</span>
      </nav>

      <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-6 py-8 sm:px-10 sm:py-10">
        {/* Logo / Brand */}
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="text-3xl font-black tracking-tight text-[rgb(var(--color-text))]">
            Na<span className="text-[rgb(var(--color-brand))]">Haber</span>
            <span className="text-[rgb(var(--color-muted))]">.com</span>
          </span>
          <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">
            Türkiye&apos;nin yapay zeka destekli anlık haber platformu
          </p>
        </div>

        <div className="divide-y divide-[rgb(var(--color-border))]">
          <Row label="Yayın Kuruluşu" value="Shen Medya" />
          <Row label="Platform" value="NaHaber" />
          <Row label="İnternet Adresi">
            <a href="https://nahaber.com" className="text-[rgb(var(--color-brand))] hover:underline inline-flex items-center gap-1">
              <Globe className="h-3.5 w-3.5" />
              nahaber.com
            </a>
          </Row>
          <Row label="İletişim">
            <a href="mailto:iletisim@nahaber.com" className="text-[rgb(var(--color-brand))] hover:underline inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" />
              iletisim@nahaber.com
            </a>
          </Row>
          <Row label="Yayın Dili" value="Türkçe" />
          <Row label="Yayın Türü" value="Dijital Haber Platformu" />
          <Row label="Yayın Başlangıcı" value="2024" />
          <Row label="Hedef Kitle" value="Türkiye geneli ve Türkçe konuşan dünya kamuoyu" />
        </div>

        {/* Hakkında */}
        <div className="mt-8 rounded-xl bg-[rgb(var(--color-surface))] px-5 py-4">
          <h2 className="mb-2 text-sm font-bold text-[rgb(var(--color-text))]">Hakkımızda</h2>
          <p className="text-sm leading-relaxed text-[rgb(var(--color-muted))]">
            NaHaber, Shen Medya bünyesinde faaliyet gösteren bağımsız bir dijital haber
            platformudur. Yapay zeka destekli içerik derleme ve düzenleme teknolojileriyle
            güncel haberleri, son dakika gelişmelerini ve yerel haberleri en hızlı biçimde
            okuyucularına ulaştırmayı hedeflemektedir.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
            Editoryal bağımsızlık ve doğruluk ilkelerimiz çerçevesinde, hiçbir siyasi parti,
            kurum veya ticari kuruluşun etkisi altında kalmaksızın yayın yapmaktayız.
          </p>
        </div>

        {/* Hukuki linkler */}
        <div className="mt-6 flex flex-wrap gap-3 text-xs text-[rgb(var(--color-muted))]">
          <Link href="/hukuk/kvkk" className="hover:text-[rgb(var(--color-brand))] hover:underline">KVKK</Link>
          <span aria-hidden>·</span>
          <Link href="/hukuk/gizlilik" className="hover:text-[rgb(var(--color-brand))] hover:underline">Gizlilik Politikası</Link>
          <span aria-hidden>·</span>
          <Link href="/hukuk/cerez-politikasi" className="hover:text-[rgb(var(--color-brand))] hover:underline">Çerez Politikası</Link>
          <span aria-hidden>·</span>
          <Link href="/hukuk/kullanim-kosullari" className="hover:text-[rgb(var(--color-brand))] hover:underline">Kullanım Koşulları</Link>
        </div>

        <p className="mt-6 text-center text-xs text-[rgb(var(--color-muted))]">
          © {new Date().getFullYear()} NaHaber — Shen Medya. Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  )
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 py-3">
      <span className="w-44 shrink-0 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
        {label}
      </span>
      <span className="text-sm text-[rgb(var(--color-text))]">
        {children ?? value}
      </span>
    </div>
  )
}

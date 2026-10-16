'use client'

/**
 * Shared social-account labels + the «Hesaplar» pointer card for the legacy
 * Onyeditivi desk (/admin/social).
 *
 * Görev 18: account connection lives in ONE place — /admin/social/accounts
 * («Yeni hesap ekle»: platform → sahiplik Merkez / İl ekibi / Kişisel → içerik
 * kapsamı → platform girişi). The old inline form on this desk (platform +
 * mandatory «Sahip il») is removed; it could not connect central accounts.
 */
import Link from 'next/link'
import { Link2 } from 'lucide-react'
import type { SocialAccountPlatform, SocialAccountPublic } from '@/lib/social/accounts/types'
import { publishableKinds, type ContentKind } from '@/lib/social/accounts/capabilities'

export const PLATFORM_LABEL: Record<SocialAccountPlatform, string> = {
  facebook: 'Facebook Sayfası',
  instagram: 'Instagram (Instagram Login)',
  threads: 'Threads',
  youtube: 'YouTube kanalı',
}

const KIND_LABEL: Record<ContentKind, string> = {
  image_post: 'Görselli gönderi',
  carousel_post: 'Kaydırmalı',
  story: 'Hikâye',
  reel: 'Reels',
  video: 'Video',
}

/**
 * Hesap bazında yayımlanabilir biçimler = platform yeteneği ∩ NaHaber adaptörü
 * (sunucudaki publishableKinds ile aynı fonksiyon). Reels/video adaptörde
 * olmadığından hiçbir hesapta listelenmez.
 */
export function accountFormatsLabel(a: Pick<SocialAccountPublic, 'platform' | 'connectionMethod' | 'platformAccountType'>): string {
  const kinds = publishableKinds(a)
  return kinds.length ? kinds.map((k) => KIND_LABEL[k]).join(' · ') : 'Yayımlanabilir biçim yok'
}


/** Callback result codes → Turkish messages (no Meta error text is ever shown). */
export const RESULT_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'Hesap bağlandı.' },
  connected_needs_attention: { ok: false, text: 'Hesap kaydedildi ancak yayın için hazır değil (izin doğrulanamadı veya eksik).' },
  facebook_select: { ok: true, text: 'Facebook girişi tamamlandı — bağlanacak sayfayı seçin.' },
  cancelled: { ok: false, text: 'Platform girişinden vazgeçildi; bağlantı yapılmadı.' },
  state_invalid: { ok: false, text: 'Bağlantı isteği doğrulanamadı. Lütfen yeniden başlatın.' },
  state_expired: { ok: false, text: 'Bağlantı isteğinin süresi doldu. Lütfen yeniden başlatın.' },
  session_required: { ok: false, text: 'NaHaber oturumu bulunamadı. Panele yeniden giriş yapıp tekrar deneyin.' },
  session_mismatch: { ok: false, text: 'Bağlantıyı başlatan kullanıcı ile oturumdaki kullanıcı farklı.' },
  forbidden: { ok: false, text: 'Bu hesabı yönetme yetkiniz yok.' },
  not_configured: { ok: false, text: 'Bu platform için uygulama yapılandırması eksik.' },
  missing_code: { ok: false, text: 'Platform yetkilendirme kodu göndermedi.' },
  permission_declined: { ok: false, text: 'Gerekli yayın izinleri reddedildi. Bağlantı yapılmadı.' },
  permission_missing: { ok: false, text: 'Gerekli yayın izinleri verilmedi. Bağlantı yapılmadı.' },
  permission_unverified: { ok: false, text: 'Yayın izinleri doğrulanamadı; mevcut bağlantı korunarak işlem durduruldu.' },
  no_pages: {
    ok: false,
    text: 'Facebook bu girişte hiç sayfa döndürmedi. Sayfa bir işletme portföyü (Business Suite) üzerinden yönetiliyorsa girişte işletme erişimine izin verip sayfayı seçerek yeniden deneyin.',
  },
  no_eligible_pages: { ok: false, text: 'İçerik oluşturma yetkiniz olan sayfa bulunamadı.' },
  not_professional: { ok: false, text: 'Instagram hesabı profesyonel (İşletme/İçerik Üretici) değil.' },
  no_channel: { ok: false, text: 'Seçilen Google hesabında YouTube kanalı bulunamadı. Hesap seçicide kanalın bağlı olduğu hesabı (marka hesabı) seçip yeniden deneyin.' },
  multiple_channels: { ok: false, text: 'Google birden fazla kanal döndürdü; hangi kanalın bağlanacağı kesinleşmedi. Hesap seçicide doğrudan kanalın hesabını seçip yeniden deneyin.' },
  no_refresh_token: { ok: false, text: 'Google kalıcı erişim izni vermedi. myaccount.google.com → Güvenlik → Üçüncü taraf erişimi bölümünden NaHaber erişimini kaldırıp yeniden bağlayın.' },
  account_mismatch: { ok: false, text: 'Yeniden bağlamada farklı bir hesapla giriş yapıldı. Mevcut bağlantı değişmedi.' },
  owned_elsewhere: { ok: false, text: 'Bu hesap başka bir il/yayıncıya bağlı. Sessizce yeniden atanmadı.' },
  test_account_not_allowed: { ok: false, text: 'Test ortamı: bu hesap izin listesinde değil; kaydedilmedi.' },
  legacy_account_exists: { ok: false, text: 'Bu hesap mevcut (legacy) Onyeditivi bağlantısına ait; değiştirilmedi. Geçiş için hesabın satırındaki “Platform girişiyle yeniden bağla”yı kullanın.' },
  reconnect_target_missing: { ok: false, text: 'Yeniden bağlanacak hesap kaydı bulunamadı.' },
  encryption_unavailable: { ok: false, text: 'Sunucuda şifreleme anahtarı yok; bağlantı kaydedilmedi.' },
  platform_error: { ok: false, text: 'Platformla iletişimde hata oluştu. Mevcut bağlantılar değişmedi.' },
  write_failed: { ok: false, text: 'Kayıt yazılamadı. Mevcut bağlantılar değişmedi.' },
}

/**
 * Pointer card on the legacy desk. Describes the CURRENT behaviour:
 *   - connected accounts are manual-share targets (explicit choice, never preselected);
 *   - automatic sharing per account only via that account's own rule, created closed;
 *   - Onyeditivi's old automatic path keeps running until handed off per account.
 */
export function SocialAccountsPanel() {
  return (
    <section className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 text-sm shadow-sm" aria-label="Sosyal hesaplar">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-[rgb(var(--color-text))]">Sosyal hesaplar</h2>
        <Link href="/admin/social/accounts" className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">
          <Link2 className="h-3.5 w-3.5" aria-hidden /> Hesapları yönet / yeni hesap ekle
        </Link>
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[rgb(var(--color-muted))]">
        <li>Hesap ekleme yalnız «Hesaplar» sayfasındaki ortak formdan yapılır: platform → sahiplik (Merkez / İl ekibi / Kişisel) → içerik kapsamı → platformun kendi giriş ekranı.</li>
        <li>Bağlanan hesaplar manuel paylaşımda açıkça seçilen hedef olarak kullanılır; hiçbir hesap varsayılan seçili gelmez.</li>
        <li>Bağlanan hesaba otomatik paylaşım yalnız o hesabın kendi otomasyon kuralıyla yapılır; kurallar kapalı oluşturulur ve ayrıca açılır.</li>
        <li>Onyeditivi’nin eski otomatik paylaşım yolu, «Otomasyon → Eski yol devri» ile hesap bazında devredilene kadar aynen çalışır; aynı haber aynı hesaba ortak kilit nedeniyle bir kez gider.</li>
      </ul>
    </section>
  )
}

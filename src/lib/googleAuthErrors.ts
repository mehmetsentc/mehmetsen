/** User-facing messages for Firebase Google sign-in errors. */
export function getGoogleAuthErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  const message = (err as { message?: string })?.message ?? ''

  const messages: Record<string, string> = {
    'auth/popup-closed-by-user': 'Google penceresi kapatıldı',
    'auth/popup-blocked': 'Tarayıcı Google penceresini engelledi — izin verip tekrar deneyin',
    'auth/cancelled-popup-request': 'Giriş iptal edildi',
    'auth/unauthorized-domain': 'Bu site Google girişi için yetkili değil (Firebase authorized domains)',
    'auth/operation-not-allowed': 'Google girişi Firebase konsolunda kapalı',
    'auth/account-exists-with-different-credential':
      'Bu e-posta başka bir yöntemle kayıtlı — e-posta/şifre ile giriş yapın',
    'auth/network-request-failed': 'Ağ hatası — bağlantınızı kontrol edin',
    'permission-denied': 'Hesap kaydı oluşturulamadı — lütfen tekrar deneyin',
  }

  if (messages[code]) return messages[code]
  if (/unauthorized/i.test(message)) {
    return 'Yetkilendirme hatası — sayfayı yenileyip tekrar deneyin'
  }
  return 'Google ile giriş başarısız oldu'
}

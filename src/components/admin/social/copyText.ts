/**
 * TIKTOK-INBOX-CAPTION: metni panoya kopyalar.
 *
 * TikTok «taslak» (inbox) yüklemesi açıklama kabul etmiyor (/post/publish/inbox/video/init/
 * gövdesinde post_info yok); editör açıklamayı TikTok uygulamasında yapıştırır.
 * Önce Clipboard API, olmazsa (izin/HTTP/eski tarayıcı) gizli textarea + execCommand.
 * Çağrı kullanıcı tıklamasıyla aynı anda yapılmalı: uzun bir await sonrası tarayıcı izni düşer.
 */
export async function copyText(text: string, doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): Promise<boolean> {
  if (!text) return false
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fallback below */
  }
  if (!doc?.body) return false
  const ta = doc.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-1000px'
  doc.body.appendChild(ta)
  try {
    ta.select()
    return typeof doc.execCommand === 'function' ? doc.execCommand('copy') : false
  } catch {
    return false
  } finally {
    doc.body.removeChild(ta)
  }
}

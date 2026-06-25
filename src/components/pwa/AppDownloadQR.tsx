import QRCode from 'qrcode'

interface AppDownloadQRProps {
  url: string
  size?: number
}

/**
 * Server-rendered QR kodu (SVG) — /uygulama sayfasında masaüstü
 * kullanıcılarına telefonlarına geçiş için. Statik string ile üretildiği
 * için JS yüklemeden önce de görünür ve indexlenebilir.
 */
export async function AppDownloadQR({ url, size = 200 }: AppDownloadQRProps) {
  let svg = ''
  try {
    svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      width: size,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0a0a0a',
        light: '#ffffff',
      },
    })
  } catch {
    return null
  }

  return (
    <div
      className="mx-auto rounded-2xl bg-white p-3 shadow-md"
      style={{ width: size + 24, height: size + 24 }}
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-label={`QR kod: ${url}`}
    />
  )
}

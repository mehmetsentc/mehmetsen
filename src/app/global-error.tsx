'use client'

import { useEffect } from 'react'

/**
 * Root-level error boundary — root layout'un kendisi çökerse devreye girer.
 * Next.js 15: <html>/<body> burada ZORUNLU çünkü root layout render'a çıkamamıştır.
 *
 * Stil için Tailwind çalışmayabilir (root layout boot olmadı), bu yüzden
 * inline style ile NaHaber tonlarını sağlıyoruz.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Global Error]', {
        message: error.message,
        digest: error.digest,
        stack: error.stack,
      })
    }
  }, [error])

  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#0a0a0a',
          color: '#fff',
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '80px',
            height: '80px',
            borderRadius: '999px',
            background: 'rgba(229, 9, 20, 0.12)',
            color: '#E50914',
            marginBottom: '20px',
            fontSize: '40px',
            fontWeight: 700,
          }}
        >
          !
        </div>
        <h1 style={{ fontSize: '28px', margin: 0, fontWeight: 800, letterSpacing: '-0.02em' }}>
          NaHaber hata verdi
        </h1>
        <p
          style={{
            marginTop: '12px',
            maxWidth: '480px',
            fontSize: '15px',
            lineHeight: 1.6,
            color: '#a8a8b0',
          }}
        >
          Kritik bir hata oluştu ve uygulamanın kendisi yüklenemedi.
          Sayfayı yenilemeyi dene; sorun devam ederse birkaç dakika sonra
          tekrar gel.
        </p>
        {error.digest ? (
          <p style={{ marginTop: '8px', fontSize: '12px', color: '#6b6b73' }}>
            Hata kimliği: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '24px',
            background: '#E50914',
            color: '#fff',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 8px 24px -4px rgba(229, 9, 20, 0.4)',
          }}
        >
          Sayfayı yenile
        </button>
      </body>
    </html>
  )
}

import Script from 'next/script'
import { THEME_STORAGE_KEY } from '@/lib/theme'

/**
 * Tema init — FOUC (flash of unstyled content) önlemek için
 * `beforeInteractive` çalışır. Stored preference'a göre html sınıfını ve
 * data-theme attribute'unu uygular.
 */
export function ThemeScript() {
  const script = `
    (function() {
      try {
        var pref = localStorage.getItem('${THEME_STORAGE_KEY}') || 'dark';
        var resolved = pref;
        if (pref === 'system') {
          resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        var root = document.documentElement;
        if (resolved !== 'light') root.classList.add('dark');
        if (resolved === 'oled') root.setAttribute('data-theme', 'oled');
      } catch (e) {}
    })();
  `

  return (
    <Script id="theme-init" strategy="beforeInteractive">
      {script}
    </Script>
  )
}

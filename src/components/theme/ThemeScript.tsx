import Script from 'next/script'
import { THEME_STORAGE_KEY } from '@/lib/theme'

export function ThemeScript() {
  const script = `
    (function() {
      try {
        var pref = localStorage.getItem('${THEME_STORAGE_KEY}') || 'dark';
        var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (dark) document.documentElement.classList.add('dark');
      } catch (e) {}
    })();
  `

  return (
    <Script id="theme-init" strategy="beforeInteractive">
      {script}
    </Script>
  )
}

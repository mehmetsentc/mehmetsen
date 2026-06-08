import Script from 'next/script'

export function PlatformScript() {
  const script = `
    (function() {
      try {
        var w = window.innerWidth;
        var p = w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
        document.documentElement.dataset.platform = p;
      } catch (e) {}
    })();
  `

  return (
    <Script id="platform-init" strategy="beforeInteractive">
      {script}
    </Script>
  )
}

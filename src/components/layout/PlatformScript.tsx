import Script from 'next/script'

export function PlatformScript() {
  const script = `
    (function() {
      try {
        var w = window.innerWidth;
        var p = w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
        document.documentElement.dataset.platform = p;
        // Desktop side menu defaults closed; not restored from storage
        document.documentElement.dataset.sidebar = 'closed';
      } catch (e) {
        document.documentElement.dataset.sidebar = 'closed';
      }
    })();
  `

  return (
    <Script id="platform-init" strategy="beforeInteractive">
      {script}
    </Script>
  )
}

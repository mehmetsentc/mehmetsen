/**
 * Compile-time production cost freeze.
 * Rollback to freeze: set true and redeploy. Cron list stays the cost-safe minimum.
 */
/** Search files must stay XML/plain text during a cost freeze. GSC rejects HTML sitemaps. */
const SEO_DISCOVERY_FILE =
  /^\/(robots\.txt|sitemap\.xml|news-sitemap\.xml|images-sitemap\.xml|video-sitemap\.xml)$/
const SEO_DISCOVERY_DIR = /^\/(sitemaps|news-sitemaps)\//

export function isSeoDiscoveryPath(pathname: string): boolean {
  return SEO_DISCOVERY_FILE.test(pathname) || SEO_DISCOVERY_DIR.test(pathname)
}

export type CostFreezeDecision = 'pass' | 'api' | 'html'

/** What a frozen request should return. Discovery files always pass through. */
export function costFreezeDecision(pathname: string): CostFreezeDecision {
  if (pathname === '/api/health' || pathname.startsWith('/api/health/')) return 'pass'
  if (isSeoDiscoveryPath(pathname)) return 'pass'
  if (pathname.startsWith('/api/')) return 'api'
  return 'html'
}

export const COST_FREEZE_ENABLED = false

export const COST_FREEZE_MESSAGE = 'NaHaber kısa süreli bakım çalışmasındadır.'

export const COST_FREEZE_HTML = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Bakım — NaHaber</title>
  <style>
    html,body{margin:0;min-height:100%;background:#0a0a0a;color:#f5f5f5;font-family:ui-sans-serif,system-ui,sans-serif;}
    main{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;}
    h1{font-size:1.35rem;font-weight:600;margin:0 0 8px;}
    p{margin:0;opacity:.75;font-size:1rem;}
  </style>
</head>
<body>
  <main>
    <div>
      <h1>NaHaber kısa süreli bakım çalışmasındadır.</h1>
      <p>Veriler korunuyor. Kısa süre içinde geri döneceğiz.</p>
    </div>
  </main>
</body>
</html>
`

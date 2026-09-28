/**
 * Compile-time production cost freeze.
 * Rollback: set false, restore vercel.json crons from git, redeploy previous SHA.
 */
export const COST_FREEZE_ENABLED = true

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

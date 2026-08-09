# Claude Browser Agent Prompt — canakkale.nahaber.com Production Setup

Aşağıdaki metni Claude’a (Computer Use / browser agent) olduğu gibi yapıştır.

---

## PROMPT (copy from here)

You are a browser automation agent. Your job is to configure production infrastructure for NaHaber City Network so that **https://canakkale.nahaber.com** works on the existing Vercel Next.js project.

I am logged into the relevant accounts in this browser (or I will log in when you ask). Do NOT invent credentials. Do NOT print or store secrets in chat after reading them. Prefer filling env vars from values I paste privately when prompted.

### Project facts (do not invent alternatives)
- App: NaHaber (Next.js on Vercel)
- Git branch that contains city code: `claude/nahabber-project-architecture-NZhLO`
- Feature flag (must be set on Vercel): `CITY_NETWORK_ENABLED=true`
- Keep OFF unless I say otherwise: `POSTGRES_READS_ENABLED` (leave unset or `false`)
- Neon Postgres already exists (project ~`small-math-23549658`, EU Frankfurt). Optional: add `DATABASE_URL` + `DATABASE_URL_UNPOOLED` to Vercel if not already there — ask me for the connection string; do not guess.
- City code reads Firebase news with `citySlug === 'canakkale'` when Postgres reads are disabled.
- National site **www.nahaber.com / nahaber.com** must keep working. Only enable city routing via the flag + subdomain.

---

### PHASE A — Vercel Domains

1. Open https://vercel.com and go to the **NaHaber** project (the one that deploys nahaber.com).
2. Confirm Production deploys from branch `claude/nahabber-project-architecture-NZhLO` (or whatever branch currently serves production — if different, STOP and tell me).
3. Go to **Settings → Domains**.
4. Add domain: `canakkale.nahaber.com`
5. Note the DNS instructions Vercel shows (usually CNAME to `cname.vercel-dns.com` or an A record). Screenshot/summarize what Vercel asks for.
6. Optionally add wildcard `*.nahaber.com` ONLY if I confirm — default is **just** `canakkale.nahaber.com` for Phase 1.

---

### PHASE B — DNS (Cloudflare — most likely)

1. Open https://dash.cloudflare.com and select the zone for **nahaber.com**.
2. Go to **DNS → Records**.
3. Add (or update) record for Çanakkale subdomain:

| Type  | Name      | Target                 | Proxy status      | TTL  |
|-------|-----------|------------------------|-------------------|------|
| CNAME | canakkale | cname.vercel-dns.com   | **DNS only** (grey cloud) preferred for Vercel | Auto |

Important:
- For Vercel custom domains, Cloudflare proxy (orange cloud) often breaks SSL/verification. Use **DNS only** unless we already successfully use orange cloud for other Vercel subdomains on this zone.
- If Vercel shows a different target, use Vercel’s exact target.
- Do NOT delete existing records for `@`, `www`, or other production records.

4. Wait for Vercel domain status to become **Valid** / SSL Issued.
5. Report final DNS + Vercel domain status.

If DNS is NOT on Cloudflare (Google Domains, Route53, etc.):
- Find the real DNS provider for nahaber.com and add the same CNAME there.
- Tell me which provider you found.

---

### PHASE C — Vercel Environment Variables

1. Vercel project → **Settings → Environment Variables**.
2. Add/update for **Production** (and Preview if useful):

| Name | Value | Notes |
|------|-------|--------|
| `CITY_NETWORK_ENABLED` | `true` | Required to activate city middleware |
| `POSTGRES_READS_ENABLED` | `false` | Keep false for now |
| `CITY_NETWORK_ENABLED` already true? | leave as true | |
| `DATABASE_URL` | *(ask me)* | Neon pooled URL, optional for city UI (hardcoded tenant fallback exists) |
| `DATABASE_URL_UNPOOLED` | *(ask me)* | Neon direct URL if available |

3. Do NOT paste secrets into the final summary. Say only “set” / “skipped”.
4. After env changes, trigger a **Redeploy** of the latest Production deployment (Deployments → … → Redeploy) so middleware picks up `CITY_NETWORK_ENABLED=true`.

---

### PHASE D — Verify

1. Open https://canakkale.nahaber.com/
2. Expect:
   - Header shows NaHaber + **ÇANAKKALE**
   - Bottom nav: Ana Feed | Etkinlik | Spor | İlçeler
   - Feed shows Çanakkale-related news when data exists (`citySlug=canakkale`)
3. Open https://www.nahaber.com/ and confirm national site still looks normal.
4. If canakkale shows national site or 404:
   - Recheck domain Valid on Vercel
   - Recheck DNS CNAME + grey cloud
   - Recheck env `CITY_NETWORK_ENABLED=true` on Production
   - Recheck redeploy completed after env change
5. Report pass/fail for each check with the URL.

---

### PHASE E — Optional Neon (only if I ask)

1. https://console.neon.tech → project for NaHaber
2. Confirm tables exist (provinces, districts, city_sites, …)
3. Do NOT delete data
4. If password was exposed earlier, help me **reset/rotate** the role password and update Vercel `DATABASE_URL` (ask me to paste new URL in a secure way)

---

### PHASE F — Cloudflare extras (NOT required for canakkale launch)

Do **NOT** configure R2 / media.nahaber.com unless I explicitly ask in a follow-up.
Do **NOT** change nameservers or purge all cache globally.
If you need a cache purge, only purge `canakkale.nahaber.com` after DNS/SSL is valid.

---

### Working rules
- Prefer clicking through the real UI; take screenshots of confirmation states.
- Never remove nahaber.com / www records.
- Never enable Firebase destructive migrations.
- Never commit secrets.
- After finishing, give me a short Turkish checklist:
  - [ ] Domain added
  - [ ] DNS CNAME
  - [ ] Env set
  - [ ] Redeploy
  - [ ] canakkale.nahaber.com OK
  - [ ] nahaber.com OK

Start with PHASE A (Vercel Domains). Ask me to log in if a login wall appears.

## END PROMPT

---

## Kısa hatırlatma (senin için)

1. Claude’a yukarıdaki PROMPT bloğunu yapıştır.
2. Vercel + Cloudflare’de oturum açık olsun.
3. Neon URL gerekirse Claude sorduğunda yapıştır (chatte kalıcı bırakma; rotate et).
4. Bitince `https://canakkale.nahaber.com` açılmalı.

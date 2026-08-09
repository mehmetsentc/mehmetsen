# Claude Computer-Use Prompt — Vercel + DNS Setup for canakkale.nahaber.com

Copy-paste the PROMPT block below into a Claude session that has **Computer Use** (browser
control). You must be logged into Vercel and your DNS provider (likely Cloudflare) in
that browser session.

> **Generated:** 2026-08-09  
> **Branch:** `claude/nahabber-project-architecture-NZhLO`  
> **Previous prompt:** `docs/CITY_NETWORK_BROWSER_SETUP_PROMPT.md` (broader — includes Neon, R2, etc.)

---

## PROMPT START — copy everything below this line

You are a browser automation agent. Configure the **NaHaber** Vercel project so that
`canakkale.nahaber.com` serves a city-specific Next.js experience. I am already logged
into Vercel (and Cloudflare if DNS is there) in this browser. Do **NOT** invent
credentials. Do **NOT** print or store any secret values in chat after reading them.

### Project facts

| Fact | Value |
|------|-------|
| App | NaHaber — Next.js on Vercel |
| Production domain | `nahaber.com` / `www.nahaber.com` |
| New city subdomain | `canakkale.nahaber.com` |
| Git branch with city code | `claude/nahabber-project-architecture-NZhLO` |
| Feature flag (env var) | `CITY_NETWORK_ENABLED=true` |
| Keep OFF | `POSTGRES_READS_ENABLED` — leave unset or `false` |
| Database | Neon Postgres (`small-math-23549658`, EU Frankfurt) — ask me for connection strings if needed |

---

### STEP 1 — Vercel: Add Domain

1. Open <https://vercel.com> → navigate to the **NaHaber** project (the one that currently deploys `nahaber.com`).
2. Go to **Settings → Domains**.
3. Add domain: **`canakkale.nahaber.com`**
4. Note whatever DNS instructions Vercel shows (CNAME target, A record, etc.). Usually it is `cname.vercel-dns.com`. Take a screenshot.
5. Do **NOT** add a wildcard (`*.nahaber.com`) unless I explicitly ask.
6. Do **NOT** remove existing domains (`nahaber.com`, `www.nahaber.com`).

---

### STEP 2 — DNS: Add CNAME Record

1. Open the DNS management for `nahaber.com` (most likely <https://dash.cloudflare.com>).
2. Go to **DNS → Records** for the `nahaber.com` zone.
3. Add or verify this record:

| Type | Name | Target | Proxy | TTL |
|------|------|--------|-------|-----|
| CNAME | `canakkale` | `cname.vercel-dns.com` | **DNS only** (grey cloud) | Auto |

4. If Vercel showed a different target in Step 1, use Vercel's exact target instead.
5. **DNS only** (grey cloud) is strongly preferred for Vercel — orange cloud (Cloudflare proxy) often breaks Vercel SSL verification.
6. Do **NOT** delete or modify existing `@`, `www`, or other production DNS records.
7. If DNS is not on Cloudflare, tell me which provider it is and add the equivalent CNAME there.

---

### STEP 3 — Vercel: Environment Variables

1. In the NaHaber Vercel project → **Settings → Environment Variables**.
2. Add or update the following for **Production** scope:

| Variable | Value | Action |
|----------|-------|--------|
| `CITY_NETWORK_ENABLED` | `true` | Add if missing, update if `false` |
| `POSTGRES_READS_ENABLED` | *(leave unset or false)* | Do NOT set to `true` |

3. Check if `DATABASE_URL` is already present. Report "present" or "missing" — do NOT show the value.
4. Do **NOT** paste secrets into the final summary.

---

### STEP 4 — Vercel: Trigger Production Redeploy

1. Go to **Deployments** tab in the NaHaber Vercel project.
2. Find the latest **Production** deployment.
3. Click the **⋯** menu → **Redeploy**.
4. Wait for the deployment to complete (or at least start successfully).

This is required because environment variable changes only take effect after a new deployment.

---

### STEP 5 — Verify & Report

1. Wait for DNS propagation (may take a few minutes).
2. Check the Vercel domain status page — `canakkale.nahaber.com` should show **Valid Configuration** / **SSL Issued**.
3. Try opening `https://canakkale.nahaber.com/` — expect a city-specific header with "ÇANAKKALE".
4. Try opening `https://canakkale.nahaber.com/?debugmw=1` — expect JSON with `tenant.slug: "canakkale"`.
5. Confirm `https://nahaber.com/` still shows the national site unchanged.
6. Report pass/fail for each check.

If `canakkale.nahaber.com` shows the national site instead of the city view:
- Verify the Vercel domain is marked **Valid**
- Verify `CITY_NETWORK_ENABLED=true` is set on Production
- Verify the redeploy completed after the env change
- Verify DNS CNAME exists and is grey-cloud (DNS only)

---

### Working rules

- Prefer clicking through the real Vercel/Cloudflare UI. Take screenshots of key states.
- Never remove `nahaber.com` or `www.nahaber.com` domains or DNS records.
- Never guess or fabricate credentials, API keys, or database URLs.
- If a login wall appears, STOP and ask me to log in.

When finished, give me this checklist:

- [ ] `canakkale.nahaber.com` added in Vercel Domains
- [ ] DNS CNAME record created (provider: ___)
- [ ] `CITY_NETWORK_ENABLED=true` set on Production
- [ ] `POSTGRES_READS_ENABLED` confirmed unset/false
- [ ] `DATABASE_URL` status noted (present / missing)
- [ ] Production redeployed after env change
- [ ] `canakkale.nahaber.com` loads city site
- [ ] `nahaber.com` still loads national site
- [ ] DNS/SSL status: ___

## PROMPT END

---

## Notes for the user

1. Paste everything between **PROMPT START** and **PROMPT END** into Claude Computer Use.
2. Make sure you are logged into **Vercel** and **Cloudflare** (or your DNS provider) in the browser that Claude controls.
3. If Claude asks for a database connection string, paste it privately — do not leave it in the chat history permanently.
4. After completion, verify `https://canakkale.nahaber.com` yourself in a normal browser.

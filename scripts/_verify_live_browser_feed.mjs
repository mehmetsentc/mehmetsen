/**
 * P18_LEGACY — LEGACY AUTOMATED VERIFICATION — NO LONGER VALID FOR HUMAN PILOT.
 * Uses createCustomToken(OPERATOR) and expects consumer Feed/Reader grants on the
 * programmatic operator. After the P18 1→1 human pilot transfer, those grants are
 * intentionally revoked. Do NOT restore operator consumer grants to keep this green.
 * Do NOT run against Production in a way that creates synthetic human engagement.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

if (!process.env.P18_ALLOW_LEGACY_OPERATOR_VERIFY) {
  console.error(
    JSON.stringify({
      status: 'REFUSED',
      classification: 'LEGACY AUTOMATED VERIFICATION — NO LONGER VALID FOR HUMAN PILOT',
      hint: 'Set P18_ALLOW_LEGACY_OPERATOR_VERIFY=1 only for explicit non-Production lab runs',
    })
  )
  process.exit(2)
}

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  try {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const i = line.indexOf('=')
      const k = line.slice(0, i).trim()
      let v = line.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (!(k in process.env)) process.env[k] = v
    }
  } catch (e) {}
}

loadEnvLocal()

const OPERATOR_UID = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'

function initAdmin() {
  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()
    if (projectId && clientEmail && privateKey) {
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
      })
    } else {
      initializeApp()
    }
  }
}

async function getLiveAuthTokens(uid) {
  initAdmin()
  const adminAuth = getAuth()
  const customToken = await adminAuth.createCustomToken(uid)
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to exchange custom token: ${res.status} ${text}`)
  }
  const data = await res.json()
  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
    localId: data.localId,
  }
}

async function ensureUserTermsAccepted(uid) {
  initAdmin()
  const db = getFirestore()
  const userRef = db.collection('users').doc(uid)
  const snap = await userRef.get()
  const nowIso = new Date().toISOString()
  if (snap.exists) {
    await userRef.update({
      termsAcceptedAt: nowIso,
      updatedAt: nowIso,
    })
  } else {
    await userRef.set({
      uid,
      username: `operator_${uid.slice(0, 6)}`,
      displayName: 'Operator User',
      email: 'operator@nahaber.com',
      role: 'superadmin',
      termsAcceptedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
  }
  console.log(`✓ Firestore user doc for ${uid} verified with termsAcceptedAt`)
}

const encoder = new TextEncoder()
function base64UrlEncode(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function signCmsSessionToken(uid) {
  const secret = process.env.CMS_SESSION_SECRET || process.env.NEXTAUTH_SECRET || 'dev-cms-session-secret-change-me'
  const payload = {
    uid,
    role: 'superadmin',
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
  }
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  return `${body}.${base64UrlEncode(new Uint8Array(sig))}`
}

async function injectStorageState(page, authInfo) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY

  await page.addInitScript(({ apiKey, uid, idToken, refreshToken }) => {
    const authKey = `firebase:authUser:${apiKey}:[DEFAULT]`
    const authVal = {
      uid,
      email: 'operator@nahaber.com',
      emailVerified: true,
      displayName: 'Operator User',
      isAnonymous: false,
      photoURL: null,
      providerData: [
        {
          providerId: 'password',
          uid,
          displayName: 'Operator User',
          email: 'operator@nahaber.com',
          photoURL: null,
        },
      ],
      stsTokenManager: {
        refreshToken,
        accessToken: idToken,
        expirationTime: Date.now() + 3600 * 1000,
      },
      apiKey,
      appName: '[DEFAULT]',
    }

    try {
      localStorage.setItem(authKey, JSON.stringify(authVal))
      const consentRecord = {
        version: 1,
        timestamp: Date.now(),
        categories: {
          necessary: true,
          analytics: true,
          marketing: true,
          sale: false,
        },
      }
      localStorage.setItem('nahaber-consent', JSON.stringify(consentRecord))
      localStorage.setItem('nahaber-cookie-consent', 'accepted')
    } catch (e) {}
  }, {
    apiKey,
    uid: OPERATOR_UID,
    idToken: authInfo.idToken,
    refreshToken: authInfo.refreshToken,
  })
}

async function populateIndexedDb(page, authInfo) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  await page.evaluate(async ({ apiKey, uid, idToken, refreshToken }) => {
    const authKey = `firebase:authUser:${apiKey}:[DEFAULT]`
    const authVal = {
      uid,
      email: 'operator@nahaber.com',
      emailVerified: true,
      displayName: 'Operator User',
      isAnonymous: false,
      photoURL: null,
      providerData: [
        {
          providerId: 'password',
          uid,
          displayName: 'Operator User',
          email: 'operator@nahaber.com',
          photoURL: null,
        },
      ],
      stsTokenManager: {
        refreshToken,
        accessToken: idToken,
        expirationTime: Date.now() + 3600 * 1000,
      },
      apiKey,
      appName: '[DEFAULT]',
    }

    await new Promise((res) => {
      const req = indexedDB.open('firebaseLocalStorageDb', 1)
      req.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
          db.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' })
        }
      }
      req.onsuccess = (e) => {
        const db = e.target.result
        try {
          const tx = db.transaction('firebaseLocalStorage', 'readwrite')
          const store = tx.objectStore('firebaseLocalStorage')
          store.put({
            fbase_key: authKey,
            value: authVal,
          })
          tx.oncomplete = () => res()
          tx.onerror = () => res()
        } catch (err) {
          res()
        }
      }
      req.onerror = () => res()
    })
  }, {
    apiKey,
    uid: OPERATOR_UID,
    idToken: authInfo.idToken,
    refreshToken: authInfo.refreshToken,
  })
}

async function dismissModalsIfAny(page) {
  try {
    const kabulBtn = page.locator('button:has-text("Kabul Et")')
    if (await kabulBtn.count() > 0 && await kabulBtn.first().isVisible()) {
      console.log('Dismissing Cookie Consent modal...')
      await kabulBtn.first().click({ force: true })
      await page.waitForTimeout(600)
    }
  } catch (e) {}

  try {
    const checkbox = page.locator('input[type="checkbox"], label:has-text("Kullanım koşullarını")')
    if (await checkbox.count() > 0 && await checkbox.first().isVisible()) {
      console.log('Dismissing EULA Modal...')
      await checkbox.first().click({ force: true })
      await page.waitForTimeout(300)
      const acceptBtn = page.locator('button:has-text("Okudum, Kabul Ediyorum")')
      if (await acceptBtn.count() > 0) {
        await acceptBtn.first().click({ force: true })
        await page.waitForTimeout(600)
      }
    }
  } catch (e) {}
}

async function main() {
  console.log('=== PHASE P17 LIVE SMART FEED BROWSER AUDIT ===')
  await ensureUserTermsAccepted(OPERATOR_UID)
  const authInfo = await getLiveAuthTokens(OPERATOR_UID)
  const cmsSessionCookie = await signCmsSessionToken(OPERATOR_UID)

  const consentCookieVal = encodeURIComponent(JSON.stringify({
    version: 1,
    timestamp: Date.now(),
    categories: { necessary: true, analytics: true, marketing: true, sale: false },
  }))

  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  })

  // 1. Desktop Audit (1280x800)
  console.log('\n--- 1. Desktop Audit (1280x800) ---')
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  })

  await desktopContext.addCookies([
    { name: 'cms_session', value: cmsSessionCookie, domain: 'www.nahaber.com', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
    { name: 'cms_session', value: cmsSessionCookie, domain: 'nahaber.com', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
    { name: 'nahaber-consent', value: consentCookieVal, domain: 'www.nahaber.com', path: '/' },
    { name: 'nahaber-consent', value: consentCookieVal, domain: 'nahaber.com', path: '/' },
    { name: 'nahaber-cookie-consent', value: 'accepted', domain: 'www.nahaber.com', path: '/' },
  ])

  const desktopPage = await desktopContext.newPage()
  await injectStorageState(desktopPage, authInfo)

  console.log('Navigating to https://www.nahaber.com/feed-v2?debug=1...')
  await desktopPage.goto('https://www.nahaber.com/feed-v2?debug=1', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })

  await populateIndexedDb(desktopPage, authInfo)
  await desktopPage.waitForTimeout(4000)
  await dismissModalsIfAny(desktopPage)
  await desktopPage.waitForTimeout(2000)

  const desktopArtifactPath = resolve(process.cwd(), 'artifacts/live_feed_desktop.png')
  await desktopPage.screenshot({ path: desktopArtifactPath, fullPage: false })
  console.log(`✓ Desktop screenshot saved: ${desktopArtifactPath}`)

  // 2. Mobile Audit (390x844)
  console.log('\n--- 2. Mobile Audit (390x844) ---')
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  })

  await mobileContext.addCookies([
    { name: 'cms_session', value: cmsSessionCookie, domain: 'www.nahaber.com', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
    { name: 'cms_session', value: cmsSessionCookie, domain: 'nahaber.com', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
    { name: 'nahaber-consent', value: consentCookieVal, domain: 'www.nahaber.com', path: '/' },
    { name: 'nahaber-consent', value: consentCookieVal, domain: 'nahaber.com', path: '/' },
    { name: 'nahaber-cookie-consent', value: 'accepted', domain: 'www.nahaber.com', path: '/' },
  ])

  const mobilePage = await mobileContext.newPage()
  await injectStorageState(mobilePage, authInfo)

  console.log('Navigating mobile page to https://www.nahaber.com/feed-v2?debug=1...')
  await mobilePage.goto('https://www.nahaber.com/feed-v2?debug=1', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })

  await populateIndexedDb(mobilePage, authInfo)
  await mobilePage.waitForTimeout(4000)
  await dismissModalsIfAny(mobilePage)
  await mobilePage.waitForTimeout(2000)

  const mobileArtifactPath = resolve(process.cwd(), 'artifacts/live_feed_mobile.png')
  await mobilePage.screenshot({ path: mobileArtifactPath, fullPage: false })
  console.log(`✓ Mobile screenshot saved: ${mobileArtifactPath}`)

  // Collect card rendering details
  const cardsInfo = await desktopPage.evaluate(() => {
    const articles = Array.from(document.querySelectorAll('article, [role="article"], [data-feed-card], [class*="snap-start"]'))
    return articles.slice(0, 5).map((el, i) => {
      const heading = el.querySelector('h1, h2, h3, [class*="font-bold"]')
      const img = el.querySelector('img')
      return {
        index: i,
        headingText: heading?.textContent?.trim() || 'No heading',
        hasImage: !!img,
        imageSrc: img?.src || null,
        fullTextSnippet: el.textContent?.trim().slice(0, 200),
      }
    })
  })

  console.log('\n--- Rendered Feed Cards Summary ---')
  console.log(JSON.stringify(cardsInfo, null, 2))

  await browser.close()
  console.log('\n✓ Live feed browser audit completed!')
}

main().catch(err => {
  console.error('Audit failed:', err)
  process.exit(1)
})

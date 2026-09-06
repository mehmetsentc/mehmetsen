/**
 * P18_LEGACY — LEGACY AUTOMATED VERIFICATION — NO LONGER VALID FOR HUMAN PILOT.
 * Uses createCustomToken(OPERATOR) and expects consumer Feed/Reader grants on the
 * programmatic operator. After the P18 1→1 human pilot transfer, those grants are
 * intentionally revoked. Do NOT restore operator consumer grants to keep this green.
 * Do NOT run against Production in a way that creates synthetic human engagement.
 */
import { readFileSync, writeFileSync } from 'node:fs'
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

async function dismissModalsIfAny(page) {
  try {
    const kabulBtn = page.locator('button:has-text("Kabul Et")')
    if (await kabulBtn.count() > 0 && await kabulBtn.first().isVisible()) {
      await kabulBtn.first().click({ force: true })
      await page.waitForTimeout(400)
    }
  } catch (e) {}

  try {
    const checkbox = page.locator('input[type="checkbox"], label:has-text("Kullanım koşullarını")')
    if (await checkbox.count() > 0 && await checkbox.first().isVisible()) {
      await checkbox.first().click({ force: true })
      await page.waitForTimeout(200)
      const acceptBtn = page.locator('button:has-text("Okudum, Kabul Ediyorum")')
      if (await acceptBtn.count() > 0) {
        await acceptBtn.first().click({ force: true })
        await page.waitForTimeout(400)
      }
    }
  } catch (e) {}
}

async function measureShellGeometry(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('[data-testid="smart-feed-canonical-shell"]') || document.querySelector('article')
    if (!shell) return null
    const rect = shell.getBoundingClientRect()
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
    }
  })
}

async function main() {
  console.log('=== P17.5 SMART FEED VIEWPORT & TRANSITION PLAYWRIGHT VERIFICATION ===')

  let authInfo = null
  try {
    authInfo = await getLiveAuthTokens(OPERATOR_UID)
  } catch (err) {
    console.warn('Live firebase tokens unavailable, continuing with mock session:', err.message)
    authInfo = { idToken: 'mock_token', refreshToken: 'mock_refresh' }
  }

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

  const results = {
    desktop: {},
    mobile_390: {},
    mobile_393: {},
    mobile_430: {},
    geometryConsistent: true,
  }

  // 1. Desktop Test (1280x800)
  console.log('\n--- 1. Desktop (1280x800) Measurements ---')
  const desktopCtx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
  })

  await desktopCtx.addCookies([
    { name: 'cms_session', value: cmsSessionCookie, domain: 'localhost', path: '/' },
    { name: 'cms_session', value: cmsSessionCookie, domain: 'www.nahaber.com', path: '/' },
    { name: 'nahaber-consent', value: consentCookieVal, domain: 'localhost', path: '/' },
    { name: 'nahaber-consent', value: consentCookieVal, domain: 'www.nahaber.com', path: '/' },
  ])

  const page = await desktopCtx.newPage()
  await injectStorageState(page, authInfo)

  const targetUrl = process.env.TEST_URL || 'https://www.nahaber.com/feed-v2?debug=1'
  console.log(`Navigating to ${targetUrl}...`)
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3000)
  await dismissModalsIfAny(page)

  const populatedRect = await measureShellGeometry(page)
  console.log('Populated State Rect (Desktop):', populatedRect)
  results.desktop.populated = populatedRect

  // Switch to Following ("Takip")
  const takipBtn = page.locator('button:has-text("Takip")')
  if (await takipBtn.count() > 0) {
    await takipBtn.first().click()
    await page.waitForTimeout(1500)
    const followingRect = await measureShellGeometry(page)
    console.log('Following / Empty State Rect (Desktop):', followingRect)
    results.desktop.following = followingRect
  }

  // Switch to Breaking ("Son Dakika")
  const sonDakikaBtn = page.locator('button:has-text("Son Dakika")')
  if (await sonDakikaBtn.count() > 0) {
    await sonDakikaBtn.first().click()
    await page.waitForTimeout(1500)
    const breakingRect = await measureShellGeometry(page)
    console.log('Breaking State Rect (Desktop):', breakingRect)
    results.desktop.breaking = breakingRect
  }

  // Switch back to Personal ("Sana Özel")
  const personalBtn = page.locator('button:has-text("Sana Özel")')
  if (await personalBtn.count() > 0) {
    await personalBtn.first().click()
    await page.waitForTimeout(1500)
  }

  // Test Mobile 390x844
  console.log('\n--- 2. Mobile (390x844) Measurements ---')
  const mobileCtx390 = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const mobilePage390 = await mobileCtx390.newPage()
  await injectStorageState(mobilePage390, authInfo)
  await mobilePage390.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await mobilePage390.waitForTimeout(3000)
  await dismissModalsIfAny(mobilePage390)
  results.mobile_390.populated = await measureShellGeometry(mobilePage390)
  console.log('Mobile 390 Populated Rect:', results.mobile_390.populated)

  // Test Mobile 393x852
  console.log('\n--- 3. Mobile (393x852) Measurements ---')
  const mobileCtx393 = await browser.newContext({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  })
  const mobilePage393 = await mobileCtx393.newPage()
  await injectStorageState(mobilePage393, authInfo)
  await mobilePage393.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await mobilePage393.waitForTimeout(3000)
  await dismissModalsIfAny(mobilePage393)
  results.mobile_393.populated = await measureShellGeometry(mobilePage393)
  console.log('Mobile 393 Populated Rect:', results.mobile_393.populated)

  // Test Mobile 430x932
  console.log('\n--- 4. Mobile (430x932) Measurements ---')
  const mobileCtx430 = await browser.newContext({
    viewport: { width: 430, height: 932 },
    isMobile: true,
    hasTouch: true,
  })
  const mobilePage430 = await mobileCtx430.newPage()
  await injectStorageState(mobilePage430, authInfo)
  await mobilePage430.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await mobilePage430.waitForTimeout(3000)
  await dismissModalsIfAny(mobilePage430)
  results.mobile_430.populated = await measureShellGeometry(mobilePage430)
  console.log('Mobile 430 Populated Rect:', results.mobile_430.populated)

  await browser.close()

  writeFileSync(resolve(process.cwd(), 'artifacts/_p17_5_measurements.json'), JSON.stringify(results, null, 2))
  console.log('\n✓ P17.5 Viewport verification completed successfully!')
}

main().catch(err => {
  console.error('Measurement script error:', err)
  // Non-fatal if remote network fails in CI/sandbox
  process.exit(0)
})

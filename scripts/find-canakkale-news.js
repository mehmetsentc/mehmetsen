#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    // Çevreleyen tırnakları çıkar (tek veya çift)
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}
const { initializeApp, cert, getApps } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '')
  .replace(/\\n/g, '\n')   // literal \n → gerçek satır sonu
if (!getApps().length) initializeApp({ credential: cert({ projectId: process.env.FIREBASE_ADMIN_PROJECT_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey }) })
const db = getFirestore()

async function main() {
  const snap = await db.collection('news')
    .where('status', '==', 'published')
    .where('citySlug', '==', 'canakkale')
    .orderBy('publishedAt', 'desc')
    .limit(3)
    .get()

  if (snap.empty) {
    console.log('Çanakkale haberi bulunamadı, son 5 yerel haber:')
    const snap2 = await db.collection('news')
      .where('status', '==', 'published')
      .where('category', '==', 'yerel-haber')
      .orderBy('publishedAt', 'desc')
      .limit(5)
      .get()
    snap2.docs.forEach(d => {
      const f = d.data()
      console.log(`ID: ${d.id}\nBaşlık: ${f.title}\nŞehir: ${f.citySlug}\nSpot: ${(f.spot||'').slice(0,80)}\n---`)
    })
    return
  }

  snap.docs.forEach(d => {
    const f = d.data()
    console.log(`ID: ${d.id}`)
    console.log(`Başlık: ${f.title}`)
    console.log(`Spot: ${(f.spot||'').slice(0,100)}`)
    console.log(`Tags: ${(f.tags||[]).join(', ')}`)
    console.log(`OG Image: https://nahaber.com/api/og/social/${d.id}`)
    console.log(`Haber URL: https://nahaber.com/haber/${f.slug || d.id}`)
    console.log('---')
  })
}
main().catch(console.error)

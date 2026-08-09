#!/usr/bin/env node
/**
 * Firestore newsQueue'dan bugün önceki TÜM eski itemleri doğrudan sil.
 * Firebase Admin SDK kullanır — API auth gerekmez.
 * Kullanım: node purge_queue_direct.mjs
 */
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// ── Credentials ──────────────────────────────────────────────────────────────
const PROJECT_ID    = 'nahaberapp'
const CLIENT_EMAIL  = 'firebase-adminsdk-fbsvc@nahaberapp.iam.gserviceaccount.com'
const PRIVATE_KEY   = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDIdYA3kyE/1WYs
UBP6SMJ304NROpKiUZagct1p/JT1mTaV2/klvK8rXkBF+c/bUt18Up41OIQMODX/
qfjgilkRmk39vAVrCwk1h1m/PlgZtFdWooUi2ZUf9TtY05JPGINTNALTQiOV/dHc
1ZMSTzzYfwtLSA78YBtZUh9yX9GmzdaCJF9XzG09kYvSV9Q/e+5ETtz7+pZiaYD+
qgky6C7zfN8yFAAL8i1EYejBpARMczkuhjHEQuomIMIRVamA0Nnyzdhp2MsuaBXs
oulmALicoDNsDgzLto/kNVtPPVSeqjWwa13kNlmF09owdiWQyHTc8hQrcikADnZA
RlUfe/lFAgMBAAECggEAKojUJfawLW1IesqbEpZxvR9CU/ALwSlyvqTg2mZf7SUP
cgj0+s7olFkxZie1tSIGISUesMhHLJiYzKDyUCLK93M4bUiCFc6Hq7YGkw/Vfc7I
YXemrFhizh8o8pYiC2p2Iyd8GfuEtYTgDO28gTwS+xUp/lVR6Lcz1mYYihpO0Aeo
u6zDqDFxNdfNMDBfUHT48AHdDML+CnahA6EGLYBybMU8UR5Tm074Uvy2ZsLxclaW
tciYgmz7iZcw6ScEWOV7fitcktw4HDVig6n+rtlMs/vzGp1jmhIPR3zS3tN/m0iL
qDZcnmHAw7YE6Deb3EuSaD0cDUAzE6dnegTbol/1QQKBgQD0i84WupukGeuw7r5n
/vqPqgU57WbmYBkW8xtL4tWfYr/BeD1pPwc5Z9AP4MpKUIV/vBWNMD4KNLsMcJ54
hYCB6vqLtITkQ5akYd9rsdrNXkpjeL/a+ZEDfiNWdQHBTa2hr8aqaZaVw8CeST+O
2WSCFHRAatQ9qhuWlYuGCvx4uQKBgQDR2RNSpdwKSNpW5Pg9cLIXfORBed2axlMA
TBmWDe9KNqZXmSsTEfEug7UOmz0PMhaS5Bynd9NH3xXEWVNZMHI/JcewJsBaE/2c
0kr6LAepiRClmTzsNO/z1KKGiL8L/lNz62YOqkKz75r5Eq/B6AnNrGhks2T0bsFx
OLupgJrm7QKBgQDu4rNLmLb5syh+CnqN9JKnTJsWX0apvS5FMO51Tv0HWdugDulO
qndQKI0jNZ/mwInoob8b0QiJx8EBAfKMIT3Lq9NcLdezdCLwKXurJG5tN7LLQOWJ
70ktdEbo6hvwzQTUcXVMeyDS5AqBlWQ1E0APohN96d2y7z1L+IH3SzweYQKBgQC0
RkU4Ui53U2DnF2s+9Qq57Nv2d+ftqAT0E2xDoZL5cXtzc60yg85rRFCNzMUmwcPs
yzTmlaUXcEm11Xsp+tma8CzdYl0KxXOxfmNVCfBHL+3yJXPWBCBDm19ILj/Z4NH2
mrqhTJljFStQYEJHVbzeSQehww+ugVuDldZ55nasfQKBgQCgXqAtRvAjNyKlmnxp
dBzvjnQuibjiCPuMioFzfkZi6pBDzp4X+4EDdqhQtIDU9LZ+Gcy+SRKBk7GkD9rx
qV3WgyrINlPR45XNby6SyN6OlMXcVoY81Wb4FmSR+xh6WBG0sU9xiyRQkCdqVSMx
mgoSxhZeie4GNWJHgPKqN2Sm7g==
-----END PRIVATE KEY-----
`

// ── Init ──────────────────────────────────────────────────────────────────────
initializeApp({ credential: cert({ projectId: PROJECT_ID, clientEmail: CLIENT_EMAIL, privateKey: PRIVATE_KEY }) })
const db = getFirestore()

// ── Cutoff: bugünün başı Türkiye saatiyle (UTC+3) ────────────────────────────
const now = new Date()
const turkeyOffsetMs = 3 * 60 * 60 * 1000
const todayTurkey = new Date(now.getTime() + turkeyOffsetMs)
todayTurkey.setUTCHours(0, 0, 0, 0)
const cutoff = todayTurkey.getTime() - turkeyOffsetMs
console.log('Cutoff (silme sınırı):', new Date(cutoff).toISOString(), '(Türkiye geceyarısı)')

// ── Sil ──────────────────────────────────────────────────────────────────────
const SKIP = new Set(['published', 'skipped'])
const col = db.collection('newsQueue')
let totalDeleted = 0
const details = {}
let round = 0
let lastDoc = null  // cursor for pagination

while (true) {
  round++
  let q = col
    .where('createdAt', '<', cutoff)
    .orderBy('createdAt', 'asc')
    .limit(400)
  if (lastDoc) q = q.startAfter(lastDoc)

  const snap = await q.get()

  if (snap.empty) {
    console.log(`Round ${round}: bitti.`)
    break
  }

  const batch = db.batch()
  let batchCount = 0
  for (const doc of snap.docs) {
    const status = doc.data().status ?? 'unknown'
    if (SKIP.has(status)) {
      // say but don't delete
      details[`skip_${status}`] = (details[`skip_${status}`] ?? 0) + 1
      continue
    }
    batch.delete(doc.ref)
    details[status] = (details[status] ?? 0) + 1
    batchCount++
    totalDeleted++
  }

  if (batchCount > 0) await batch.commit()
  console.log(`Round ${round}: ${batchCount} silindi, ${snap.docs.length - batchCount} atlandı (toplam silinen: ${totalDeleted})`)

  lastDoc = snap.docs[snap.docs.length - 1]
  if (snap.docs.length < 400) break
}

console.log('\n✅ Tamamlandı!')
console.log(`Toplam silinen: ${totalDeleted}`)
console.log('Durum dağılımı:', details)
process.exit(0)

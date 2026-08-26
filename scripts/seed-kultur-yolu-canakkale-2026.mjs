#!/usr/bin/env node
/**
 * Seed Türkiye Kültür Yolu Festivali Çanakkale 2026 events into Firestore.
 *
 * Posters: public/events/canakkale/kultur-yolu-2026/gun-N.jpg
 * Collection: events  (citySlug: 'canakkale', status: 'published')
 * Doc ID pattern: kultur-yolu-2026-canakkale-{slug}
 *
 * Idempotent — safe to run multiple times (upsert by doc id).
 *
 * Usage:
 *   cd ~/nahaber
 *   node scripts/seed-kultur-yolu-canakkale-2026.mjs
 *   node scripts/seed-kultur-yolu-canakkale-2026.mjs --dry-run
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const DRY_RUN = process.argv.includes('--dry-run')
const root = process.cwd()

// ─── Env loader ──────────────────────────────────────────────────────────────

function loadEnvFile(filename) {
  const path = join(root, filename)
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile('.env.local')
loadEnvFile('.env')

// ─── Firebase Admin init ──────────────────────────────────────────────────────

function readServiceAccount() {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw)
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return { projectId: parsed.project_id, clientEmail: parsed.client_email, privateKey: parsed.private_key }
      }
    } catch {}
  }
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()
  if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey }
  return null
}

function initAdmin() {
  if (getApps().length > 0) return getFirestore(getApps()[0])
  const sa = readServiceAccount()
  if (!sa) throw new Error('Firebase service account credentials not found in .env.local')
  const app = initializeApp({ credential: cert(sa) })
  return getFirestore(app)
}

// ─── Event data ───────────────────────────────────────────────────────────────
// Times are local Turkey time (UTC+3). startsAt / endsAt stored as ISO UTC.
// TRT → UTC: subtract 3 hours

const CITY = 'Çanakkale'
const CITY_SLUG = 'canakkale'
const ORGANIZER = 'T.C. Kültür ve Turizm Bakanlığı'
const PROVIDER = 'Türkiye Kültür Yolu Festivali'
const MAIN_VENUE = 'Anadolu Hamidiye Tabyası Açık Hava Sahnesi'
const SOURCE = 'firestore'
const BASE_IMG = '/events/canakkale/kultur-yolu-2026'
const TAGS = ['ücretsiz', 'kültür-yolu', 'festival', '2026']

// Helper: "2026-08-29 21:00" TRT → UTC ISO
function trt(dateStr, timeStr = '00:00') {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+03:00`)
  return d.toISOString()
}

const EVENTS = [
  // ── Festival Boyunca (29 Ağu – 06 Eyl) ──────────────────────────────────
  {
    slug: 'festival-boyunca',
    title: 'Türkiye Kültür Yolu Festivali Çanakkale 2026 — Festival Boyunca Etkinlikler',
    description: `Türkiye Kültür Yolu Festivali kapsamında Çanakkale'de 29 Ağustos – 06 Eylül 2026 tarihleri arasında festival boyunca süren etkinlikler:

📍 SERGİ — Osmanlı'nın Mukaddes Emanetleri
Troya Müzesi | 08.30–20.00

📍 SERGİ — Yaşayan Miras: Çanakkale Sergisi
Anadolu Hamidiye Tabyası Hangar | 10.00–22.00

🎬 ETKİNLİK — Yaşayan Miras: Kısa Film Gösterimleri
Anadolu Hamidiye Tabyası Hangar | 10.00–22.00

🎪 ÇOCUK ETKİNLİĞİ — Çocuk Köyü
Şişme oyun parkları, dijital oyunlar, panayır çadırları, atölye çalışmaları, geleneksel Karagöz atölyesi, VR balon turu
Anadolu Hamidiye Tabyası Çocuk Etkinlik Alanı | 15.00–20.00`,
    category: 'exhibition',
    venue: 'Troya Müzesi & Anadolu Hamidiye Tabyası Hangar',
    address: 'Çanakkale Merkez',
    startsAt: trt('2026-08-29', '08:30'),
    endsAt: trt('2026-09-06', '22:00'),
    coverImageUrl: `${BASE_IMG}/festival-boyunca.jpg`,
    isFree: true,
    tags: TAGS,
  },

  // ── 1. Gün — 29 Ağustos Cumartesi ────────────────────────────────────────
  {
    slug: 'gun-1-29-agustos',
    title: '1. Gün — 29 Ağustos Cumartesi | Türkiye Kültür Yolu Festivali Çanakkale',
    description: `Türkiye Kültür Yolu Festivali Çanakkale — 1. Gün programı (29 Ağustos Cumartesi):

🏛️ ETKİNLİK — Uzman Eşliğinde Gezi: Troya Antik Kenti
Troya Antik Kenti Ören Yeri | 18.00–20.00

📚 ÇOCUK ETKİNLİĞİ — Gelincik Neden Kırmızı?
Çanakkale Mehmet Akif Ersoy İl Halk Kütüphanesi | 11.30

🎬 ÇOCUK ETKİNLİĞİ — 22. TÜRSAK Çocuk Filmleri Festivali
Çanakkale 17 Burda AVM

🎨 ÇOCUK ATÖLYESİ — Ebrû Atölyesi
Anadolu Hamidiye Tabyası Hangar | 13.00–14.00`,
    category: 'festival',
    venue: MAIN_VENUE,
    address: 'Anadolu Hamidiye Tabyası, Çanakkale',
    startsAt: trt('2026-08-29', '11:30'),
    endsAt: trt('2026-08-29', '20:00'),
    coverImageUrl: `${BASE_IMG}/gun-1.jpg`,
    isFree: true,
    tags: TAGS,
  },

  // ── 2. Gün — 30 Ağustos Pazar ─────────────────────────────────────────────
  {
    slug: 'gun-2-30-agustos',
    title: '2. Gün — Kıraç Konseri | Türkiye Kültür Yolu Festivali Çanakkale',
    description: `Türkiye Kültür Yolu Festivali Çanakkale — 2. Gün programı (30 Ağustos Pazar):

🎤 KONSER — Kıraç
Anadolu Hamidiye Tabyası Açık Hava Sahnesi | 21.00

🎺 KONSER — Çanakkale Boğaz Komutanlığı Bandosu
Anadolu Hamidiye Tabyası Açık Hava Sahnesi | 20.15

🏺 ATÖLYESİ — Seramik Atölyesi
Anadolu Hamidiye Tabyası Hangar | 13.00 / 14.30

🏺 ÇOCUK ATÖLYESİ — Seramik Atölyesi
Anadolu Hamidiye Tabyası Hangar | 11.00–12.30

🎬 ÇOCUK ETKİNLİĞİ — 22. TÜRSAK Çocuk Filmleri Festivali
Çanakkale 17 Burda AVM`,
    category: 'concert',
    venue: MAIN_VENUE,
    address: 'Anadolu Hamidiye Tabyası, Çanakkale',
    startsAt: trt('2026-08-30', '21:00'),
    endsAt: trt('2026-08-30', '23:30'),
    coverImageUrl: `${BASE_IMG}/gun-2.jpg`,
    isFree: true,
    tags: TAGS,
  },

  // ── 3. Gün — 31 Ağustos Pazartesi ────────────────────────────────────────
  {
    slug: 'gun-3-31-agustos',
    title: '3. Gün — Bengü Konseri | Türkiye Kültür Yolu Festivali Çanakkale',
    description: `Türkiye Kültür Yolu Festivali Çanakkale — 3. Gün programı (31 Ağustos Pazartesi):

🎤 KONSER — Bengü
Anadolu Hamidiye Tabyası Açık Hava Sahnesi | 21.00

🎨 ATÖLYESİ — Ebrû Atölyesi
Anadolu Hamidiye Tabyası Hangar | 13.30 / 15.00

🏛️ ETKİNLİK — Uzman Eşliğinde Gezi: Assos
Assos Ören Yeri | 18.00–20.00

🎨 ÇOCUK ATÖLYESİ — Ebrû Atölyesi
Anadolu Hamidiye Tabyası Hangar | 12.00–13.00

🏛️ ÇOCUK ETKİNLİĞİ — Kültür Koruyucuları
Troya Müzesi | 14.00–16.00

🎬 ÇOCUK ETKİNLİĞİ — 22. TÜRSAK Çocuk Filmleri Festivali
Çanakkale 17 Burda AVM`,
    category: 'concert',
    venue: MAIN_VENUE,
    address: 'Anadolu Hamidiye Tabyası, Çanakkale',
    startsAt: trt('2026-08-31', '21:00'),
    endsAt: trt('2026-08-31', '23:30'),
    coverImageUrl: `${BASE_IMG}/gun-3.jpg`,
    isFree: true,
    tags: TAGS,
  },

  // ── 4. Gün — 01 Eylül Salı ───────────────────────────────────────────────
  {
    slug: 'gun-4-01-eylul',
    title: '4. Gün — Oğuzhan Koç Konseri | Türkiye Kültür Yolu Festivali Çanakkale',
    description: `Türkiye Kültür Yolu Festivali Çanakkale — 4. Gün programı (01 Eylül Salı):

🎤 KONSER — Oğuzhan Koç
Anadolu Hamidiye Tabyası Açık Hava Sahnesi | 21.00

🧶 ATÖLYESİ — Keçe Atölyesi
Anadolu Hamidiye Tabyası Hangar | 11.00 / 13.00 / 15.00

🖼️ ETKİNLİK — İz Bırakan Eller: Çanakkale'nin Ortak Hafızası
Devlet Güzel Sanatlar Galerisi Bahçe | 12.30–16.30

🎭 ETKİNLİK — Perdeler Açılıyor
Troya Müzesi | 15.00–17.00

🌳 ÇOCUK ETKİNLİĞİ — Yürüyen Ağaç
Çanakkale Mehmet Akif Ersoy İl Halk Kütüphanesi | 11.30

🎬 ÇOCUK ETKİNLİĞİ — 22. TÜRSAK Çocuk Filmleri Festivali
Çanakkale 17 Burda AVM`,
    category: 'concert',
    venue: MAIN_VENUE,
    address: 'Anadolu Hamidiye Tabyası, Çanakkale',
    startsAt: trt('2026-09-01', '21:00'),
    endsAt: trt('2026-09-01', '23:30'),
    coverImageUrl: `${BASE_IMG}/gun-4.jpg`,
    isFree: true,
    tags: TAGS,
  },

  // ── 5. Gün — 02 Eylül Çarşamba ───────────────────────────────────────────
  {
    slug: 'gun-5-02-eylul',
    title: '5. Gün — Özcan Deniz Konseri | Türkiye Kültür Yolu Festivali Çanakkale',
    description: `Türkiye Kültür Yolu Festivali Çanakkale — 5. Gün programı (02 Eylül Çarşamba):

🎤 KONSER — Özcan Deniz
Anadolu Hamidiye Tabyası Açık Hava Sahnesi | 21.00

🧵 ATÖLYESİ — İğne Oyası Atölyesi
Anadolu Hamidiye Tabyası Hangar | 11.00 / 13.00 / 15.00

💬 SÖYLEŞİ — Çanakkale Ruhu
Çanakkale Mehmet Akif Ersoy İl Halk Kütüphanesi | 14.00

🏛️ SEMPOZYUM — Prof. Dr. Ümit Serdaroğlu V. Troas Sempozyumu
Troya Müzesi | 14.00–17.00

🎭 ETKİNLİK — Perdeler Açılıyor
Troya Müzesi | 15.00–17.00

🎬 ÇOCUK ETKİNLİĞİ — 22. TÜRSAK Çocuk Filmleri Festivali
Çanakkale 17 Burda AVM`,
    category: 'concert',
    venue: MAIN_VENUE,
    address: 'Anadolu Hamidiye Tabyası, Çanakkale',
    startsAt: trt('2026-09-02', '21:00'),
    endsAt: trt('2026-09-02', '23:30'),
    coverImageUrl: `${BASE_IMG}/gun-5.jpg`,
    isFree: true,
    tags: TAGS,
  },

  // ── 6. Gün — 03 Eylül Perşembe ───────────────────────────────────────────
  {
    slug: 'gun-6-03-eylul',
    title: '6. Gün — Simge Konseri | Türkiye Kültür Yolu Festivali Çanakkale',
    description: `Türkiye Kültür Yolu Festivali Çanakkale — 6. Gün programı (03 Eylül Perşembe):

🎤 KONSER — Simge
Anadolu Hamidiye Tabyası Açık Hava Sahnesi | 21.00

🏺 ATÖLYESİ — Seramik Atölyesi
Anadolu Hamidiye Tabyası Hangar | 11.00–13.00

🧸 ATÖLYESİ — Geleneksel Bez Bebek Yapım Atölyesi
Anadolu Hamidiye Tabyası Hangar | 13.30 / 15.00

🎭 TİYATRO — Tamamen Doluyuz (Ücretli)
ÇOMÜ İÇDAŞ Kara Yusuf Kongre Merkezi | 20.00

🏛️ SEMPOZYUM — Prof. Dr. Ümit Serdaroğlu V. Troas Sempozyumu
Troya Müzesi | 14.00–17.00

🏛️ ETKİNLİK — Uzman Eşliğinde Gezi: Apollon Smintheion
Apollon Smintheion Ören Yeri | 18.00–20.00

🎭 ETKİNLİK — Perdeler Açılıyor
Troya Müzesi | 15.00–17.00

📚 ÇOCUK ETKİNLİĞİ — Kütüphane Yolda (Gezici Kütüphane)
Çanakkale Mehmet Akif Ersoy İl Halk Kütüphanesi | 15.00`,
    category: 'concert',
    venue: MAIN_VENUE,
    address: 'Anadolu Hamidiye Tabyası, Çanakkale',
    startsAt: trt('2026-09-03', '21:00'),
    endsAt: trt('2026-09-03', '23:30'),
    coverImageUrl: `${BASE_IMG}/gun-6.jpg`,
    isFree: true,
    tags: TAGS,
  },

  // ── 7. Gün — 04 Eylül Cuma ───────────────────────────────────────────────
  {
    slug: 'gun-7-04-eylul',
    title: '7. Gün — Sefo Konseri | Türkiye Kültür Yolu Festivali Çanakkale',
    description: `Türkiye Kültür Yolu Festivali Çanakkale — 7. Gün programı (04 Eylül Cuma):

🎤 KONSER — Sefo
Anadolu Hamidiye Tabyası Açık Hava Sahnesi | 21.00

🏺 ATÖLYESİ — Geleneksel Çanakkale Seramik Dekorları ve Kartpostal Tasarımları
Anadolu Hamidiye Tabyası Hangar | 13.00 / 14.30

🪵 ATÖLYESİ — Ahşap Kaşık Yapımı Atölyesi
Anadolu Hamidiye Tabyası Hangar | 16.00–17.00

🎭 TİYATRO — Tamamen Doluyuz (Ücretli)
ÇOMÜ İÇDAŞ Kara Yusuf Kongre Merkezi | 20.00

💬 SÖYLEŞİ — Bilge İnsan: Kişisel Gelişim
Çanakkale Mehmet Akif Ersoy İl Halk Kütüphanesi | 16.00

🎬 ETKİNLİK — Fallen From Olympus Kısa Film Gösterimi
Troya Müzesi | 14.00–15.00

🏛️ ÇOCUK ETKİNLİĞİ — Rehberli Müze Gezisi
Troya Müzesi | 16.00–17.30`,
    category: 'concert',
    venue: MAIN_VENUE,
    address: 'Anadolu Hamidiye Tabyası, Çanakkale',
    startsAt: trt('2026-09-04', '21:00'),
    endsAt: trt('2026-09-04', '23:30'),
    coverImageUrl: `${BASE_IMG}/gun-7.jpg`,
    isFree: true,
    tags: TAGS,
  },

  // ── 8. Gün — 05 Eylül Cumartesi ──────────────────────────────────────────
  {
    slug: 'gun-8-05-eylul',
    title: '8. Gün — Gökhan Türkmen Konseri | Türkiye Kültür Yolu Festivali Çanakkale',
    description: `Türkiye Kültür Yolu Festivali Çanakkale — 8. Gün programı (05 Eylül Cumartesi):

🎤 KONSER — Gökhan Türkmen
Anadolu Hamidiye Tabyası Açık Hava Sahnesi | 21.00

🎵 KONSER — Hoondoo
ÇOMÜ İÇDAŞ Kara Yusuf Kongre Merkezi | 19.00

🌿 ATÖLYESİ — Ekolojik Baskı Resim Atölyesi
Suvare Art Gallery Atölye | 13.00–14.00

🪵 ATÖLYESİ — Ahşap Baskı Atölyesi
Anadolu Hamidiye Tabyası Hangar | 14.30–15.30

👘 ATÖLYESİ — Tahtacı Türkmen Yöresel Kıyafet Yapımı
Anadolu Hamidiye Tabyası Hangar | 16.00–17.00

🪵 ÇOCUK ATÖLYESİ — Ahşap Baskı Atölyesi
Anadolu Hamidiye Tabyası Hangar | 13.00–14.00

💬 SÖYLEŞİ — Kuş Yokuşu ve Japon Şiir Sanatı: Haiku
Çanakkale Mehmet Akif Ersoy İl Halk Kütüphanesi | 15.00

🏛️ ETKİNLİK — Uzman Eşliğinde Gezi: Parion Antik Kenti
Parion Antik Kenti | 18.00–20.00`,
    category: 'concert',
    venue: MAIN_VENUE,
    address: 'Anadolu Hamidiye Tabyası, Çanakkale',
    startsAt: trt('2026-09-05', '21:00'),
    endsAt: trt('2026-09-05', '23:30'),
    coverImageUrl: `${BASE_IMG}/gun-8.jpg`,
    isFree: true,
    tags: TAGS,
  },

  // ── 9. Gün — 06 Eylül Pazar ──────────────────────────────────────────────
  {
    slug: 'gun-9-06-eylul',
    title: '9. Gün — Bayhan Konseri | Türkiye Kültür Yolu Festivali Çanakkale',
    description: `Türkiye Kültür Yolu Festivali Çanakkale — 9. Gün programı (06 Eylül Pazar):

🎤 KONSER — Bayhan
Anadolu Hamidiye Tabyası Açık Hava Sahnesi | 21.00

🏺 ATÖLYESİ — Çini Atölyesi
Anadolu Hamidiye Tabyası Hangar | 11.00 / 13.00 / 15.00

🏛️ ETKİNLİK — Uzman Eşliğinde Gezi: Aleksandria Troas
Aleksandria Troas Antik Kenti | 18.00–20.00`,
    category: 'concert',
    venue: MAIN_VENUE,
    address: 'Anadolu Hamidiye Tabyası, Çanakkale',
    startsAt: trt('2026-09-06', '21:00'),
    endsAt: trt('2026-09-06', '23:30'),
    coverImageUrl: `${BASE_IMG}/gun-9.jpg`,
    isFree: true,
    tags: TAGS,
  },
]

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = initAdmin()
  const nowIso = new Date().toISOString()
  const col = db.collection('events')

  console.log(`\n🌟 Türkiye Kültür Yolu Festivali Çanakkale 2026 — ${DRY_RUN ? 'DRY RUN' : 'SEEDING'}\n`)

  let upserted = 0
  let skipped = 0

  for (const event of EVENTS) {
    const docId = `kultur-yolu-2026-canakkale-${event.slug}`
    const payload = {
      title: event.title,
      description: event.description,
      category: event.category,
      city: CITY,
      citySlug: CITY_SLUG,
      venue: event.venue,
      address: event.address ?? '',
      organizer: ORGANIZER,
      startsAt: event.startsAt,
      endsAt: event.endsAt ?? null,
      coverImageUrl: event.coverImageUrl,
      isFree: event.isFree,
      isPublic: true,
      tags: event.tags,
      ticketUrl: '',
      status: 'published',
      timelineStatus: new Date(event.startsAt) > new Date() ? 'upcoming' : 'past',
      source: SOURCE,
      sourceId: event.slug,
      sourceHash: event.slug,
      provider: PROVIDER,
      createdAt: nowIso,
      syncedAt: nowIso,
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] would upsert: ${docId}`)
      console.log(`    startsAt: ${event.startsAt}`)
      console.log(`    cover:    ${event.coverImageUrl}\n`)
      skipped++
      continue
    }

    try {
      await col.doc(docId).set(payload, { merge: true })
      console.log(`  ✅ ${docId}`)
      upserted++
    } catch (err) {
      console.error(`  ❌ ${docId}: ${err.message}`)
    }
  }

  console.log(`\n${DRY_RUN ? 'DRY RUN complete' : `Done — ${upserted} upserted, ${skipped} skipped`}\n`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})

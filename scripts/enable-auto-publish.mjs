#!/usr/bin/env node
/**
 * Aktif AI editörlerde publishPolicy → AUTO_PUBLISH (DRAFT_ONLY dokunulmaz).
 * Kullanım: node scripts/enable-auto-publish.mjs
 */
import { createRequire } from 'node:module'
import { loadEnvFile } from './newsroom-shared.mjs'

loadEnvFile('.env.local')
loadEnvFile('.env')

const require = createRequire(import.meta.url)

async function main() {
  // Prefer firebase-admin direct update to avoid TS transpile issues
  const admin = require('firebase-admin')
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
    let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || ''
    privateKey = privateKey.replace(/\\n/g, '\n')
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('FIREBASE_ADMIN_* env eksik')
    }
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    })
  }

  const db = admin.firestore()
  const snap = await db.collection('aiEditors').where('status', '==', 'active').limit(100).get()
  const updated = []
  const skipped = []

  for (const doc of snap.docs) {
    const data = doc.data()
    const slug = data.slug || doc.id
    if (data.publishPolicy === 'AUTO_PUBLISH' || data.publishPolicy === 'DRAFT_ONLY') {
      skipped.push(slug)
      continue
    }
    await doc.ref.update({
      publishPolicy: 'AUTO_PUBLISH',
      updatedAt: Date.now(),
    })
    updated.push(slug)
  }

  console.log(JSON.stringify({ updated, skipped, total: snap.size }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

#!/usr/bin/env node
/**
 * Create placeholder objects in Firebase Storage so folder prefixes appear
 * in the Firebase Console. Storage has no real folders — only object paths.
 *
 * Usage:
 *   npm run init-storage
 *
 * Requires Firebase Admin credentials in .env.local (same as server routes).
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'

const root = process.cwd()

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

function readServiceAccount() {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (jsonRaw) {
    const parsed = JSON.parse(jsonRaw)
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      return {
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
      }
    }
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey }
  }

  return null
}

const serviceAccount = readServiceAccount()
if (!serviceAccount) {
  console.error(
    'Missing Firebase Admin credentials. Set FIREBASE_ADMIN_* or FIREBASE_SERVICE_ACCOUNT_JSON in .env.local'
  )
  process.exit(1)
}

const bucketName =
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
  `${serviceAccount.projectId}.appspot.com`

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
    storageBucket: bucketName,
  })
}

const bucket = getStorage().bucket(bucketName)

/** Prefix placeholders — visible as folders in Firebase Console. */
const PLACEHOLDER_PATHS = [
  'events/images/.keep',
  'events/_init/.keep',
  'posts/_init/.keep',
]

const KEEP_BODY = Buffer.from(
  '# NaHaber storage folder placeholder\n# Safe to delete once real files exist.\n',
  'utf8'
)

console.log(`Bucket: ${bucketName}`)
console.log('Creating storage placeholders…')

for (const objectPath of PLACEHOLDER_PATHS) {
  const file = bucket.file(objectPath)
  const [exists] = await file.exists()
  if (exists) {
    console.log(`  skip  ${objectPath} (already exists)`)
    continue
  }

  await file.save(KEEP_BODY, {
    contentType: 'text/plain',
    metadata: {
      cacheControl: 'no-store',
      metadata: { purpose: 'folder-placeholder' },
    },
  })
  console.log(`  created ${objectPath}`)
}

console.log('Done.')

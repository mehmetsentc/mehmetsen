/**
 * READ-ONLY — pilot EULA / termsAcceptedAt state.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const CANON = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}

async function main() {
  loadEnvLocal()
  const { getAdminFirestore } = await import('../src/lib/firebase/admin')
  const { Collections } = await import('../src/lib/firebase/collections')
  const snap = await getAdminFirestore().collection(Collections.USERS).doc(CANON).get()
  const d = snap.exists ? snap.data() : null
  const terms = d?.termsAcceptedAt
  let termsIso: string | null = null
  if (terms && typeof terms.toDate === 'function') termsIso = terms.toDate().toISOString()
  else if (typeof terms === 'string') termsIso = terms
  else if (terms) termsIso = String(terms)
  console.log(
    JSON.stringify(
      {
        exists: snap.exists,
        hasTermsAcceptedAt: Boolean(terms),
        termsAcceptedAt: termsIso,
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error(String(e))
  process.exit(1)
})

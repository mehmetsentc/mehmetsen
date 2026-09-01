import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const file = JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/_phase_p17_7_remediation_out.json'), 'utf8'))
const safe = file.inventory.filter(x => x.remediation_classification === 'SAFE_LICENSED')
console.log('Safe items:', safe)

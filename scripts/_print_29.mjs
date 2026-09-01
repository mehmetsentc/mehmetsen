import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const file = JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/_phase_p17_6a_inventory_out.json'), 'utf8'))
console.log('Total articles:', file.pgArticles.length)
file.pgArticles.forEach((a, i) => {
  console.log(`${i+1}. [${a.id}] ${a.title.slice(0, 60)} | Source: ${a.primary_source_name} | Cluster: ${a.cluster_id}`)
})

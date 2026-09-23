import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function loadP4Env() {
  for (const path of [join(process.cwd(), '.env.local'), '/Users/user/nahaber/.env.local']) {
    if (!existsSync(path)) continue
    const text = readFileSync(path, 'utf8')
    let i = 0
    while (i < text.length) {
      if (text[i] === '#' || text[i] === '\n') {
        const nl = text.indexOf('\n', i)
        i = nl === -1 ? text.length : nl + 1
        continue
      }
      const eq = text.indexOf('=', i)
      if (eq === -1) break
      const key = text.slice(i, eq).trim()
      if (!key || key.includes('\n')) {
        const nl = text.indexOf('\n', i)
        i = nl === -1 ? text.length : nl + 1
        continue
      }
      let j = eq + 1
      let value = ''
      if (text[j] === '"' || text[j] === "'") {
        const q = text[j]!
        j += 1
        while (j < text.length) {
          if (text[j] === '\\' && j + 1 < text.length) {
            const n = text[j + 1]!
            value += n === 'n' ? '\n' : n === 't' ? '\t' : n === q ? q : n
            j += 2
            continue
          }
          if (text[j] === q) {
            j += 1
            break
          }
          value += text[j]
          j += 1
        }
      } else {
        const nl = text.indexOf('\n', j)
        const end = nl === -1 ? text.length : nl
        value = text.slice(j, end).trim()
        j = end
      }
      if (process.env[key] === undefined) process.env[key] = value
      const nl = text.indexOf('\n', j)
      i = nl === -1 ? text.length : nl + 1
    }
  }
}

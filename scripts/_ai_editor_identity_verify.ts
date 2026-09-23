import { loadP4Env } from './_p4_load_env'
import { getAiEditorBySlug } from '../src/lib/ai/editorial/aiEditorService'

loadP4Env()

const slugs = [
  'ulke-abd-spor',
  'ulke-israil-politika',
  'ulke-italya-ekonomi',
  'ulke-japonya-cevre',
  'il-amasya-spor',
  'il-aksaray-yasam',
  'yerel-kastamonu',
  'selin-aras',
  'defne-aksoy',
  'nisa-korhan',
]

async function main() {
  for (const slug of slugs) {
    const e = await getAiEditorBySlug(slug)
    console.log(
      JSON.stringify({
        slug,
        name: e?.name ?? null,
        title: e?.title ?? null,
        hasAvatar: Boolean(e?.avatarUrl),
        hasCover: Boolean(e?.coverUrl),
      })
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

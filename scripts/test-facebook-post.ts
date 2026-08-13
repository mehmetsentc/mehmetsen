/**
 * Manuel Facebook photo post testi.
 *
 * Usage:
 *   npx tsx scripts/test-facebook-post.ts <newsId>
 *   npm run test:facebook-post -- <newsId>
 *
 * Requires env: FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN, Firebase admin creds.
 */
import { testFacebookPost } from '../src/lib/social/facebook'

async function main() {
  const newsId = process.argv[2]?.trim()
  if (!newsId) {
    console.error('Kullanım: npx tsx scripts/test-facebook-post.ts <newsId>')
    process.exit(1)
  }

  console.log(`[test-facebook-post] newsId=${newsId}`)
  const result = await testFacebookPost(newsId)
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.success ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

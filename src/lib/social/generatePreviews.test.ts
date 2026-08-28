import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createStoryCardSharp } from './imageOverlay'

describe('Generate Story Preview Artifacts', () => {
  it('generates visual sample story cards for review', async () => {
    const artifactsDir = path.join(process.cwd(), 'artifacts')
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true })

    const sampleImgPath = path.join(process.cwd(), 'public/events/canakkale/troya-2026/acilis-toreni.jpg')
    const localImgBuf = fs.readFileSync(sampleImgPath)

    // Sample 1: Golden Reference - Beşiktaş silahlı saldırı (Son Dakika)
    const sample1 = await createStoryCardSharp({
      imageSource: localImgBuf,
      title: "Beşiktaş'ta silahlı saldırı: Eski bakanın oğlu bacağından vuruldu",
      summary: "Eski bakan Mehmet Ali Yılmaz'ın oğlu Soner Yılmaz, Bebek'teki evinde uğradığı silahlı saldırıda iki bacağına üç kurşun isabet etti. Ameliyatı başarılı geçti, sağlık durumu stabil.",
      categoryId: 'son-dakika',
      isBreaking: true,
    })
    fs.writeFileSync(path.join(artifactsDir, 'story-sample-besiktas-sondakika.jpg'), sample1)

    // Sample 2: Gündem / Siyaset - Gökçek haberi
    const sample2 = await createStoryCardSharp({
      imageSource: localImgBuf,
      title: 'Gökçek ailesinin yurt dışındaki serveti ifşa oldu',
      summary: "İddiaya göre Gökçek ailesi, Almanya'da kurdukları şirket üzerinden 4,5 milyon avroya Düsseldorf'ta 18 daireli bina ve Velbert'teki alışveriş merkezini satın aldı.",
      categoryId: 'siyaset',
      isBreaking: false,
    })
    fs.writeFileSync(path.join(artifactsDir, 'story-sample-gokcek-siyaset.jpg'), sample2)

    // Sample 3: Çanakkale Yerel Haber
    const sample3 = await createStoryCardSharp({
      imageSource: localImgBuf,
      title: "Çanakkale Boğazı'nda yoğun sis: Gemi trafiği çift yönlü durduruldu",
      summary: 'Kıyı Emniyeti Genel Müdürlüğü, boğazda görüş mesafesinin düşmesi nedeniyle transit gemi geçişlerinin geçici olarak askıya alındığını duyurdu.',
      categoryId: 'canakkale',
      isBreaking: false,
    })
    fs.writeFileSync(path.join(artifactsDir, 'story-sample-canakkale-yerel.jpg'), sample3)

    expect(fs.existsSync(path.join(artifactsDir, 'story-sample-besiktas-sondakika.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(artifactsDir, 'story-sample-gokcek-siyaset.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(artifactsDir, 'story-sample-canakkale-yerel.jpg'))).toBe(true)
  }, 30000)
})

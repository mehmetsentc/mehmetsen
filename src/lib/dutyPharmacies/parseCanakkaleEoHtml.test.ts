import { describe, expect, it } from 'vitest'
import {
  cleanPharmacyName,
  countPharmacies,
  dutyDateFromGroups,
  formatDistrictLabel,
  parseCanakkaleEoHtml,
  parseDutyWindow,
} from '@/lib/dutyPharmacies/parseCanakkaleEoHtml'

const SAMPLE_HTML = `
<div>
  <h3 class="main-color">Bugün Nöbetçi Eczaneler</h3>
  <h3 class="main-color">MERKEZ NÖBETÇİ ECZANELER</h3>
  <div class="col-md-12 nobetci">
    <h4 class="tred"><strong>MERKEZ ECZANESİ</strong></h4>
    <p>
      <i class='fa fa-home main-color'></i> DEMIRCIOGLU CADDESI NO:1 MERKEZ/ÇANAKKALE
      <br><i class='fa fa-phone main-color'></i>
      <a href="tel:2862173440">2862173440</a>
      <br><i class="fa fa-clock-o main-color"></i>
      <strong class="tred">16.08.2026 08:30 - 17.08.2026 08:30 arasında nöbetçidir.</strong><br />
      <a href="https://maps.google.com/maps?q=40.147273,26.406443" target="_blank">Haritada görüntülemek için tıklayınız...</a>
    </p>
  </div>
  <div class="col-md-12 nobetci">
    <h4 class="tred"><strong>EVCİM ECZANESİ  ECZANESİ</strong></h4>
    <p>
      <i class='fa fa-home main-color'></i> HAMİDİYE MAH. KEPEZ/ÇANAKKALE
      <br><i class='fa fa-phone main-color'></i>
      <a href="tel:02862138039">02862138039</a>
      <br><i class="fa fa-clock-o main-color"></i>
      <strong class="tred">16.08.2026 08:30 - 17.08.2026 08:30 arasında nöbetçidir.</strong><br />
      <a href="https://maps.google.com/maps?q=40.098729,26.414608" target="_blank">Haritada görüntülemek için tıklayınız...</a>
    </p>
  </div>
  <h3 class="main-color">AYVACIK/KÜÇÜKKUYU NÖBETÇİ ECZANELER</h3>
  <div class="col-md-12 nobetci">
    <h4 class="tred"><strong>ÇAKIR ECZANESİ</strong></h4>
    <p>
      <i class='fa fa-home main-color'></i> SÜLEYMAN SAKALLI CADDESI NO.10 KÜÇÜKKUYU
      <br><i class='fa fa-phone main-color'></i>
      <a href="tel:2867525477">2867525477</a>
      <br><i class="fa fa-clock-o main-color"></i>
      <strong class="tred">16.08.2026 08:30 - 17.08.2026 08:30 arasında nöbetçidir.</strong>
    </p>
  </div>
  <h3 class="main-color">LAPSEKİ /ÇARDAK NÖBETÇİ ECZANELER</h3>
  <div class="col-md-12 nobetci">
    <h4 class="tred"><strong>KÖKSAL ECZANESİ</strong></h4>
    <p>
      <i class='fa fa-home main-color'></i> TEKKE MAH. ÇARDAK
      <br><i class='fa fa-phone main-color'></i>
      <a href="tel:02865320061">02865320061</a>
      <br><i class="fa fa-clock-o main-color"></i>
      <strong class="tred">16.08.2026 08:30 - 17.08.2026 08:30 arasında nöbetçidir.</strong>
    </p>
  </div>
</div>
`

describe('parseCanakkaleEoHtml', () => {
  it('groups pharmacies by district and cleans duplicated names', () => {
    const groups = parseCanakkaleEoHtml(SAMPLE_HTML)
    expect(groups.map((g) => g.district)).toEqual([
      'Merkez',
      'Ayvacık / Küçükkuyu',
      'Lapseki / Çardak',
    ])
    expect(groups.map((g) => g.districtSlug)).toEqual([
      'merkez',
      'ayvacik-kucukkuyu',
      'lapseki-cardak',
    ])
    expect(countPharmacies(groups)).toBe(4)
    expect(groups[0].pharmacies[0].name).toBe('MERKEZ ECZANESİ')
    expect(groups[0].pharmacies[1].name).toBe('EVCİM ECZANESİ')
    expect(groups[0].pharmacies[0].address).toContain('DEMIRCIOGLU')
    expect(groups[0].pharmacies[0].phone).toBe('2862173440')
    expect(groups[0].pharmacies[0].phoneHref).toBe('tel:2862173440')
    expect(groups[0].pharmacies[0].lat).toBeCloseTo(40.147273)
    expect(groups[0].pharmacies[0].lng).toBeCloseTo(26.406443)
    expect(groups[1].pharmacies[0].mapsUrl).toBeNull()
  })

  it('parses duty windows and snapshot date', () => {
    const groups = parseCanakkaleEoHtml(SAMPLE_HTML)
    expect(parseDutyWindow(groups[0].pharmacies[0].dutyLabel)).toEqual({
      dutyStart: '2026-08-16T08:30:00+03:00',
      dutyEnd: '2026-08-17T08:30:00+03:00',
    })
    expect(dutyDateFromGroups(groups)).toBe('2026-08-16')
  })

  it('skips the generic Bugün heading', () => {
    const groups = parseCanakkaleEoHtml(
      `<h3 class="main-color">Bugün Nöbetçi Eczaneler</h3>
       <div class="col-md-12 nobetci"><h4 class="tred"><strong>X ECZANESİ</strong></h4></div>`
    )
    expect(groups).toEqual([])
  })
})

describe('pharmacy name / district helpers', () => {
  it('collapses duplicated ECZANESİ suffix', () => {
    expect(cleanPharmacyName('EVCİM ECZANESİ  ECZANESİ')).toBe('EVCİM ECZANESİ')
    expect(cleanPharmacyName('YAŞAM ECZANESİ')).toBe('YAŞAM ECZANESİ')
  })

  it('title-cases district labels', () => {
    expect(formatDistrictLabel('MERKEZ')).toBe('Merkez')
    expect(formatDistrictLabel('AYVACIK/KÜÇÜKKUYU')).toBe('Ayvacık / Küçükkuyu')
    expect(formatDistrictLabel('LAPSEKİ /ÇARDAK')).toBe('Lapseki / Çardak')
  })
})

import { describe, expect, it } from 'vitest'
import {
  countPharmacies,
  dutyDateFromGroups,
} from '@/lib/dutyPharmacies/parseCanakkaleEoHtml'
import { parseAntalyaEoHtml } from '@/lib/dutyPharmacies/parseAntalyaEoHtml'

const SAMPLE_HTML = `
<div class="nobetciler">
  <div class="ilce">
    <div class="ilcebas">
      <img src="/Resim/Upload/beyaze.png" style="height:40px;float:left;" />
      <span> Muratpaşa</span>
      <div style="clear:both;"></div>
    </div>
    <div class="nesne row nobetciDiv ">
      <div class="col-md-4 tablo yuksek">
        <div class="hucre hucre-ortala">
          <a href="tel:0242 344 64 74">HİLAL ECZANESİ</a>
          <br />
          <a href="tel:0242 344 64 74">0(242) 344-64-74</a>
        </div>
      </div>
      <div class="col-md-8 tablo yuksek">
        <div class="hucre hucre-ortala">
          <a href="https://maps.google.com/maps?q=36.8943052923,30.6843637283" class="nadres" target="_blank">
            <img src="/Resim/Upload/mapi.png" class="mapi" />
            MEDSTAR ANTALYA HASTANESI KARSISI YILDIZ MAH.220 SK.
          </a>
        </div>
      </div>
    </div>
    <div class="nesne row nobetciDiv ">
      <div class="col-md-4 tablo yuksek">
        <div class="hucre hucre-ortala">
          <a href="tel:0505 039 15 15">HANIMELİ ECZANESİ</a>
          <br />
          <a href="tel:0505 039 15 15">0(505) 039-15-15</a>
        </div>
      </div>
      <div class="col-md-8 tablo yuksek">
        <div class="hucre hucre-ortala">
          <a href="https://maps.google.com/maps?q=36.89,30.70" class="nadres" target="_blank">
            ALTINDAĞ MAH. GÜLLÜK CAD. NO 69/A MURATPAŞA ANTALYA
          </a>
        </div>
      </div>
    </div>
  </div>
  <div class="ilce">
    <div class="ilcebas"><span>Finike</span></div>
    <div class="nesne row nobetciDiv ">
      <div class="col-md-4 tablo yuksek">
        <div class="hucre hucre-ortala">
          <a href="tel:0242 852 20 99">HAMİT ÇOBAN ECZANESİ</a>
          <br />
          <a href="tel:0242 852 20 99">0(242) 852-20-99</a>
        </div>
      </div>
      <div class="col-md-8 tablo yuksek">
        <div class="hucre hucre-ortala">
          <a href="https://maps.google.com/maps?q=36.365,30.133" class="nadres" target="_blank">
            **(GECE SAAT 23.59'A KADAR AÇIK)** TURUNÇOVA MAH.İNÖNÜ CAD. NO : 17/A FİNİKE
          </a>
        </div>
      </div>
    </div>
  </div>
  <div class="ilce">
    <div class="ilcebas"><span>Kemer</span></div>
    <div class="nesne row nobetciDiv ">
      <div class="col-md-4 tablo yuksek">
        <div class="hucre hucre-ortala">
          <a href="tel:">BELDİBİ ECZANESİ</a>
          <br />
          <a href="tel:"></a>
        </div>
      </div>
      <div class="col-md-8 tablo yuksek">
        <div class="hucre hucre-ortala">
          <a href="https://maps.google.com/maps?q=36.70,30.56" class="nadres" target="_blank">
            *(GECE SAAT 02:00'A KADAR AÇIK)* BELDİBİ MAH. ATATÜRK CAD. NO:480/C KEMER
          </a>
        </div>
      </div>
    </div>
  </div>
</div>
`

describe('parseAntalyaEoHtml', () => {
  it('groups pharmacies by ilçe and parses phone/maps', () => {
    const groups = parseAntalyaEoHtml(SAMPLE_HTML)
    expect(groups.map((g) => g.district)).toEqual(['Muratpaşa', 'Finike', 'Kemer'])
    expect(groups.map((g) => g.districtSlug)).toEqual(['muratpasa', 'finike', 'kemer'])
    expect(countPharmacies(groups)).toBe(4)

    const hilal = groups[0].pharmacies[0]
    expect(hilal.name).toBe('HİLAL ECZANESİ')
    expect(hilal.phone).toBe('0(242)344-64-74')
    expect(hilal.phoneHref).toBe('tel:0242 344 64 74')
    expect(hilal.address).toContain('YILDIZ MAH')
    expect(hilal.lat).toBeCloseTo(36.8943052923)
    expect(hilal.lng).toBeCloseTo(30.6843637283)
  })

  it('extracts night-duty notes into dutyLabel and keeps address clean', () => {
    const groups = parseAntalyaEoHtml(SAMPLE_HTML)
    const finike = groups[1].pharmacies[0]
    expect(finike.dutyLabel).toMatch(/GECE SAAT 23\.59'A KADAR AÇIK/i)
    expect(finike.address).toContain('TURUNÇOVA')
    expect(finike.address).not.toMatch(/GECE/i)

    const kemer = groups[2].pharmacies[0]
    expect(kemer.phone).toBe('')
    expect(kemer.phoneHref).toBe('')
    expect(kemer.dutyLabel).toMatch(/GECE SAAT 02:00'A KADAR AÇIK/i)
  })

  it('has no duty window timestamps on Antalya cards', () => {
    const groups = parseAntalyaEoHtml(SAMPLE_HTML)
    expect(dutyDateFromGroups(groups)).toBeNull()
  })
})

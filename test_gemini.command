#!/bin/bash
cd "$(dirname "$0")"

# .env.local'den key'i oku
KEY=$(grep GEMINI_API_KEY .env.local 2>/dev/null | cut -d= -f2 | tr -d '"' | tr -d "'")
if [ -z "$KEY" ]; then
  echo "HATA: GEMINI_API_KEY .env.local'de bulunamadı"
  exit 1
fi

echo "Key prefix: ${KEY:0:8}..."
echo ""
echo "=== Gemini 2.5 Flash API testi ==="

node -e "
const key = '$KEY';
const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + key;

fetch(url, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    contents: [{role:'user', parts:[{text:'Sadece OK yaz.'}]}],
    generationConfig: {maxOutputTokens: 10}
  }),
  signal: AbortSignal.timeout(15000)
})
.then(r => {
  console.log('HTTP Status:', r.status);
  return r.json().then(d => ({status: r.status, data: d}));
})
.then(({status, data}) => {
  if (status === 200) {
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('SONUÇ: ✅ Gemini çalışıyor —', text?.trim());
  } else {
    console.log('SONUÇ: ❌ Hata —', JSON.stringify(data?.error || data).slice(0, 300));
  }
})
.catch(e => console.log('SONUÇ: ❌ Bağlantı hatası —', e.message));
"

echo ""
echo "=== Google Search Grounding testi ==="

node -e "
const key = '$KEY';
const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + key;

fetch(url, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    contents: [{role:'user', parts:[{text:'Bugün Türkiye gündeminde neler var? Kısaca yaz.'}]}],
    tools: [{google_search: {}}],
    generationConfig: {maxOutputTokens: 200, temperature: 0.1}
  }),
  signal: AbortSignal.timeout(20000)
})
.then(r => {
  console.log('HTTP Status:', r.status);
  return r.json().then(d => ({status: r.status, data: d}));
})
.then(({status, data}) => {
  if (status === 200) {
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const queries = data?.candidates?.[0]?.groundingMetadata?.webSearchQueries || [];
    console.log('SONUÇ: ✅ Grounding çalışıyor');
    console.log('Arama sorguları:', queries.join(', ') || '(yok)');
    console.log('Yanıt:', text?.slice(0,200));
  } else {
    console.log('SONUÇ: ❌ Hata —', JSON.stringify(data?.error || data).slice(0, 300));
  }
})
.catch(e => console.log('SONUÇ: ❌ Bağlantı hatası —', e.message));
"

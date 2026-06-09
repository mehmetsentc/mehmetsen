import { WeatherClient } from '@/components/weather/WeatherClient'

export const metadata = {
  title: 'Hava Durumu | NaHaber',
  description: 'Türkiye geneli güncel hava durumu, saatlik ve 7 günlük tahmin',
}

export default function WeatherPage() {
  return <WeatherClient />
}

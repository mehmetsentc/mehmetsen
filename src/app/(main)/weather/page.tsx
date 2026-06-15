import { WeatherClient } from '@/components/weather/WeatherClient'

export const revalidate = 900

export const metadata = {
  title: 'Hava Durumu',
  description: 'Türkiye geneli güncel hava durumu, saatlik ve 7 günlük tahmin',
}

export default function WeatherPage() {
  return <WeatherClient />
}

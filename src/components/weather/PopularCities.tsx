'use client'

interface PopularCitiesProps {
  onSelect: (city: string) => void
}

const POPULAR_CITIES = [
  { name: 'İstanbul', emoji: '🏙️' },
  { name: 'Ankara', emoji: '🏛️' },
  { name: 'İzmir', emoji: '⚓' },
  { name: 'Antalya', emoji: '🏖️' },
  { name: 'Bursa', emoji: '🌿' },
  { name: 'Adana', emoji: '🌶️' },
  { name: 'Trabzon', emoji: '🌊' },
  { name: 'Çanakkale', emoji: '🎯' },
  { name: 'Konya', emoji: '🕌' },
  { name: 'Erzurum', emoji: '❄️' },
  { name: 'Gaziantep', emoji: '🫙' },
  { name: 'Mersin', emoji: '🌴' },
]

export function PopularCities({ onSelect }: PopularCitiesProps) {
  return (
    <div>
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
        Popüler Şehirler
      </p>
      <div className="flex flex-wrap gap-2">
        {POPULAR_CITIES.map(city => (
          <button
            key={city.name}
            type="button"
            onClick={() => onSelect(city.name)}
            className="flex items-center gap-1.5 rounded-full border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm font-semibold text-[rgb(var(--color-text))] transition-all hover:border-[rgb(var(--color-brand))]/50 hover:bg-[rgb(var(--color-brand))]/5 hover:text-[rgb(var(--color-brand))]"
          >
            <span>{city.emoji}</span>
            {city.name}
          </button>
        ))}
      </div>
    </div>
  )
}

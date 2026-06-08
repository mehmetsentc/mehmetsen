// Language configuration and utilities
export type Language = 'tr' | 'en';

export const LANGUAGES = {
    tr: { name: 'Türkçe', flag: '🇹🇷' },
    en: { name: 'English', flag: '🇬🇧' },
};

export const DEFAULT_LANGUAGE: Language = 'tr';

// localStorage key (existing) + cookie names shared with middleware/server layout.
export const LANGUAGE_STORAGE_KEY = 'language';
export const LANGUAGE_COOKIE = 'lang';
export const COUNTRY_COOKIE = 'country';
export const CITY_COOKIE = 'city';

const COOKIE_MAX_AGE_YEAR = 60 * 60 * 24 * 365;

export function isLanguage(value: unknown): value is Language {
    return value === 'tr' || value === 'en';
}

// Geo default: Turkey -> Turkish, everything else -> English.
export function resolveDefaultLanguage(country?: string | null): Language {
    return country?.toUpperCase() === 'TR' ? 'tr' : 'en';
}

// Server/initial resolution. An explicit stored language wins over geo default.
// Falls back to DEFAULT_LANGUAGE only when neither preference nor country is known.
export function resolveInitialLanguage(
    storedLanguage?: string | null,
    country?: string | null
): Language {
    if (isLanguage(storedLanguage)) return storedLanguage;
    if (country) return resolveDefaultLanguage(country);
    return DEFAULT_LANGUAGE;
}

function readCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(
        new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
    );
    return match ? decodeURIComponent(match[1]) : null;
}

// Explicit, user-chosen language (localStorage first, cookie fallback). null when unset.
export function getStoredLanguagePreference(): Language | null {
    if (typeof window === 'undefined') return null;
    try {
        const local = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (isLanguage(local)) return local;
    } catch {
        // ignore storage access errors
    }
    const cookie = readCookie(LANGUAGE_COOKIE);
    return isLanguage(cookie) ? cookie : null;
}

export function getStoredLanguage(): Language {
    return getStoredLanguagePreference() ?? DEFAULT_LANGUAGE;
}

export function setStoredLanguage(lang: Language) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
        // ignore storage access errors
    }
    // Mirror to a cookie so the server layout can render the right language
    // on the next request and avoid a hydration mismatch.
    document.cookie = `${LANGUAGE_COOKIE}=${lang}; path=/; max-age=${COOKIE_MAX_AGE_YEAR}; samesite=lax`;
}

// Client-side fallback used only when there is no stored preference and no geo
// signal (e.g. local dev without CDN headers). Guesses Turkish for Turkey-ish
// environments, otherwise English.
export function guessClientLanguage(): Language {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz === 'Europe/Istanbul') return 'tr';
        const nav = navigator.language?.toLowerCase() ?? '';
        if (nav.startsWith('tr')) return 'tr';
    } catch {
        // ignore environment lookup errors
    }
    return 'en';
}

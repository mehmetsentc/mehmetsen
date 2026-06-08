'use client';

import { useLanguage } from '@/store/languageContext';
import { LANGUAGES, type Language } from '@/lib/i18n';
import { Button } from '@/components/ui/Button';

export function LanguageSwitcher() {
    const { language, setLanguage } = useLanguage();

    return (
        <div className="flex gap-2">
            {(Object.entries(LANGUAGES) as [Language, typeof LANGUAGES[Language]][]).map(
                ([lang, { name, flag }]) => (
                    <Button
                        key={lang}
                        onClick={() => setLanguage(lang)}
                        variant={language === lang ? 'primary' : 'secondary'}
                        size="sm"
                    >
                        <span className="mr-1">{flag}</span>
                        {name}
                    </Button>
                )
            )}
        </div>
    );
}

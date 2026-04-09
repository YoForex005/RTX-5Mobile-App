/**
 * Tiny i18n hook bound to the persisted user-preferences store.
 *
 * Usage:
 *   const { t, language, setLanguage } = useTranslation();
 *   <Text>{t('Settings')}</Text>
 *
 * `t()` falls back to the English key when a translation is missing so
 * unmapped strings still render readable text instead of an empty cell.
 */
import { useCallback } from 'react';
import { useUserPreferences } from '../state/userPreferences';
import { DICTIONARIES, type TranslationKey } from './translations';

export function useTranslation() {
  const language = useUserPreferences((s) => s.language);
  const setLanguage = useUserPreferences((s) => s.setLanguage);

  const t = useCallback(
    (key: TranslationKey | string): string => {
      const dict = DICTIONARIES[language];
      const translated = dict?.[key as TranslationKey];
      return translated ?? key;
    },
    [language],
  );

  return { t, language, setLanguage };
}

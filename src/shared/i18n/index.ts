import { useCallback } from 'preact/hooks';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { en } from './en';
import { ptBR } from './pt-BR';

export type Locale = 'en' | 'pt-BR';

const LOCALE_STORAGE_KEY = 'luma-locale';

const messages: Record<Locale, Record<string, string>> = {
  en,
  'pt-BR': ptBR
};

function resolveLocale(locale: Locale, key: string, params?: Record<string, string | number>): string {
  let msg = messages[locale]?.[key] ?? messages['en']?.[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replace(`{${k}}`, String(v));
    }
  }
  return msg;
}

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: 'en',
      setLocale: (locale: Locale) => set({ locale }),
    }),
    {
      name: LOCALE_STORAGE_KEY
    }
  )
);

export function useI18n() {
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      resolveLocale(locale, key, params),
    [locale]
  );
  return { locale, t, setLocale };
}

export function setLocale(locale: Locale): void {
  useI18nStore.getState().setLocale(locale);
}

export function getLocale(): Locale {
  return useI18nStore.getState().locale;
}

export function t(key: string, params?: Record<string, string | number>): string {
  return resolveLocale(useI18nStore.getState().locale, key, params);
}

export function createT(locale: Locale): (key: string, params?: Record<string, string | number>) => string {
  return (key: string, params?: Record<string, string | number>) =>
    resolveLocale(locale, key, params);
}

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ptBR from './locales/pt-BR/common.json'
import en from './locales/en/common.json'
import es from './locales/es/common.json'

export const APP_LANGUAGE_STORAGE_KEY = 'dragon-arena-language'
export const supportedLanguages = ['pt-BR', 'en', 'es'] as const
export type AppLanguage = (typeof supportedLanguages)[number]

const fallbackLanguage: AppLanguage = 'pt-BR'

const getInitialLanguage = (): AppLanguage => {
  const storedLanguage = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
  if (storedLanguage && supportedLanguages.includes(storedLanguage as AppLanguage)) {
    return storedLanguage as AppLanguage
  }

  return fallbackLanguage
}

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': { translation: ptBR },
      en: { translation: en },
      es: { translation: es },
    },
    lng: getInitialLanguage(),
    fallbackLng: fallbackLanguage,
    interpolation: {
      escapeValue: false,
    },
  })

i18n.on('languageChanged', language => {
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language)
})

export default i18n

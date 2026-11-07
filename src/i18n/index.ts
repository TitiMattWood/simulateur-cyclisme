/**
 * Traductions. Le français est la langue par défaut ; l'anglais est optionnel.
 * Chaque texte affiché passe par t('cle') pour pouvoir changer de langue.
 */
import { fr } from './fr';
import { en } from './en';

export type Lang = 'fr' | 'en';
export type I18nKey = keyof typeof fr;

let current: Lang = 'fr';

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
}

export function getLang(): Lang {
  return current;
}

/** Renvoie le texte traduit ; {nom} est remplacé par params.nom. */
export function t(key: I18nKey, params?: Record<string, string | number>): string {
  const dict: Record<string, string> = current === 'en' ? en : fr;
  let s = dict[key] ?? fr[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

import { Injectable, effect, signal } from '@angular/core';
import { TranslationKey, en, fr } from './translations';

export type Lang = 'fr' | 'en';

/** Langues de l'interface. `dir` prépare les langues écrites de droite à gauche (ex. arabe, ajami). */
export const LANGUAGES: readonly { code: Lang; label: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'en', label: 'English', dir: 'ltr' },
];

const STORAGE_KEY = 'afrivox.lang';
const DICTIONARIES: Record<Lang, Record<TranslationKey, string>> = { fr, en };

/**
 * Traduction à l'exécution (changement de langue sans recharger la page).
 * Les gabarits appellent `i18n.t(...)` : la lecture du signal `lang` les met à jour automatiquement.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly _lang = signal<Lang>(this.initialLang());
  readonly lang = this._lang.asReadonly();

  constructor() {
    // Garde <html lang> et <html dir> alignés avec la langue choisie (lecteurs d'écran, sens de lecture)
    effect(() => {
      const current = LANGUAGES.find((l) => l.code === this._lang());
      document.documentElement.lang = this._lang();
      document.documentElement.dir = current?.dir ?? 'ltr';
    });
  }

  setLang(lang: Lang): void {
    this._lang.set(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // stockage indisponible (navigation privée) : le choix vaut pour la session seulement
    }
  }

  t(key: TranslationKey, params?: Record<string, string | number>): string {
    let text: string = DICTIONARIES[this._lang()][key] ?? key;
    for (const [name, value] of Object.entries(params ?? {})) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  }

  private initialLang(): Lang {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'fr' || stored === 'en') {
        return stored;
      }
    } catch {
      // ignoré : on retombe sur la langue du navigateur
    }
    return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'fr';
  }
}

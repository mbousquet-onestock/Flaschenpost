// Interface language. OneStock opens the extension with ?lang=<code> (and ?locale=<code> for date and
// number formats); outside OneStock the browser language is used. English texts are the keys: a text
// missing from a dictionary is shown in English.
import { fr } from './i18n.fr';

type Dict = Record<string, string>;
const DICTS: Record<string, Dict> = { fr };

export const SUPPORTED_LANGS = ['en', ...Object.keys(DICTS)];

function detect(): { lang: string; locale: string } {
  const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const raw = (params.get('lang') || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en').toLowerCase();
  const lang = raw.split(/[-_]/)[0];
  const locale = params.get('locale') || (lang === 'en' ? 'en-GB' : raw.includes('-') ? raw : `${lang}-${lang.toUpperCase()}`);
  return { lang: DICTS[lang] ? lang : 'en', locale };
}

const { lang, locale } = detect();
export const LANG = lang;
export const LOCALE = (() => {
  try {
    return Intl.getCanonicalLocales(locale)[0];
  } catch {
    return lang === 'fr' ? 'fr-FR' : 'en-GB';
  }
})();

if (typeof document !== 'undefined') document.documentElement.lang = LANG;

/** Translates an English text; {name} placeholders are replaced by `vars`. */
export function t(text: string, vars?: Record<string, string | number>): string {
  const out = DICTS[LANG]?.[text] ?? text;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : out;
}

export const money = (n: number, maxDigits = 2) =>
  n.toLocaleString(LOCALE, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: maxDigits });
export const num = (n: number) => n.toLocaleString(LOCALE);
export const dateTime = (d: Date) => d.toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' });
export const date = (d: Date) => d.toLocaleDateString(LOCALE);

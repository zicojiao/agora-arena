import { Fragment, createElement, useSyncExternalStore, type ReactNode } from 'react';
import { EN } from './i18n/en';
import { ZH } from './i18n/zh';

/**
 * Interface language. It also decides the language the player speaks in: a Chinese interface listens for
 * Chinese, keeps the words in Chinese and writes the FastH3 prompt in Chinese.
 */
export type Lang = 'en' | 'zh';
export type StringKey = keyof typeof EN;

export const LANGS: readonly Lang[] = ['en', 'zh'];
const DICTS: Record<Lang, Record<StringKey, string>> = { en: EN, zh: ZH };
const KEY = 'agora-arena:lang';

const isLang = (value: unknown): value is Lang => value === 'en' || value === 'zh';

/** `?lang=` wins (shareable links), then the saved choice, then the browser language. Node and tests get English. */
function initialLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  try {
    const query = new URLSearchParams(window.location.search).get('lang');
    if (isLang(query)) return query;
    const saved = window.localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch { /* storage blocked: fall through to the browser language */ }
  return /^zh\b/i.test(window.navigator?.language ?? '') ? 'zh' : 'en';
}

let current: Lang = initialLang();
const listeners = new Set<() => void>();

function applyDocument(lang: Lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = DICTS[lang]['doc.title'];
}
applyDocument(current);

export const getLang = (): Lang => current;

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  try { window.localStorage.setItem(KEY, lang); } catch { /* private mode: the choice lasts for this visit */ }
  applyDocument(lang);
  listeners.forEach(fn => fn());
}

/** Translate `key` in the current language; `{name}` placeholders are filled from `vars`. */
export function t(key: StringKey, vars?: Record<string, string | number>, lang: Lang = current): string {
  const text = DICTS[lang][key] ?? EN[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all)) : text;
}

/** Like `t`, but placeholders become React nodes (for bold names inside a sentence). */
export function tNodes(key: StringKey, nodes: Record<string, ReactNode>): ReactNode {
  const parts = t(key).split(/\{(\w+)\}/);
  return parts.map((part, i) => createElement(Fragment, { key: i }, i % 2 ? (nodes[part] ?? `{${part}}`) : part));
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Re-render on language change. Returns the language; `t` already reads it. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => 'en');
}

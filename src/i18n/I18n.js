import { EN_TRANSLATIONS } from './Translations.js';

export class Localization {
  constructor(storage) {
    this.language = 'ru';
    this.listeners = new Set();
    this.key = 'cyber-core.language.v1';
    try {
      this.storage = storage === undefined ? globalThis.localStorage : storage;
      const saved = this.storage?.getItem(this.key);
      if (saved === 'en' || saved === 'ru') this.language = saved;
    } catch { this.storage = null; }
  }

  get locale() { return this.language === 'en' ? 'en-US' : 'ru-RU'; }
  get label() { return this.language === 'en' ? 'English' : 'Русский'; }

  t(source, values = {}) {
    const template = this.language === 'en' ? EN_TRANSLATIONS[source] ?? source : source;
    return template.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
  }

  setLanguage(language) {
    if (!['ru', 'en'].includes(language) || language === this.language) return false;
    this.language = language;
    try { this.storage?.setItem(this.key, language); } catch { /* Session-only preference. */ }
    for (const callback of this.listeners) callback(language);
    return true;
  }

  toggle() { this.setLanguage(this.language === 'ru' ? 'en' : 'ru'); }
  onChange(callback) { this.listeners.add(callback); return () => this.listeners.delete(callback); }

  // Bind static HTML once, before dynamic cards are created. Language changes do
  // not replace DOM elements, listeners, current values or the active game session.
  bindDOM(root) {
    if (!root?.ownerDocument?.createTreeWalker) return [];
    const bindings = [], document = root.ownerDocument;
    const walker = document.createTreeWalker(root, 4);
    let node;
    while ((node = walker.nextNode())) {
      if (['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName)) continue;
      const raw = node.nodeValue;
      if (!/[А-Яа-яЁё]/.test(raw)) continue;
      bindings.push({ node, source: raw.trim().replace(/\s+/g, ' '),
        prefix: raw.match(/^\s*/)[0], suffix: raw.match(/\s*$/)[0] });
    }
    for (const element of [root, ...root.querySelectorAll('*')]) {
      for (const attribute of ['title', 'aria-label', 'placeholder', 'alt']) {
        const source = element.getAttribute(attribute);
        if (source && /[А-Яа-яЁё]/.test(source)) bindings.push({ node: element, attribute, source });
      }
    }
    return bindings;
  }

  translateDOM(bindings) {
    for (const { node, attribute, source, prefix = '', suffix = '' } of bindings) {
      if (attribute) node.setAttribute(attribute, this.t(source));
      else node.nodeValue = prefix + this.t(source) + suffix;
    }
  }
}

export const i18n = new Localization();
export const t = (source, values) => i18n.t(source, values);

import copy from './copying-interface-en.json';
import { getLocaleContext } from '$lib/stores/locale.svelte';

/** Translate explicit interface literals only. Never pass user or scripture content here. */
export function createInterfaceTranslator() {
  const locale = getLocaleContext();
  const translate = (source: string, ...values: unknown[]): string => {
    const text = locale.current === 'en' && Object.prototype.hasOwnProperty.call(copy, source)
    ? (copy as Record<string, string>)[source]
    : source;
    return text.replace(/\{(\d+)\}/gu, (marker, index) => Number(index) < values.length ? String(values[Number(index)]) : marker);
  };
  return Object.assign(translate, { locale: () => locale.current === 'en' ? 'en-GB' : 'vi-VN' });
}
